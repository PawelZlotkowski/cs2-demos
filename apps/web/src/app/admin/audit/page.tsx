"use client";

import { useState } from "react";
import { LoadState, PageHead, useLoad } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { auditLabel } from "@/lib/audit";
import { when } from "@/lib/format";

const FILTERS = [
  { id: "", label: "Everything" },
  { id: "auth.", label: "Sign-ins" },
  { id: "admin.user", label: "Users" },
  { id: "admin.match", label: "Matches (admin)" },
  { id: "match.", label: "Matches (owners)" },
  { id: "admin.setting", label: "Settings" },
  { id: "admin.token", label: "Tokens" },
  { id: "user.", label: "Accounts" },
];

const PAGE = 100;

/** Admin, Audit log (doc 30 AD13): who did what, when. */
export default function AdminAudit() {
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);

  return (
    <main className="main wide" id="content">
      <PageHead title="Audit log" lede="Every sign-in, role change, delete, setting change and export, newest first." />
      <div className="filters">
        <label className="sr-only" htmlFor="audit-filter">
          Show
        </label>
        <select
          id="audit-filter"
          className="input small"
          value={action}
          onChange={(e) => {
            setOffset(0);
            setAction(e.target.value);
          }}
        >
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {/* A new key per filter and page, so each loads its own rows */}
      <AuditBody key={`${action}:${offset}`} action={action} offset={offset} setOffset={setOffset} />
    </main>
  );
}

function AuditBody({ action, offset, setOffset }: { action: string; offset: number; setOffset: (n: number) => void }) {
  const { data, error } = useLoad(() => api.admin.audit({ action, limit: PAGE, offset }));
  if (!data) return <LoadState error={error} loading />;
  if (!data.items.length) return <p className="meta">Nothing recorded yet.</p>;
  return (
    <>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>On</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a.id}>
                <td className="meta">{when(a.at)}</td>
                <td>{a.actorName ?? a.actorId ?? "–"}</td>
                <td title={a.action}>{auditLabel(a.action)}</td>
                <td className={a.targetName ? undefined : "mono"}>{a.targetName ?? a.target ?? ""}</td>
                <td className="mono">{a.detail ? JSON.stringify(a.detail).slice(0, 80) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.total > PAGE ? (
        <div className="pager">
          <button type="button" className="btn btn-line" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Newer
          </button>
          <span className="meta">
            {offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}
          </span>
          <button type="button" className="btn btn-line" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
            Older
          </button>
        </div>
      ) : null}
    </>
  );
}
