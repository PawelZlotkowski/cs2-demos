import { useState } from 'react';
import { api } from '@/lib/api/client';
import type { Invite, Role } from '@/lib/contracts';
import { ago, bytes, errorText, when } from '@/lib/format';
import { useAuth } from '../state/auth';
import { useStore } from '../state/store';
import { Avatar, ConfirmButton, LoadState, PaneHead, Secret, Status, useLoad } from '../ui/kit';

const ROLES: { id: Role; label: string }[] = [
  { id: 'player', label: 'Player' },
  { id: 'labeller', label: 'Labeller' },
  { id: 'admin', label: 'Admin' },
];

type Msg = { ok: boolean; text: string } | null;

function AccountsOff() {
  return (
    <p className="empty">
      Accounts are off, so there are no users yet and this computer is the admin. Set <code>RR_AUTH_ENABLED=true</code> in <code>apps/api/.env</code> and restart the
      API; the first account you create becomes the admin and takes over the matches already here.
    </p>
  );
}

/** Admin, Users (doc 30 AD04): roles, disable, sign out everywhere, reset code, delete. */
export function Users() {
  const { state, user: me } = useAuth();
  const { data, error, reload } = useLoad(() => api.admin.users());
  const [msg, setMsg] = useState<Msg>(null);
  const [reset, setReset] = useState<{ name: string; code: string } | null>(null);

  async function act(fn: () => Promise<unknown>, done?: string) {
    setMsg(null);
    try {
      await fn();
      if (done) setMsg({ ok: true, text: done });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  return (
    <div className="pane">
      <PaneHead title="Users" lede="Everyone with an account. Players see only their own matches; labellers can also read every match in the Lab; admins can do everything here." />
      {state && !state.authEnabled ? <AccountsOff /> : null}
      <Status msg={msg} />
      {reset ? (
        <div className="callout">
          <p>
            Reset code for <b>{reset.name}</b>. Give it to them; it works once, for 24 hours, on the sign-in screen under &ldquo;I have a reset code&rdquo;.
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
                    <span className="who-cell">
                      <Avatar name={u.displayName} url={u.avatarUrl} size={20} />
                      <b>{u.displayName}</b>
                      {u.id === me?.id ? <span className="meta">(you)</span> : null}
                      {u.disabled ? <span className="tag">Disabled</span> : null}
                    </span>
                  </td>
                  <td className="meta">{[u.username ? `@${u.username}` : null, u.steamId ? 'Steam' : null].filter(Boolean).join(' · ')}</td>
                  <td>
                    <select
                      className="select"
                      aria-label={`Role of ${u.displayName}`}
                      value={u.role}
                      disabled={u.id === me?.id}
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
                  <td className="n num">{bytes(u.bytes)}</td>
                  <td className="meta">{ago(u.lastSeenAt)}</td>
                  <td className="row-actions">
                    {u.id !== me?.id ? (
                      <button
                        type="button"
                        className="link"
                        onClick={() =>
                          void act(
                            () => api.admin.patchUser(u.id, { disabled: !u.disabled }),
                            u.disabled ? `${u.displayName} can sign in again.` : `${u.displayName} is disabled and signed out.`,
                          )
                        }
                      >
                        {u.disabled ? 'Enable' : 'Disable'}
                      </button>
                    ) : null}
                    {u.sessions ? (
                      <button type="button" className="link" onClick={() => void act(() => api.admin.signOutUser(u.id), `${u.displayName} is signed out everywhere.`)}>
                        Sign out ({u.sessions})
                      </button>
                    ) : null}
                    {u.username ? (
                      <button
                        type="button"
                        className="link"
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
                        question={`Delete ${u.displayName} and their ${u.matches} ${u.matches === 1 ? 'match' : 'matches'}?`}
                        onConfirm={() => act(() => api.admin.deleteUser(u.id), `${u.displayName} was deleted.`)}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data && state?.authEnabled ? (
        <p className="meta">No accounts yet.</p>
      ) : null}
    </div>
  );
}

function inviteState(i: Invite): string {
  if (i.usedBy) return `Used by ${i.usedByName ?? 'a deleted user'}`;
  if (i.revokedAt) return 'Revoked';
  if (i.expiresAt && new Date(i.expiresAt) < new Date()) return 'Expired';
  return i.expiresAt ? `Open until ${when(i.expiresAt)}` : 'Open';
}

/** Admin, Invites (doc 27 A13): one code per person; the code is shown once. */
export function Invites() {
  const { data, error, reload } = useLoad(() => api.admin.invites());
  const [count, setCount] = useState(1);
  const [role, setRole] = useState<'player' | 'labeller'>('player');
  const [days, setDays] = useState(14);
  const [made, setMade] = useState<Invite[]>([]);
  const [msg, setMsg] = useState<Msg>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      setMade(await api.admin.createInvites(count, role, days || null));
      await reload();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }

  return (
    <div className="pane">
      <PaneHead title="Invites" lede="A code lets one person create an account or finish a Steam sign-up. Sign-up needs a code unless Settings says it is open." />
      <form className="inline-form" onSubmit={create}>
        <label>
          How many
          <input className="field short" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <label>
          Role
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as 'player' | 'labeller')}>
            <option value="player">Player</option>
            <option value="labeller">Labeller</option>
          </select>
        </label>
        <label>
          Valid for (days)
          <input className="field short" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </label>
        <button type="submit" className="btn btn-default">
          Create {count === 1 ? 'Code' : `${count} Codes`}
        </button>
      </form>
      <Status msg={msg} />
      {made.length ? (
        <div className="callout">
          <p>Copy {made.length === 1 ? 'this code' : 'these codes'} now; only the last four characters are kept.</p>
          {made.map((m) => (
            <Secret key={m.id} value={m.code ?? ''} note={m.role === 'labeller' ? 'Labeller' : undefined} />
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
                  <td>{i.role === 'labeller' ? 'Labeller' : 'Player'}</td>
                  <td className="meta">{ago(i.createdAt)}</td>
                  <td>{inviteState(i)}</td>
                  <td className="row-actions">
                    {!i.usedBy && !i.revokedAt ? (
                      <ConfirmButton
                        label="Revoke"
                        question={`Revoke code …${i.hint}?`}
                        onConfirm={async () => {
                          await api.admin.revokeInvite(i.id);
                          await reload();
                        }}
                      />
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
    </div>
  );
}

/** Admin, Study (doc 30 AD14): participants, consent and a pseudonymous export for the report. */
export function Study() {
  const s = useStore();
  const { data, error } = useLoad(() => api.admin.study());

  return (
    <div className="pane">
      <PaneHead title="Study" lede="Who took part, how much they used the coach and what they thought of it. The export uses a code per person, never names or SteamIDs.">
        <a className="btn" href={api.admin.studyExportUrl()} download>
          Export CSV
        </a>
      </PaneHead>
      <LoadState error={error} loading={!data} />
      {data ? (
        <>
          <p className="meta">
            Study mode is {data.studyMode ? 'on: new accounts see the consent step first' : 'off'}.{' '}
            <button type="button" className="link" onClick={() => s.openAdmin('settings')}>
              Change it in Settings
            </button>
            .
          </p>
          {data.participants.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Consent</th>
                    <th className="n">Matches</th>
                    <th className="n">Reviewed</th>
                    <th className="n">Questions</th>
                    <th className="n">Feedback</th>
                    <th className="n">Useful</th>
                  </tr>
                </thead>
                <tbody>
                  {data.participants.map((p) => (
                    <tr key={p.userId}>
                      <td className="mono">{p.participant}</td>
                      <td>{p.name}</td>
                      <td>{p.consented ? 'Given' : '–'}</td>
                      <td className="n num">{p.matches}</td>
                      <td className="n num">{p.reviewed}</td>
                      <td className="n num">{p.asks}</td>
                      <td className="n num">{p.feedback}</td>
                      <td className="n num">{p.feedback ? `${Math.round((100 * p.useful) / p.feedback)}%` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="meta">
              No participants yet. Make codes under{' '}
              <button type="button" className="link" onClick={() => s.openAdmin('invites')}>
                Invites
              </button>
              .
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
