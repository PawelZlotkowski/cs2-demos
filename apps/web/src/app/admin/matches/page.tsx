"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmButton, LoadState, PageHead, useLoad } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { ago, bytes, errorText } from "@/lib/format";

const STATUS: Record<string, string> = {
  complete: "Reviewed",
  awaiting_player: "Waiting for a player",
  failed: "Failed",
};

/** Admin, Matches (doc 30 AD05): every match on the PC, whoever uploaded it. */
export default function AdminMatches() {
  const { data, error, reload } = useLoad(() => api.admin.matches());
  const users = useLoad(() => api.admin.users().catch(() => []));
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const rows = (data ?? []).filter((m) => !filter || m.ownerId === filter);
  const total = rows.reduce((n, m) => n + m.bytes, 0);

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

  return (
    <main className="main wide" id="content">
      <PageHead title="Matches" lede="Every uploaded match with its owner, state and size. Deleting removes the demo, clips, review, notes and runs." />
      {users.data && users.data.length ? (
        <div className="filters">
          <label className="sr-only" htmlFor="owner">
            Owner
          </label>
          <select id="owner" className="input small" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Everyone</option>
            {users.data.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
          <span className="meta">
            {rows.length} {rows.length === 1 ? "match" : "matches"}, {bytes(total)}
          </span>
        </div>
      ) : null}
      {msg ? <p className="meta" role="status">{msg}</p> : null}
      <LoadState error={error} loading={!data} />
      {data && rows.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Match</th>
                <th>Owner</th>
                <th>Coached</th>
                <th>State</th>
                <th>Model</th>
                <th className="n">Size</th>
                <th>Added</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link className="row-open" href={m.status === "complete" || m.status === "awaiting_player" ? `/studio/${m.id}` : `/processing/${m.id}`}>
                      {m.title || `${m.map ?? "…"} ${m.score ?? ""}`}
                    </Link>
                    {m.shared ? <span className="tag">Shared</span> : null}
                  </td>
                  <td>
                    {users.data && users.data.length ? (
                      <select
                        className="input small"
                        aria-label={`Owner of ${m.id}`}
                        value={m.ownerId}
                        onChange={(e) => void act(() => api.admin.setOwner(m.id, e.target.value), "Owner changed.")}
                      >
                        {users.data.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      m.ownerName
                    )}
                  </td>
                  <td>{m.playerName ?? "–"}</td>
                  <td title={m.error ?? undefined}>{STATUS[m.status] ?? m.status.replace(/_/g, " ")}</td>
                  <td className="mono">{m.model ?? "templates"}</td>
                  <td className="n">{bytes(m.bytes)}</td>
                  <td className="meta">{ago(m.createdAt)}</td>
                  <td className="row-actions">
                    {m.status === "failed" ? (
                      <button type="button" className="link small" onClick={() => void act(() => api.admin.reprocess(m.id), "Processing again.")}>
                        Process again
                      </button>
                    ) : null}
                    {m.status === "complete" || m.status === "awaiting_player" ? (
                      <button type="button" className="link small" onClick={() => void act(() => api.rerunCoach(m.id, "en"), "Review started again with the served model.")}>
                        Re-run review
                      </button>
                    ) : null}
                    <ConfirmButton
                      label="Delete"
                      question={`Delete ${m.title || `${m.map ?? "this match"} ${m.score ?? ""}`} and its files?`}
                      onConfirm={() => act(() => api.admin.deleteMatch(m.id), "Match deleted.")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <p className="meta">No matches.</p>
      ) : null}
    </main>
  );
}
