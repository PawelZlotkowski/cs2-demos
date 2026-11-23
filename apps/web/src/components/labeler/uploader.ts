"use client";

/**
 * Browser side of the import: read an exported folder, check every MP4 against its manifest
 * entry (size and SHA-256), register metadata in small batches, then upload the bytes straight
 * to private R2 with presigned part URLs. At most three part requests run at once across all
 * files. Interrupted uploads resume from the parts R2 already holds.
 */
import { clipManifestSchema, type ClipManifest, type ManifestClip } from "@/lib/labeler/manifest";
import { api, ApiError } from "./api";

export type TaskState =
  | "waiting"
  | "missing"
  | "checking"
  | "registered"
  | "uploading"
  | "completing"
  | "ready"
  | "failed"
  | "expired";

export interface UploadTask {
  footageId: string;
  entry: ManifestClip;
  file: File | null;
  clipId: string | null;
  state: TaskState;
  sent: number;
  error: string | null;
}

export interface Selection {
  manifest: ClipManifest | null;
  files: Map<string, File>;
  problems: string[];
}

export async function readSelection(list: FileList | File[]): Promise<Selection> {
  const files = new Map<string, File>();
  let manifestFile: File | null = null;
  for (const file of Array.from(list)) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    // Folder pickers give "export-folder/clips/x.mp4"; plain multi-select gives "x.mp4".
    const parts = relative.split("/").filter(Boolean);
    const inner = parts.length > 1 ? parts.slice(1).join("/") : file.name;
    if (inner === "manifest.json" || file.name === "manifest.json") manifestFile = manifestFile ?? file;
    else if (/\.mp4$/i.test(file.name)) files.set(inner.startsWith("clips/") ? inner : `clips/${file.name}`, file);
  }
  if (!manifestFile) return { manifest: null, files, problems: ["Choose the exported folder, or select its manifest.json together with the MP4 files."] };
  if (manifestFile.size > 32 * 1024 * 1024) return { manifest: null, files, problems: ["manifest.json is unexpectedly large."] };
  let raw: unknown;
  try {
    raw = JSON.parse(await manifestFile.text());
  } catch {
    return { manifest: null, files, problems: ["manifest.json is not valid JSON."] };
  }
  const parsed = clipManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      manifest: null,
      files,
      problems: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "manifest"}: ${issue.message}`),
    };
  }
  return { manifest: parsed.data, files, problems: [] };
}

export function tasksFor(selection: Selection): UploadTask[] {
  if (!selection.manifest) return [];
  return selection.manifest.clips.map((entry) => {
    const file = selection.files.get(entry.path) ?? null;
    const wrongSize = file && file.size !== entry.bytes;
    return {
      footageId: entry.footageId,
      entry,
      file: wrongSize ? null : file,
      clipId: null,
      state: file && !wrongSize ? "waiting" : "missing",
      sent: 0,
      error: !file ? "File not selected." : wrongSize ? "File size differs from the manifest." : null,
    };
  });
}

/** Registers manifest metadata (no media) in batches far below the 4.5 MB request limit. */
export async function register(collectionId: string, manifest: ClipManifest, tasks: UploadTask[], update: (task: UploadTask) => void) {
  for (let i = 0; i < tasks.length; i += 25) {
    const batch = tasks.slice(i, i + 25);
    const used = new Set(batch.map((t) => t.entry.matchId));
    const demos = Object.fromEntries(Object.entries(manifest.demos).filter(([id]) => used.has(id)));
    const result = await api<{ clips: Array<{ footageId: string; sha256: string; clipId: string; mediaState: string }> }>(
      `/admin/collections/${collectionId}/import`,
      { body: { demos, clips: batch.map((t) => t.entry) } },
    );
    for (const row of result.clips) {
      const task = batch.find((t) => t.footageId === row.footageId && t.entry.sha256 === row.sha256);
      if (!task) continue;
      task.clipId = row.clipId;
      if (row.mediaState === "ready") {
        task.state = "ready";
        task.sent = task.entry.bytes;
        task.error = null;
      } else if (task.state !== "missing") task.state = "registered";
      update(task);
    }
  }
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

class Gate {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly limit: number) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

/** Three part requests at once across every upload on this page. */
const parts = new Gate(3);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Begin {
  ready?: boolean;
  upload?: { id: string; partSize: number; partCount: number; expectedBytes: number };
  completedParts?: Array<{ partNumber: number; size: number }>;
  needsCompletion?: boolean;
}

async function putPart(url: string, body: Blob): Promise<string> {
  const response = await fetch(url, { method: "PUT", body, credentials: "omit", cache: "no-store" });
  if (!response.ok) throw new ApiError(response.status, `Cloud storage refused a part (${response.status}).`);
  const etag = response.headers.get("ETag");
  if (!etag) throw new ApiError(0, "Cloud storage did not expose the ETag header. Check the bucket CORS policy.");
  return etag;
}

export async function uploadTask(task: UploadTask, update: (task: UploadTask) => void): Promise<void> {
  if (!task.file || !task.clipId || task.state === "ready") return;
  const file = task.file;
  try {
    task.state = "checking";
    task.error = null;
    update(task);
    // The exporter computed this hash locally; recheck the exact bytes chosen in the browser.
    const digest = await sha256(file);
    if (digest !== task.entry.sha256) throw new Error("This file's SHA-256 differs from the manifest. Export the clip again.");

    for (let round = 0; round < 3; round += 1) {
      const begin = await api<Begin>("/admin/uploads", { body: { clipId: task.clipId, sha256: digest, bytes: file.size } });
      if (begin.ready) break;
      const upload = begin.upload!;
      const done = new Map((begin.completedParts ?? []).map((p) => [p.partNumber, p.size]));
      task.state = "uploading";
      task.sent = [...done.values()].reduce((sum, size) => sum + size, 0);
      update(task);
      if (!begin.needsCompletion) {
        const missing = Array.from({ length: upload.partCount }, (_, i) => i + 1).filter((n) => !done.has(n));
        const reports: Array<{ partNumber: number; etag: string; bytes: number }> = [];
        for (let i = 0; i < missing.length; i += 6) {
          const wanted = missing.slice(i, i + 6);
          const signed = await api<{ urls: Array<{ partNumber: number; size: number; url: string }> }>(`/admin/uploads/${upload.id}/parts`, {
            body: { partNumbers: wanted, completed: reports.splice(0, reports.length) },
          });
          await Promise.all(
            signed.urls.map((part) =>
              parts.run(async () => {
                const start = (part.partNumber - 1) * upload.partSize;
                const blob = file.slice(start, start + part.size);
                let url = part.url;
                for (let attempt = 0; ; attempt += 1) {
                  try {
                    const etag = await putPart(url, blob);
                    reports.push({ partNumber: part.partNumber, etag, bytes: part.size });
                    task.sent += part.size;
                    update(task);
                    return;
                  } catch (error) {
                    if (attempt >= 4) throw error;
                    await sleep(1000 * 2 ** attempt);
                    if (error instanceof ApiError && error.status === 403) {
                      // An expired part URL is replaced by a freshly signed one.
                      const again = await api<{ urls: Array<{ url: string }> }>(`/admin/uploads/${upload.id}/parts`, {
                        body: { partNumbers: [part.partNumber], completed: [] },
                      });
                      url = again.urls[0].url;
                    }
                  }
                }
              }),
            ),
          );
        }
        if (reports.length) await api(`/admin/uploads/${upload.id}/parts`, { body: { partNumbers: [], completed: reports } });
      }
      task.state = "completing";
      update(task);
      try {
        await api(`/admin/uploads/${upload.id}/complete`, { body: {} });
        break;
      } catch (error) {
        // Missing parts or an expired upload: begin again, which resumes or restarts cleanly.
        if (error instanceof ApiError && (error.status === 409 || error.status === 410) && round < 2) continue;
        throw error;
      }
    }
    task.state = "ready";
    task.sent = task.entry.bytes;
    task.error = null;
    update(task);
  } catch (error) {
    task.state = error instanceof ApiError && error.status === 410 ? "expired" : "failed";
    task.error = error instanceof Error ? error.message : "The upload failed.";
    update(task);
  }
}

/** Uploads every registered task, two files at a time (parts are limited separately). */
export async function uploadAll(tasks: UploadTask[], update: (task: UploadTask) => void): Promise<void> {
  const queue = tasks.filter((t) => t.file && t.clipId && t.state !== "ready");
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
    for (let task = queue.shift(); task; task = queue.shift()) await uploadTask(task, update);
  });
  await Promise.all(workers);
}
