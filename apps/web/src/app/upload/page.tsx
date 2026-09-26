"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";

export default function UploadPage() {
  const router = useRouter();
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.upload(file);
      router.push(`/processing/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setBusy(false);
    }
  }

  return (
    <main className="main">
      <h1>Add a demo</h1>
      <p className="lede">Choose a .dem.zst from FACEIT or a .dem from CS Demo Manager.</p>
      <div className="drop">
        <b>{busy ? "Uploading…" : "Drop a demo here"}</b>
        <span className="meta" style={{ display: "block" }}>
          Or choose a file. Real FACEIT demos produce Radar round replays.
        </span>
        <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 12 }}>
          <label htmlFor={inputId} className="btn btn-fill" style={{ cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Uploading…" : "Choose file"}
          </label>
          <input
            id={inputId}
            type="file"
            accept=".dem,.dem.zst,application/octet-stream"
            disabled={busy}
            aria-busy={busy}
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
