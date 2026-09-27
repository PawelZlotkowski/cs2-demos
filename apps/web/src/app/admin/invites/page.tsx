"use client";

import { useState } from "react";
import { ConfirmButton, LoadState, PageHead, Secret, useLoad } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import type { Invite } from "@/lib/contracts";
import { ago, errorText, when } from "@/lib/format";

function state(i: Invite): string {
  if (i.usedBy) return `Used by ${i.usedByName ?? "a deleted user"}`;
  if (i.revokedAt) return "Revoked";
  if (i.expiresAt && new Date(i.expiresAt) < new Date()) return "Expired";
  return i.expiresAt ? `Open until ${when(i.expiresAt)}` : "Open";
}

/** Admin, Invites (doc 27 §7, A13): one code per person; the code is shown once. */
export default function AdminInvites() {
  const { data, error, reload } = useLoad(() => api.admin.invites());
  const [count, setCount] = useState(1);
  const [role, setRole] = useState<"player" | "labeller">("player");
  const [days, setDays] = useState(14);
  const [made, setMade] = useState<Invite[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      setMade(await api.admin.createInvites(count, role, days || null));
      await reload();
    } catch (err) {
      setMsg(errorText(err));
    }
  }

  return (
    <main className="main wide" id="content">
      <PageHead
        title="Invites"
        lede="A code lets one person create an account (or finish a Steam sign-in). Sign-up needs a code unless Settings says it is open."
      />
      <form className="inline-form" onSubmit={create}>
        <label>
          How many
          <input className="input small" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <label>
          Role
          <select className="input small" value={role} onChange={(e) => setRole(e.target.value as "player" | "labeller")}>
            <option value="player">Player</option>
            <option value="labeller">Labeller</option>
          </select>
        </label>
        <label>
          Valid for (days)
          <input className="input small" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </label>
        <button type="submit" className="btn btn-fill">
          Create {count === 1 ? "code" : `${count} codes`}
        </button>
      </form>
      {msg ? <p className="err">{msg}</p> : null}
      {made.length ? (
        <div className="notice">
          <p>Copy {made.length === 1 ? "this code" : "these codes"} now; only the last four characters are kept.</p>
          {made.map((m) => (
            <Secret key={m.id} value={m.code ?? ""} note={m.role === "labeller" ? "Labeller" : undefined} />
          ))}
        </div>
      ) : null}
      <LoadState error={error} loading={!data} />
      {data && data.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Role</th>
                <th>Made</th>
                <th>State</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id}>
                  <td className="mono">…{i.hint}</td>
                  <td>{i.role === "labeller" ? "Labeller" : "Player"}</td>
                  <td className="meta">{ago(i.createdAt)}</td>
                  <td>{state(i)}</td>
                  <td className="row-actions">
                    {!i.usedBy && !i.revokedAt ? (
                      <ConfirmButton label="Revoke" question={`Revoke code …${i.hint}?`} onConfirm={async () => {
                        await api.admin.revokeInvite(i.id);
                        await reload();
                      }} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <p className="meta">No codes yet.</p>
      ) : null}
    </main>
  );
}
