/**
 * Multipart upload orchestration. R2 and PostgreSQL cannot share a transaction, so every step
 * is retry-safe: the database stores the upload session (bucket, key, upload ID, expected size
 * and hash, recorded parts), R2's ListParts is authoritative on resume, completion uses
 * If-None-Match and a per-upload key, and a clip becomes ready exactly once after its object
 * size, type and SHA-256 have been checked on the server.
 */
import { LabelerError, rpc } from "./db";
import { labelerConfig, PART_URL_SECONDS, UPLOAD_EXPIRY_SECONDS } from "./config";
import { objectStore, type StoredPart } from "./r2";

export interface UploadRow {
  id: string;
  clipId: string;
  bucket: string;
  objectKey: string;
  r2UploadId: string | null;
  expectedBytes: number;
  expectedSha256: string;
  partSize: number;
  partCount: number;
  status: "reserved" | "active" | "completing" | "completed" | "aborted" | "expired" | "superseded";
  createdAt: string;
  error: string | null;
  parts: Array<{ partNumber: number; etag: string; bytes: number }>;
}

/** What the browser needs: never the bucket, key or R2 upload ID. */
export function publicUpload(upload: UploadRow) {
  return {
    id: upload.id,
    clipId: upload.clipId,
    status: upload.status,
    partSize: upload.partSize,
    partCount: upload.partCount,
    expectedBytes: upload.expectedBytes,
    createdAt: upload.createdAt,
  };
}

export function partSizeFor(upload: Pick<UploadRow, "expectedBytes" | "partSize" | "partCount">, partNumber: number): number {
  return partNumber < upload.partCount ? upload.partSize : upload.expectedBytes - upload.partSize * (upload.partCount - 1);
}

/** Parts whose stored size matches the fixed layout; anything else is re-uploaded. */
export function validParts(upload: UploadRow, parts: StoredPart[]): StoredPart[] {
  return parts.filter((p) => p.partNumber >= 1 && p.partNumber <= upload.partCount && p.size === partSizeFor(upload, p.partNumber));
}

async function state(tokenHash: string, uploadId: string, extra: Record<string, unknown> = {}): Promise<UploadRow> {
  const result = await rpc<{ upload: UploadRow }>("labeler_admin_upload_state", { tokenHash, uploadId, ...extra });
  return result.upload;
}

async function discard(upload: Pick<UploadRow, "objectKey" | "r2UploadId">): Promise<void> {
  const store = objectStore();
  if (upload.r2UploadId) await store.abort(upload.objectKey, upload.r2UploadId).catch(() => undefined);
  const head = await store.head(upload.objectKey).catch(() => null);
  if (head) await store.remove(upload.objectKey).catch(() => undefined);
}

export async function beginUpload(tokenHash: string, input: { clipId: string; sha256: string; bytes: number }) {
  const config = labelerConfig();
  const store = objectStore();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await rpc<{ ready?: boolean; expired?: UploadRow; upload?: UploadRow; created?: boolean }>(
      "labeler_admin_upload_begin",
      {
        tokenHash,
        clipId: input.clipId,
        sha256: input.sha256,
        bytes: input.bytes,
        partSize: config.limits.partSize,
        bucket: config.r2.bucket,
        maxTotalBytes: config.limits.maxTotalBytes,
        maxOpenUploads: config.limits.maxOpenUploads,
        expirySeconds: UPLOAD_EXPIRY_SECONDS,
      },
    );
    if (result.ready) return { ready: true as const };
    if (result.expired) {
      await discard(result.expired);
      continue;
    }
    let upload = result.upload!;
    if (upload.status === "reserved") {
      if (!result.created) throw new LabelerError(409, "This clip is starting an upload elsewhere. Try again in a moment.");
      let r2UploadId: string;
      try {
        r2UploadId = await store.createMultipart(upload.objectKey);
      } catch {
        await state(tokenHash, upload.id, { setStatus: "aborted", error: "Cloud storage did not start the upload." });
        throw new LabelerError(502, "Cloud storage did not start the upload. Retry.");
      }
      const attached = await rpc<{ attached: boolean; upload: UploadRow }>("labeler_admin_upload_attach", {
        tokenHash,
        uploadId: upload.id,
        r2UploadId,
      });
      if (!attached.attached) await store.abort(upload.objectKey, r2UploadId).catch(() => undefined);
      upload = attached.upload;
      if (upload.status === "reserved") throw new LabelerError(409, "This clip is starting an upload elsewhere. Try again in a moment.");
    }
    if (upload.status !== "active" && upload.status !== "completing") {
      throw new LabelerError(409, `This upload is ${upload.status}.`);
    }
    const parts = await store.listParts(upload.objectKey, upload.r2UploadId!);
    if (parts === null) {
      // The multipart upload is gone: either R2 completed it and the database never heard, or
      // it expired. A present object is finished by the complete step; otherwise restart.
      if (await store.head(upload.objectKey)) {
        return { upload: publicUpload(upload), completedParts: [], needsCompletion: true };
      }
      await state(tokenHash, upload.id, { setStatus: "expired", error: "Cloud storage no longer has this upload." });
      continue;
    }
    const good = validParts(upload, parts);
    if (good.length) {
      for (let i = 0; i < good.length; i += 100) {
        await state(tokenHash, upload.id, {
          parts: good.slice(i, i + 100).map((p) => ({ partNumber: p.partNumber, etag: p.etag, bytes: p.size })),
        });
      }
    }
    return {
      upload: publicUpload(upload),
      completedParts: good.map((p) => ({ partNumber: p.partNumber, size: p.size })),
      needsCompletion: false,
    };
  }
  throw new LabelerError(409, "The upload could not be started. Retry.");
}

