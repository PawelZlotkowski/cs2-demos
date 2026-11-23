"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBytes, mapName } from "@/lib/labeler/manifest";
import { api } from "./api";
import type { AdminClip, CollectionDetail, Overview } from "./adminTypes";
import { ClipPlayer } from "./ClipPlayer";
import { readSelection, register, tasksFor, uploadAll, uploadTask, type Selection, type UploadTask } from "./uploader";

const STATE_TEXT: Record<UploadTask["state"], string> = {
  waiting: "Waiting",
  missing: "File missing",
  checking: "Checking file",
  registered: "Ready to upload",
  uploading: "Uploading",
  completing: "Verifying",
  ready: "Uploaded",
  failed: "Failed",
  expired: "Upload expired",
};

export function CollectionAdmin({ collectionId }: { collectionId: string }) {
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [running, setRunning] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({ map: "", demo: "", player: "" });
  const [preview, setPreview] = useState<AdminClip | null>(null);
  const [name, setName] = useState("");
  const folderInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([api<CollectionDetail>(`/admin/collections/${collectionId}`), api<Overview>("/admin/overview")]);
      setDetail(d);
      setOverview(o);
      setName(d.collection.name);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The collection could not load.");
    }
  }, [collectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const update = useCallback((task: UploadTask) => {
    setTasks((current) => current.map((t) => (t.footageId === task.footageId ? { ...task } : t)));
  }, []);

  async function choose(list: FileList | null) {
    if (!list?.length) return;
    setNotice(null);
    const picked = await readSelection(list);
    setSelection(picked);
    setTasks(tasksFor(picked));
  }

  async function startImport() {
    if (!selection?.manifest) return;
    setRunning(true);
    setNotice(null);
    const working = tasks.map((t) => ({ ...t }));
    try {
      await register(collectionId, selection.manifest, working, update);
      setTasks(working.map((t) => ({ ...t })));
      await uploadAll(working, update);
      const failed = working.filter((t) => t.state === "failed" || t.state === "expired").length;
      setNotice(failed ? `${failed} file(s) need attention. Use Retry on each, or choose the folder again later to resume.` : "Every selected file is uploaded and verified. Publish the clips you want reviewers to see.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The import stopped.");
    } finally {
      setRunning(false);
      await load();
    }
  }

  async function retry(task: UploadTask) {
    setRunning(true);
    const copy = { ...task };
    await uploadTask(copy, update);
    setRunning(false);
    await load();
  }

  async function mutate(path: string, body: unknown, method = "POST", done?: string) {
    setNotice(null);
    try {
      await api(path, { method, body });
      if (done) setNotice(done);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "That change failed.");
    }
  }

  const clips = useMemo(() => detail?.clips ?? [], [detail]);
  const demos = useMemo(() => [...new Map(clips.map((c) => [c.demoId, c.demoFile])).entries()], [clips]);
  const players = useMemo(() => [...new Set(clips.map((c) => c.playerName))], [clips]);
  const shown = clips.filter(
    (c) => (!filters.map || c.map === filters.map) && (!filters.demo || c.demoId === filters.demo) && (!filters.player || c.playerName === filters.player),
  );
  const readyShown = shown.filter((c) => c.mediaState === "ready");
  const manifestBytes = selection?.manifest?.clips.reduce((sum, c) => sum + c.bytes, 0) ?? 0;
  const alreadyHere = new Set(clips.filter((c) => c.mediaState === "ready").map((c) => `${c.footageId}:${c.sha256}`));
  // Only selected files that are not stored yet will be uploaded now.
  const pendingTasks = tasks.filter((t) => t.file && !alreadyHere.has(`${t.footageId}:${t.entry.sha256}`));
  const newBytes = pendingTasks.reduce((sum, t) => sum + t.entry.bytes, 0);
  const selectedFiles = tasks.filter((t) => t.file).length;

  if (error) {
    return (
      <main className="lb-main" id="content">
        <p className="lb-notice lb-notice-problem" role="alert">
          {error}
        </p>
        <Link href="/label/admin#collections" className="lb-btn lb-btn-secondary">
          Back to collections
        </Link>
      </main>
    );
  }
  if (!detail || !overview) {
    return (
      <main className="lb-main" id="content">
        <p className="lb-notice" role="status">
          Loading the collection…
        </p>
      </main>
    );
  }

  const { collection } = detail;
  const assigned = new Set(detail.assignments.map((a) => a.accountId));
  const storage = overview.storage;
  const afterUpload = storage.readyBytes + storage.reservedBytes + newBytes;

  return (
    <main className="lb-main lb-admin" id="content">
      <Link href="/label/admin#collections" className="lb-back">
        All collections
      </Link>
      <div className="lb-panel sheet">
        <div className="lb-panel-head">
          <form
            className="lb-rename"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(`/admin/collections/${collectionId}`, { name }, "PATCH", "Renamed.");
            }}
          >
            <label className="lb-field">
              <span className="lb-label">Collection name</span>
              <input className="lb-input lb-title-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
            {name !== collection.name ? (
              <button type="submit" className="lb-btn lb-btn-small">
                Save name
              </button>
            ) : null}
          </form>
          <span className={`lb-pill lb-pill-${collection.status}`}>
            {collection.status === "draft" ? "Draft" : collection.status === "published" ? "Published" : "Archived"}
          </span>
        </div>
        <div className="lb-actions">
          {collection.status !== "published" && collection.status !== "archived" ? (
            <button type="button" className="lb-btn lb-btn-primary" onClick={() => void mutate(`/admin/collections/${collectionId}`, { status: "published" }, "PATCH", "Published to assigned reviewers.")}>
              Publish collection
            </button>
          ) : null}
          {collection.status === "published" ? (
            <button type="button" className="lb-btn lb-btn-secondary" onClick={() => void mutate(`/admin/collections/${collectionId}`, { status: "draft" }, "PATCH", "Hidden from reviewers. Notes are kept.")}>
              Hide from reviewers
            </button>
          ) : null}
          {collection.status !== "archived" ? (
            <button
              type="button"
              className="lb-btn lb-btn-quiet"
              onClick={() => window.confirm("Archive this collection? Reviewers stop seeing it. Notes and media are kept.") && void mutate(`/admin/collections/${collectionId}`, { status: "archived" }, "PATCH", "Archived.")}
            >
              Archive
            </button>
          ) : (
            <button type="button" className="lb-btn lb-btn-secondary" onClick={() => void mutate(`/admin/collections/${collectionId}`, { status: "draft" }, "PATCH", "Restored as a draft.")}>
              Restore as draft
            </button>
          )}
        </div>
        {notice ? (
          <p className="lb-notice" role="status">
            {notice}
          </p>
        ) : null}
      </div>

      <div className="lb-grid-2">
        <section className="lb-panel sheet" aria-labelledby="import-title">
          <h2 id="import-title">Import an exported folder</h2>
          <p className="lb-meta">Choose the folder written by Export clips for web. It holds manifest.json and a clips folder.</p>
          <div className="lb-actions">
            <label className="lb-btn lb-btn-secondary lb-file">
              Choose folder
              <input ref={folderInput} type="file" multiple onChange={(e) => void choose(e.target.files)} disabled={running} />
            </label>
            <label className="lb-btn lb-btn-quiet lb-file">
              Choose files instead
              <input type="file" multiple accept=".json,.mp4,application/json,video/mp4" onChange={(e) => void choose(e.target.files)} disabled={running} />
            </label>
          </div>
          {selection?.problems.length ? (
            <ul className="lb-error-list" role="alert">
              {selection.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          {selection?.manifest ? (
            <>
              <p>
                The manifest lists {selection.manifest.clips.length} clip(s), {formatBytes(manifestBytes)} in total. You selected {selectedFiles} of their files; {pendingTasks.length} ({formatBytes(newBytes)}) are not stored yet. After this upload the site would hold{" "}
                {formatBytes(afterUpload)} of its {formatBytes(overview.limits.maxTotalBytes)} limit.
              </p>
              {afterUpload > overview.limits.maxTotalBytes ? (
                <p className="lb-error" role="alert">
                  This upload would pass the storage limit. Split the export or raise LABELER_MAX_TOTAL_BYTES deliberately.
                </p>
              ) : null}
              <button type="button" className="lb-btn lb-btn-primary" onClick={() => void startImport()} disabled={running || collection.status === "archived"}>
                {running ? "Uploading…" : "Check files and upload"}
              </button>
            </>
          ) : null}
          {tasks.length ? (
            <ul className="lb-uploads" aria-label="Files">
              {tasks.map((task) => (
                <li key={task.footageId} className={`lb-upload lb-upload-${task.state}`}>
                  <span className="lb-upload-name">{task.entry.path.replace("clips/", "")}</span>
                  <span className="lb-meta">
                    {STATE_TEXT[task.state]}
                    {task.state === "uploading" ? ` ${Math.floor((task.sent / task.entry.bytes) * 100)}%` : ""}
                  </span>
                  <progress max={task.entry.bytes} value={task.sent} aria-label={`${task.entry.path} uploaded`} />
                  {task.error ? <span className="lb-error">{task.error}</span> : null}
                  {(task.state === "failed" || task.state === "expired") && task.file && task.clipId ? (
                    <button type="button" className="lb-btn lb-btn-small" onClick={() => void retry(task)} disabled={running}>
                      {task.state === "expired" ? "Restart upload" : "Retry"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="lb-panel sheet" aria-labelledby="assign-title">
          <h2 id="assign-title">Reviewers</h2>
          <p className="lb-meta">Each person keeps separate notes, even on the same clip.</p>
          <ul className="lb-checks">
            {overview.accounts
              .filter((a) => a.status === "active")
              .map((account) => (
                <li key={account.id}>
                  <label className="lb-check">
                    <input
                      type="checkbox"
                      checked={assigned.has(account.id)}
                      onChange={(e) => void mutate(`/admin/collections/${collectionId}/assign`, { accountId: account.id, assigned: e.target.checked })}
                    />
                    {account.displayName}
                    {account.role === "admin" ? " (you)" : ""}
                  </label>
                </li>
              ))}
          </ul>
          <h3>Unfinished uploads</h3>
          <p className="lb-meta">Cancels only this collection&apos;s incomplete uploads. Uploaded clips and notes stay.</p>
          <button
            type="button"
            className="lb-btn lb-btn-secondary"
            onClick={() => window.confirm("Cancel every unfinished upload in this collection?") && void mutate(`/admin/collections/${collectionId}/cleanup`, {}, "POST", "Unfinished uploads cancelled.")}
          >
            Cancel unfinished uploads
          </button>
        </section>
      </div>

      <section className="lb-panel sheet" aria-labelledby="clips-title">
        <div className="lb-panel-head">
          <h2 id="clips-title">Clips</h2>
          <div className="lb-filters">
            <label className="lb-field lb-field-inline">
              <span className="lb-label">Map</span>
              <select className="lb-input" value={filters.map} onChange={(e) => setFilters({ ...filters, map: e.target.value })}>
                <option value="">All</option>
                <option value="de_ancient">Ancient</option>
                <option value="de_anubis">Anubis</option>
              </select>
            </label>
            <label className="lb-field lb-field-inline">
              <span className="lb-label">Demo</span>
              <select className="lb-input" value={filters.demo} onChange={(e) => setFilters({ ...filters, demo: e.target.value })}>
                <option value="">All</option>
                {demos.map(([id, file]) => (
                  <option key={id} value={id}>
                    {file}
                  </option>
                ))}
              </select>
            </label>
            <label className="lb-field lb-field-inline">
              <span className="lb-label">Player</span>
              <select className="lb-input" value={filters.player} onChange={(e) => setFilters({ ...filters, player: e.target.value })}>
                <option value="">All</option>
                {players.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p className="lb-meta">
          {clips.length} clip(s): {clips.filter((c) => c.mediaState === "ready").length} uploaded, {clips.filter((c) => c.publishedAt && c.mediaState === "ready").length} published.
        </p>
        <div className="lb-actions">
          <button type="button" className="lb-btn lb-btn-small" onClick={() => setChosen(new Set(readyShown.map((c) => c.id)))}>
            Select uploaded clips shown
          </button>
          <button type="button" className="lb-btn lb-btn-small" onClick={() => setChosen(new Set())}>
            Clear selection
          </button>
          <button
            type="button"
            className="lb-btn lb-btn-small lb-btn-primary"
            disabled={!chosen.size}
            onClick={() => void mutate(`/admin/collections/${collectionId}/publish`, { clipIds: [...chosen], published: true }, "POST", "Published the selected uploaded clips.")}
          >
            Publish selected
          </button>
          <button
            type="button"
            className="lb-btn lb-btn-small"
            disabled={!chosen.size}
            onClick={() => void mutate(`/admin/collections/${collectionId}/publish`, { clipIds: [...chosen], published: false }, "POST", "Withdrew the selected clips. Their notes are kept.")}
          >
            Withdraw selected
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="lb-meta">No clips yet. Import an exported folder above.</p>
        ) : (
          <div className="lb-table-wrap">
            <table className="lb-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="lb-sr">Select</span>
                  </th>
                  <th scope="col">Clip</th>
                  <th scope="col">Media</th>
                  <th scope="col">Reviewers</th>
                  <th scope="col">Preview</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((clip) => (
                  <tr key={clip.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select clip ${clip.position}`}
                        checked={chosen.has(clip.id)}
                        disabled={clip.mediaState !== "ready"}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(clip.id);
                          else next.delete(clip.id);
                          setChosen(next);
                        }}
                      />
                    </td>
                    <th scope="row">
                      <span className="lb-strong">
                        {clip.position}. {clip.playerName}, {mapName(clip.map)} round {clip.round}
                      </span>
                      <span className="lb-meta">
                        {clip.demoFile}, {clip.detector ?? "finding"} {clip.findingId}, {formatBytes(clip.bytes)}
                      </span>
                    </th>
                    <td>
                      {clip.mediaState === "ready" ? (clip.publishedAt ? "Published" : "Uploaded, not published") : clip.upload ? `Upload ${clip.upload.status}` : "Waiting for file"}
                      {clip.upload?.error && clip.mediaState !== "ready" ? <span className="lb-meta">{clip.upload.error}</span> : null}
                    </td>
                    <td>
                      {clip.reviews.complete} reviewed, {clip.reviews.draft} draft, {clip.reviews.skipped} skipped
                      {clip.reviews.issues ? <span className="lb-meta">{clip.reviews.issues} problem report(s)</span> : null}
                    </td>
                    <td>
                      {clip.mediaState === "ready" ? (
                        <button type="button" className="lb-btn lb-btn-small" onClick={() => setPreview(clip)}>
                          Preview
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {preview ? (
        <section className="lb-panel sheet" aria-labelledby="preview-title">
          <div className="lb-panel-head">
            <h2 id="preview-title">
              Preview: {preview.playerName}, {mapName(preview.map)} round {preview.round}
            </h2>
            <button type="button" className="lb-btn lb-btn-small" onClick={() => setPreview(null)}>
              Close preview
            </button>
          </div>
          <ClipPlayer key={preview.id} clipId={preview.id} admin label={`Preview of ${preview.playerName}`} />
        </section>
      ) : null}
    </main>
  );
}
