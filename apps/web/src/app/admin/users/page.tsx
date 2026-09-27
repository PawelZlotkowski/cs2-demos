"use client";

import { useState } from "react";
import { ConfirmButton, LoadState, PageHead, Secret, useLoad } from "@/components/admin/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api/client";
import type { Role } from "@/lib/contracts";
import { ago, bytes, errorText } from "@/lib/format";

const ROLES: { id: Role; label: string }[] = [
  { id: "player", label: "Player" },
  { id: "labeller", label: "Labeller" },
  { id: "admin", label: "Admin" },
];

/** Admin, Users (doc 30 AD04): roles, disable, sign out everywhere, reset code, delete. */
export default function AdminUsers() {
  const { state, user: me } = useAuth();
  const { data, error, reload } = useLoad(() => api.admin.users());
  const [msg, setMsg] = useState<string | null>(null);
  const [reset, setReset] = useState<{ name: string; code: string } | null>(null);

  async function act(fn: () => Promise<unknown>, done?: string) {
    setMsg(null);
    try {
      await fn();
      if (done) setMsg(done);
      await reload();
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  return (
    <main className="main wide" id="content">
      <PageHead
        title="Users"
        lede="Everyone with an account. Players see only their own matches; labellers can also read every match in the Lab; admins can do everything here."
      />
      {state && !state.authEnabled ? (
        <p className="empty">
          Accounts are off, so there are no users yet and this PC is the admin. Set <code>RR_AUTH_ENABLED=true</code> in{" "}
          <code>apps/api/.env</code> and restart the API; the first account you create becomes the admin and takes over the
          matches already here.
        </p>
      ) : null}
      {msg ? <p className="meta" role="status">{msg}</p> : null}
      {reset ? (
        <div className="notice">
          <p>
            Reset code for <b>{reset.name}</b>. Give it to them; it works once, for 24 hours, on the sign-in page under
            &ldquo;I have a reset code&rdquo;.
          </p>
          <Secret value={reset.code} />
        </div>
      ) : null}
      <LoadState error={error} loading={!data} />
      {data && data.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sign-in</th>
                <th>Role</th>
                <th className="n">Matches</th>
                <th className="n">Storage</th>
                <th>Last seen</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} data-off={u.disabled || undefined}>
                  <td>
                    <b>{u.displayName}</b>
                    {u.id === me?.id ? <span className="meta"> (you)</span> : null}
                    {u.disabled ? <span className="tag">Disabled</span> : null}
                  </td>
                  <td className="meta">
                    {[u.username ? `@${u.username}` : null, u.steamId ? "Steam" : null].filter(Boolean).join(" · ")}
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`role-${u.id}`}>
                      Role of {u.displayName}
                    </label>
                    <select
                      id={`role-${u.id}`}
                      className="input small"
                      value={u.role}
                      onChange={(e) => void act(() => api.admin.patchUser(u.id, { role: e.target.value as Role }), `${u.displayName} is now ${e.target.value}.`)}
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="n num">{u.matches}</td>
                  <td className="n">{bytes(u.bytes)}</td>
                  <td className="meta">{ago(u.lastSeenAt)}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="link small"
                      onClick={() => void act(() => api.admin.patchUser(u.id, { disabled: !u.disabled }), u.disabled ? `${u.displayName} can sign in again.` : `${u.displayName} is disabled and signed out.`)}
                    >
                      {u.disabled ? "Enable" : "Disable"}
                    </button>
                    {u.sessions ? (
                      <button type="button" className="link small" onClick={() => void act(() => api.admin.signOutUser(u.id), `${u.displayName} is signed out everywhere.`)}>
                        Sign out ({u.sessions})
                      </button>
                    ) : null}
                    {u.username ? (
                      <button
                        type="button"
                        className="link small"
                        onClick={() =>
                          void act(async () => {
                            const r = await api.admin.resetCode(u.id);
                            setReset({ name: u.displayName, code: r.code });
                          })
                        }
                      >
                        Reset password
                      </button>
                    ) : null}
                    {u.id !== me?.id ? (
                      <ConfirmButton
                        label="Delete"
                        question={`Delete ${u.displayName} and their ${u.matches} ${u.matches === 1 ? "match" : "matches"}?`}
                        onConfirm={() => act(() => api.admin.deleteUser(u.id), `${u.displayName} was deleted.`)}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <p className="meta">No accounts yet.</p>
      ) : null}
    </main>
  );
}
