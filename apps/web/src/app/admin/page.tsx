"use client";

import Link from "next/link";
import { LoadState, PageHead, Stat, useLoad } from "@/components/admin/ui";
import { LABELS } from "@/components/SystemNotice";
import { api } from "@/lib/api/client";
import { auditLabel } from "@/lib/audit";
import { ago, bytes } from "@/lib/format";

const STATE_LABEL = { ok: "Working", off: "Off", problem: "Not working" } as const;

/** Admin, Overview (doc 30 AD01): services, work in flight, disk, and what changed last. */
export default function AdminOverview() {
  const { data, error } = useLoad(() => api.admin.overview(), 10000);
  const c = data?.counts;
  const used = data?.storage.folders.reduce((n, f) => n + f.bytes, 0) ?? 0;

  return (
    <main className="main wide" id="content">
      <PageHead title="Overview" lede="Everything the app is doing on this PC. The page refreshes every 10 seconds." />
      <LoadState error={error} loading={!data} />
      {data && c ? (
        <>
          <div className="stats">
            <Stat label="Users" value={data.authEnabled ? c.users : "–"} href="/admin/users" />
            <Stat label="Matches" value={c.matches} href="/admin/matches" />
            <Stat label="Reviewed" value={c.reviewed} href="/admin/matches" />
            <Stat label="Processing" value={c.processing} href="/admin/jobs" />
            <Stat label="GPU running / waiting" value={`${c.gpuRunning} / ${c.gpuWaiting}`} href="/admin/jobs" />
            <Stat label="Failed matches" value={c.failed} href="/admin/matches" />
            <Stat label="Failed clips" value={c.clipsFailed} href="/admin/jobs" />
            <Stat label="Data on disk" value={bytes(used)} href="/admin/storage" />
          </div>

          <section className="settings-sec" aria-labelledby="svc-h">
            <div className="sec-h">
              <h2 id="svc-h">Services</h2>
              <Link href="/admin/model" className="link small">
                Model and services
              </Link>
            </div>
            <ul className="checks">
              {data.system.checks.map((s) => (
                <li key={s.name} data-state={s.state}>
                  <span className="check-name">{LABELS[s.name]}</span>
                  <span className="check-state">{STATE_LABEL[s.state]}</span>
                  <span className="check-detail">{s.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="settings-sec" aria-labelledby="recent-h">
            <div className="sec-h">
              <h2 id="recent-h">Latest changes</h2>
              <Link href="/admin/audit" className="link small">
                Audit log
              </Link>
            </div>
            {data.recent.length ? (
              <ul className="plain-list">
                {data.recent.map((a) => (
                  <li key={a.id}>
                    <span>
                      <b>{a.actorName ?? "Someone"}</b> {auditLabel(a.action)}
                      {a.targetName ? (a.targetName === a.actorName ? null : ` (${a.targetName})`) : a.target ? <span className="mono"> {a.target}</span> : null}
                    </span>
                    <span className="meta">{ago(a.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">Nothing yet.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
