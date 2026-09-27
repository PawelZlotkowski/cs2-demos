"use client";

import { useId, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(0)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function UploadPage() {
  const router = useRouter();
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [sent, setSent] = useState(0);

  async function onFile(file: File | null) {
    if (!file || busy) return;
    setError(null);
    setBusy(file);
    setSent(0);
    try {
      const res = await api.upload(file, (done) => setSent(done));
      router.push(`/processing/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload the demo. Check it is a .dem or .dem.zst file and try again.");
      setBusy(null);
    }
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = busy ? "none" : "copy";
    setOver(true);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    onFile(e.dataTransfer.files?.[0] ?? null);
  }

  return (
    <main className="main" id="content">
      <h1>Add a match</h1>
      <p className="lede">Choose a .dem.zst from FACEIT or a .dem from CS Demo Manager. Mirage and Anubis only for now.</p>
      <div
        className="drop"
        data-over={over || undefined}
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <b>{busy ? `Uploading ${busy.name}` : over ? "Drop to upload" : "Drop a demo here"}</b>
        <span className="meta" style={{ display: "block" }}>
          {busy
            ? sent >= busy.size
              ? `${formatSize(busy.size)} sent. Opening the processing page.`
              : `${formatSize(sent)} of ${formatSize(busy.size)}. The processing page opens when the upload finishes.`
            : "Or choose a file."}
        </span>
        {busy ? (
          <progress
            className="upload-bar"
            max={busy.size}
            value={sent}
            aria-label={`Uploading ${busy.name}`}
          />
        ) : null}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 12 }}>
          <label htmlFor={inputId} className="btn btn-fill" style={{ cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Uploading…" : "Choose file"}
          </label>
          <input
            id={inputId}
            type="file"
            accept=".dem,.dem.zst,application/octet-stream"
            disabled={Boolean(busy)}
            aria-busy={Boolean(busy)}
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      {error ? (
        <p className="err" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