export async function signParts(
  tokenHash: string,
  uploadId: string,
  partNumbers: number[],
  completed: Array<{ partNumber: number; etag: string; bytes: number }>,
) {
  const upload = await state(tokenHash, uploadId, completed.length ? { parts: completed } : {});
  if (upload.status !== "active") throw new LabelerError(409, `This upload is ${upload.status}. Resume it from the collection page.`);
  if (!upload.r2UploadId) throw new LabelerError(409, "This upload has not started.");
  const store = objectStore();
  const urls = [];
  for (const partNumber of partNumbers) {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > upload.partCount) {
      throw new LabelerError(422, "That part is outside this upload.");
    }
    urls.push({
      partNumber,
      size: partSizeFor(upload, partNumber),
      url: await store.signPart(upload.objectKey, upload.r2UploadId, partNumber, PART_URL_SECONDS),
    });
  }
  return { urls, expiresAt: new Date(Date.now() + PART_URL_SECONDS * 1000).toISOString() };
}

export async function completeUpload(tokenHash: string, uploadId: string) {
  const store = objectStore();
  let upload = await state(tokenHash, uploadId);
  if (upload.status === "completed") return { status: "ready", clipId: upload.clipId, replayed: true };
  if (upload.status !== "active" && upload.status !== "completing") {
    throw new LabelerError(409, `This upload is ${upload.status}. Start it again.`);
  }
  upload = await state(tokenHash, uploadId, { setStatus: "completing" });
  const parts = await store.listParts(upload.objectKey, upload.r2UploadId!);
  if (parts !== null) {
    const good = validParts(upload, parts);
    const have = new Set(good.map((p) => p.partNumber));
    const missing = Array.from({ length: upload.partCount }, (_, i) => i + 1).filter((n) => !have.has(n));
    if (missing.length) {
      await state(tokenHash, uploadId, { setStatus: "active" });
      throw new LabelerError(409, `${missing.length} part${missing.length === 1 ? " is" : "s are"} still missing.`, { missing });
    }
    await store.complete(upload.objectKey, upload.r2UploadId!, good);
  }
  const head = await store.head(upload.objectKey);
  if (!head) {
    await state(tokenHash, uploadId, { setStatus: "expired", error: "Cloud storage no longer has this upload." });
    throw new LabelerError(410, "This upload expired in cloud storage. Restart it from the collection page.");
  }
  if (head.size !== upload.expectedBytes || head.contentType !== "video/mp4") {
    await store.remove(upload.objectKey).catch(() => undefined);
    await state(tokenHash, uploadId, { setStatus: "aborted", error: "Stored size or type did not match." });
    throw new LabelerError(409, "The stored file has the wrong size or type. Upload it again.");
  }
  const digest = await store.sha256(upload.objectKey);
  if (digest.sha256 !== upload.expectedSha256 || digest.bytes !== upload.expectedBytes) {
    await store.remove(upload.objectKey).catch(() => undefined);
    await state(tokenHash, uploadId, { setStatus: "aborted", error: "Stored bytes did not match the manifest SHA-256." });
    throw new LabelerError(409, "The stored file does not match the manifest SHA-256. Upload it again.");
  }
  const result = await rpc<{ status: string; clipId: string; orphanKey?: string; replayed?: boolean }>(
    "labeler_admin_upload_finalise",
    { tokenHash, uploadId, bytes: head.size, sha256: digest.sha256 },
  );
  if (result.status === "superseded" && result.orphanKey) {
    await store.remove(result.orphanKey).catch(() => undefined);
  }
  return { status: result.status, clipId: result.clipId, replayed: Boolean(result.replayed) };
}

export async function abortUpload(tokenHash: string, uploadId: string) {
  const upload = await state(tokenHash, uploadId, { setStatus: "aborted", error: "Cancelled by the administrator." });
  await discard(upload);
  return { status: upload.status };
}

export async function cleanupCollection(tokenHash: string, collectionId: string) {
  const result = await rpc<{ aborted: Array<{ id: string; objectKey: string; r2UploadId: string | null }> }>(
    "labeler_admin_collection_cleanup",
    { tokenHash, collectionId },
  );
  let failed = 0;
  for (const upload of result.aborted) {
    try {
      await discard(upload);
    } catch {
      failed += 1;
    }
  }
  return { aborted: result.aborted.length, storageCleanupFailed: failed };
}
