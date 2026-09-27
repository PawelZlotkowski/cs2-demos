"use client";

import Link from "next/link";
import { useState } from "react";
import { LoadState, PageHead, useLoad } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { GpuJob } from "@/lib/contracts";
import { ago, errorText, when } from "@/lib/format";

const KIND: Record<string, string> = {
  select: "Pick moments",
  explain: "Write explanations",
  review: "Summary and wrap-up",
  ask: "Ask tab",
  ask_across: "Coach page",
};

function secs(a: number | null, b: number | null): string {
  if (!a) return "–";
  const s = Math.max(0, (b ?? Date.now() / 1000) - a);
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

function GpuRows({ jobs, onCancel }: { jobs: GpuJob[]; onCancel?: (id: string) => void }) {
  return (
    <>
      {jobs.map((j) => (
        <tr key={j.id}>
          <td>{KIND[j.kind] ?? j.kind}</td>
          <td className="mono">{j.matchId ?? j.playerId ?? "–"}</td>
          <td>{j.state}</td>
          <td className="meta">{when(j.createdAt)}</td>
          <td className="n">{j.state === "queued" ? secs(j.createdAt, null) : secs(j.startedAt, j.endedAt)}</td>
          <td className="row-actions">
            {j.error ? <span className="meta" title={j.error}>{j.error.slice(0, 60)}</span> : null}
            {onCancel && j.state === "queued" ? (
              <button type="button" className="link small" onClick={() => onCancel(j.id)}>
                Cancel
              </button>
            ) : null}
          </td>
        </tr>
      ))}
    </>
  );
}

/** Admin, Jobs (doc 30 AD06): the one GPU queue, processing matches and clip recordings. */
export default function AdminJobs() {
  const { data, error, reload } = useLoad(() => api.admin.jobs(), 3000);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, done: string) {
    setMsg(null);
    try {
      await fn();
      setMsg(done);
      await reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  const gpu = data?.gpu;
  return (
    <main className="main wide" id="content">
      <PageHead
        title="Jobs"
        lede="The model runs one job at a time, first come first served; each person can have one question waiting. Refreshes every 3 seconds."
      />
      {msg ? <p className="meta" role="status">{msg}</p> : null}
      <LoadState error={error} loading={!data} />
      {gpu ? (
        <>
          <section className="settings-sec" aria-labelledby="gpu-h">
            <div className="sec-h">
              <h2 id="gpu-h">GPU queue</h2>
              <span className="meta">
                {gpu.running.length} running, {gpu.waiting.length} waiting
              </span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Match or player</th>
                    <th>State</th>
                    <th>Queued</th>
                    <th className="n">Time</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <GpuRows jobs={gpu.running} />
                  <GpuRows jobs={gpu.waiting} onCancel={(id) => void act(() => api.admin.cancelJob(id), "Cancelled.")} />
                  <GpuRows jobs={gpu.finished.slice(0, 20)} />
                  {!gpu.running.length && !gpu.waiting.length && !gpu.finished.length ? (
                    <tr>
                      <td colSpan={6} className="meta">
                        Nothing has used the model since the API started.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="settings-sec" aria-labelledby="pipe-h">
            <div className="sec-h">
              <h2 id="pipe-h">Processing and failed matches</h2>
            </div>
            {data.pipeline.length ? (
              <ul className="plain-list">
                {data.pipeline.map((p) => (
                  <li key={p.matchId}>
                    <Link href={`/processing/${p.matchId}`} className="mono">
                      {p.matchId}
                    </Link>{" "}
                    {p.status.replace(/_/g, " ")} {p.since ? <span className="meta">since {ago(p.since)}</span> : null}
                    {p.error ? <span className="meta"> · {p.error}</span> : null}
                    {p.status === "failed" ? (
                      <button type="button" className="link small" onClick={() => void act(() => api.admin.reprocess(p.matchId), "Processing again.")}>
                        Process again
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">No match is being processed.</p>
            )}
          </section>

          <section className="settings-sec" aria-labelledby="clips-h">
            <div className="sec-h">
              <h2 id="clips-h">Clip recordings</h2>
            </div>
            {data.clips.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Clip</th>
                      <th>Match</th>
                      <th className="n">Round</th>
                      <th>Window</th>
                      <th>State</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clips.slice(0, 50).map((c) => (
                      <tr key={c.id}>
                        <td className="mono">{c.id}</td>
                        <td className="mono">{c.matchId}</td>
                        <td className="n num">{c.round}</td>
                        <td className="meta">
                          {c.t0.toFixed(1)}–{c.t1.toFixed(1)} s
                        </td>
                        <td title={c.error ?? undefined}>{c.status}</td>
                        <td className="row-actions">
                          {c.status === "failed" ? (
                            <button type="button" className="link small" onClick={() => void act(() => api.admin.retryClip(c.id), "Clip queued again.")}>
                              Record again
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="meta">No clips recorded yet.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
