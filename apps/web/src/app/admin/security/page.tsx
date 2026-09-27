"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmButton, LoadState, PageHead, Secret, useLoad } from "@/components/admin/ui";
import { api } from "@/lib/api/client";
import { ago, errorText } from "@/lib/format";

/** Admin, Security (doc 30 AD12): sessions, failed sign-ins, tokens for other apps. */
export default function AdminSecurity() {
  const { data, error, reload } = useLoad(() => api.admin.security());
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [made, setMade] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <main className="main wide" id="content">
      <PageHead title="Security" lede="Who is signed in, who failed to sign in, and which other apps may read your matches." />
      {msg ? <p className="meta" role="status">{msg}</p> : null}
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
          <section className="settings-sec" aria-labelledby="tokens-h">
            <div className="sec-h">
              <h2 id="tokens-h">Tokens for other apps</h2>
            </div>
            <p className="meta">
              With accounts on, the coach&rsquo;s MCP server over HTTP and scripts calling the API need a token, sent as{" "}
              <code>Authorization: Bearer rr_…</code>. A read token cannot pick moments or record clips. See{" "}
              <Link href="/settings#connect">Connect another app</Link>.
            </p>
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setMsg(null);
                try {
                  const t = await api.admin.createToken(name, scope);
                  setMade(t.token ?? null);
                  setName("");
                  await reload();
                } catch (err) {
                  setMsg(errorText(err));
                }
              }}
            >
              <label>
                App
                <input className="input small" required value={name} onChange={(e) => setName(e.target.value)} placeholder="LM Studio" />
              </label>
              <label>
                Can
                <select className="input small" value={scope} onChange={(e) => setScope(e.target.value as "read" | "write")}>
                  <option value="read">Read</option>
                  <option value="write">Read and write</option>
                </select>
              </label>
              <button type="submit" className="btn btn-fill">
                Create token
              </button>
            </form>
            {made ? (
              <div className="notice">
                <p>Copy the token now; it is not shown again.</p>
                <Secret value={made} />
              </div>
            ) : null}
            {data.tokens.length ? (
              <ul className="plain-list">
                {data.tokens.map((t) => (
                  <li key={t.id}>
                    <b>{t.name}</b> <span className="meta">{t.scope === "write" ? "read and write" : "read"} · made by {t.userName ?? "?"} · used {ago(t.lastUsedAt)}</span>
                    {t.revokedAt ? (
                      <span className="tag">Revoked</span>
                    ) : (
                      <ConfirmButton label="Revoke" question={`Revoke the ${t.name} token?`} onConfirm={async () => {
                        await api.admin.revokeToken(t.id);
                        await reload();
                      }} />
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="settings-sec" aria-labelledby="sess-h">
            <div className="sec-h">
              <h2 id="sess-h">Signed in</h2>
            </div>
            {!data.authEnabled ? (
              <p className="meta">Accounts are off, so nobody signs in.</p>
            ) : data.sessions.length ? (
              <ul className="plain-list">
                {data.sessions.map((s) => (
                  <li key={s.id}>
                    <b>{s.userName ?? s.userId}</b> <span className="meta">{s.userAgent?.slice(0, 60) || "Unknown browser"} · last seen {ago(s.lastSeenAt)}</span>
                    <ConfirmButton label="Sign out" danger={false} question={`Sign ${s.userName ?? "them"} out on that browser?`} onConfirm={async () => {
                      await api.admin.endSession(s.id);
                      await reload();
                    }} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">Nobody is signed in.</p>
            )}
          </section>

          <section className="settings-sec" aria-labelledby="fail-h">
            <div className="sec-h">
              <h2 id="fail-h">Failed sign-ins, last 7 days</h2>
            </div>
            {data.failedLogins.length ? (
              <ul className="plain-list">
                {data.failedLogins.map((f, i) => (
                  <li key={i}>
                    <span className="mono">{f.username}</span> <span className="meta">{ago(f.at)} {f.ip ? `from ${f.ip}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">None. Five wrong passwords lock a username for 15 minutes.</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
