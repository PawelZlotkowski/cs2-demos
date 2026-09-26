"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { REPLAY_READY_STATUSES, type StatusResponse } from "@/lib/contracts";

const TERMINAL = new Set(["complete", "failed"]);

export default function ProcessingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const s = await api.getStatus(id);
        if (cancelled) return;
        setStatus(s);
        // Radar is ready from awaiting_player on. The player picker (task T41)
        // will stop here instead; until then open the Studio as before.
        if (REPLAY_READY_STATUSES.has(s.status)) {
          router.replace(`/studio/${id}`);
          return;
        }
        if (s.status === "failed") {
          setError(s.error ?? "Processing failed.");
          return;
        }
        timer = setTimeout(poll, 800);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Status failed.");
          timer = setTimeout(poll, 1500);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, router]);

  const done = status ? TERMINAL.has(status.status) : Boolean(error);

  return (
    <main className="main">
      <h1>Processing</h1>
      <p className="lede">Real stages only. Counts appear when they exist.</p>
      {error ? (
        <p className="err" role="alert">
          {error} <Link href="/upload">Choose another demo</Link>
        </p>
      ) : null}
      <ol className="stage-list" aria-live="polite">
        {(status?.stages ?? []).map((stage) => (
          <li key={stage.id} data-state={stage.state}>
            <span className="s-ic" aria-hidden />
            <strong>{stage.label}</strong>
            <span className="meta" style={{ gridColumn: "3", textAlign: "right" }}>
              {stage.state}
            </span>
            {stage.detail ? <div className="meta">{stage.detail}</div> : null}
            {stage.progress ? (
              <div className="meta">
                {stage.progress.done} / {stage.progress.total}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {!status && !error ? <p className="meta">Waiting for status…</p> : null}
      {status && !done ? (
        <p className="meta" style={{ marginTop: 12 }}>
          Status: {status.status}
        </p>
      ) : null}
    </main>
  );
}
