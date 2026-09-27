import { useState } from 'react';
import { api } from '@/lib/api/client';
import { auditLabel } from '@/lib/audit';
import { ago, errorText, when } from '@/lib/format';
import { useStore } from '../state/store';
import { ConfirmButton, LoadState, PaneHead, Secret, Status, useLoad } from '../ui/kit';

/** Admin, Security (doc 30 AD12): sessions, failed sign-ins, tokens for other apps. */
export function Security() {
  const s = useStore();
  const { data, error, reload } = useLoad(() => api.admin.security());
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [made, setMade] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="pane">
      <PaneHead title="Security" lede="Who is signed in, who failed to sign in, and which other apps may read your matches." />
      <Status msg={msg} />
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
          <section className="sec">
            <div className="sec-h">
              <h2>Tokens for other apps</h2>
            </div>
            <p className="meta">
              With accounts on, the coach&rsquo;s MCP server over HTTP and scripts calling the API need a token, sent as <code>Authorization: Bearer rr_…</code>. A read
              token cannot pick moments or record clips. See{' '}
              <button type="button" className="link" onClick={() => s.openSettings('connect')}>
                Connect another app
              </button>
              .
            </p>
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setMsg(null);
                try {
                  const t = await api.admin.createToken(name, scope);
                  setMade(t.token ?? null);
                  setName('');
                  await reload();
                } catch (err) {
                  setMsg({ ok: false, text: errorText(err) });
                }
              }}
            >
              <label>
                App
                <input className="field" required value={name} onChange={(e) => setName(e.target.value)} placeholder="LM Studio" />
              </label>
              <label>
                Can
                <select className="select" value={scope} onChange={(e) => setScope(e.target.value as 'read' | 'write')}>
                  <option value="read">Read</option>
                  <option value="write">Read and write</option>
                </select>
              </label>
              <button type="submit" className="btn btn-default">
                Create Token
              </button>
            </form>
            {made ? (
              <div className="callout">
                <p>Copy the token now; it is not shown again.</p>
                <Secret value={made} />
              </div>
            ) : null}
            {data.tokens.length ? (
              <ul className="rows">
                {data.tokens.map((t) => (
                  <li key={t.id}>
                    <span>
                      <b>{t.name}</b>{' '}
                      <span className="meta">
                        {t.scope === 'write' ? 'read and write' : 'read'} · made by {t.userName ?? '?'} · used {ago(t.lastUsedAt)}
                      </span>
                    </span>
                    {t.revokedAt ? (
                      <span className="tag">Revoked</span>
                    ) : (
                      <ConfirmButton
                        label="Revoke"
                        question={`Revoke the ${t.name} token?`}
                        onConfirm={async () => {
                          await api.admin.revokeToken(t.id);
                          await reload();
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="sec">
            <div className="sec-h">
              <h2>Signed in</h2>
            </div>
            {!data.authEnabled ? (
              <p className="meta">Accounts are off, so nobody signs in.</p>
            ) : data.sessions.length ? (
              <ul className="rows">
                {data.sessions.map((x) => (
                  <li key={x.id}>
                    <span>
                      <b>{x.userName ?? x.userId}</b>{' '}
                      <span className="meta">
                        {x.userAgent?.slice(0, 60) || 'Unknown browser'} · last seen {ago(x.lastSeenAt)}
                      </span>
                    </span>
                    <ConfirmButton
                      label="Sign out"
                      danger={false}
                      question={`Sign ${x.userName ?? 'them'} out on that browser?`}
                      onConfirm={async () => {
                        await api.admin.endSession(x.id);
                        await reload();
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">Nobody is signed in.</p>
            )}
          </section>

          <section className="sec">
            <div className="sec-h">
              <h2>Failed sign-ins, last 7 days</h2>
            </div>
            {data.failedLogins.length ? (
              <ul className="rows">
                {data.failedLogins.map((f, i) => (
                  <li key={i}>
                    <span className="mono">{f.username}</span>
                    <span className="meta">
                      {ago(f.at)} {f.ip ? `from ${f.ip}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">None. Five wrong passwords lock a username for 15 minutes.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

const FILTERS = [
  { id: '', label: 'Everything' },
  { id: 'auth.', label: 'Sign-ins' },
  { id: 'admin.user', label: 'Users' },
  { id: 'admin.match', label: 'Matches (admin)' },
  { id: 'match.', label: 'Matches (owners)' },
  { id: 'admin.setting', label: 'Settings' },
  { id: 'admin.token', label: 'Tokens' },
  { id: 'user.', label: 'Accounts' },
];

const PAGE = 100;

/** Admin, Audit log (doc 30 AD13): who did what, when. */
export function Audit() {
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);

  return (
    <div className="pane">
      <PaneHead title="Audit log" lede="Every sign-in, role change, delete, setting change and export, newest first.">
        <select
          className="select"
          aria-label="Show"
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
      </PaneHead>
      {/* A new key per filter and page, so each loads its own rows */}
      <AuditBody key={`${action}:${offset}`} action={action} offset={offset} setOffset={setOffset} />
    </div>
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
                <td className="meta num">{when(a.at)}</td>
                <td>{a.actorName ?? a.actorId ?? '–'}</td>
                <td title={a.action}>{auditLabel(a.action)}</td>
                <td className={a.targetName ? undefined : 'mono small'}>{a.targetName ?? a.target ?? ''}</td>
                <td className="mono small">{a.detail ? JSON.stringify(a.detail).slice(0, 80) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.total > PAGE ? (
        <div className="pager">
          <button type="button" className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Newer
          </button>
          <span className="meta num">
            {offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}
          </span>
          <button type="button" className="btn" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
            Older
          </button>
        </div>
      ) : null}
    </>
  );
}
