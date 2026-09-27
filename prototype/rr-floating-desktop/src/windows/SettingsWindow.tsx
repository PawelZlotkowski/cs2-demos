import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/client';
import { ago, errorText } from '@/lib/format';
import { pushSettings, readStartRate } from '@/lib/prefs';
import { CHECK_NAME, STATE_LABEL } from '../admin/Control';
import { COACH_LANGUAGES } from '../data/languages';
import { WindowFrame } from '../desktop/WindowFrame';
import { ROLE_LABEL, useAuth } from '../state/auth';
import { useStore, type SettingsPane } from '../state/store';
import { Avatar, ConfirmButton, LoadState, PaneHead, Status, useLoad } from '../ui/kit';
import { Segmented } from '../ui/Segmented';

const G = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

type Pane = { id: SettingsPane; label: string; tint: string; glyph: ReactNode; account?: boolean };

const PANES: Pane[] = [
  { id: 'coach', label: 'Coach and playback', tint: '#5856d6', glyph: <g {...G}><path d="M3 4.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7.5L5 13v-2h-.5A1.5 1.5 0 0 1 3 9.5z" /></g> },
  { id: 'sessions', label: 'Signed in', tint: '#34a853', account: true, glyph: <g {...G}><rect x="2.5" y="3.5" width="11" height="7.5" rx="1.3" /><path d="M6 13.5h4M8 11v2.5" /></g> },
  { id: 'data', label: 'Your data', tint: '#8e8e93', account: true, glyph: <g {...G}><path d="M8 2.5v7M5 7l3 3 3-3M3 12.5h10" /></g> },
  { id: 'system', label: 'System', tint: '#636366', glyph: <g {...G}><rect x="4" y="4" width="8" height="8" rx="1.5" /><path d="M6.5 2v2M9.5 2v2M6.5 12v2M9.5 12v2M2 6.5h2M2 9.5h2M12 6.5h2M12 9.5h2" /></g> },
  { id: 'connect', label: 'Connect another app', tint: '#007aff', glyph: <g {...G}><path d="M6.5 9.5l3-3M5 7.5L3.8 8.7a2.3 2.3 0 0 0 3.3 3.3L8.3 10.8M11 8.5l1.2-1.2a2.3 2.3 0 0 0-3.3-3.3L7.7 5.2" /></g> },
];

/**
 * Settings (doc 27 A07) in the System Settings shape: the account card on top of the source list
 * (Profile), then Coach and playback, where the account is signed in, the data download and
 * account deletion, and this computer's System check and MCP connection.
 */
export function SettingsWindow() {
  const s = useStore();
  const { user, state } = useAuth();
  const accounts = !!state?.authEnabled && !!user;
  const pane: SettingsPane = !accounts && (s.settingsPane === 'account' || s.settingsPane === 'sessions' || s.settingsPane === 'data') ? 'coach' : s.settingsPane;
  const panes = PANES.filter((p) => accounts || !p.account);
  const title = pane === 'account' ? 'Profile' : PANES.find((p) => p.id === pane)?.label;

  return (
    <WindowFrame id="settings" subtitle={title} minW={640} minH={420} flush>
      <div className="split">
        <nav className="source" aria-label="Settings">
          {accounts && user ? (
            <button type="button" className="source-me as-item" aria-current={pane === 'account' ? 'page' : undefined} onClick={() => s.openSettings('account')}>
              <Avatar name={user.displayName} url={user.avatarUrl} size={34} />
              <span>
                <b>{user.displayName}</b>
                <span className="meta">
                  {ROLE_LABEL[user.role]}
                  {user.steamId ? ' · Steam' : ''}
                </span>
              </span>
            </button>
          ) : (
            <div className="source-me">
              <Avatar name="·" size={34} />
              <span>
                <b>This computer</b>
                <span className="meta">Accounts are off</span>
              </span>
            </div>
          )}
          <div className="source-group">
            {panes.map((p) => (
              <button key={p.id} type="button" className="source-item" aria-current={p.id === pane ? 'page' : undefined} onClick={() => s.openSettings(p.id)}>
                <span className="source-ico" style={{ background: p.tint }} aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 16 16">
                    {p.glyph}
                  </svg>
                </span>
                {p.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="split-body" key={pane}>
          {pane === 'account' ? (
            <Profile />
          ) : pane === 'coach' ? (
            <CoachPrefs />
          ) : pane === 'sessions' ? (
            <Sessions />
          ) : pane === 'data' ? (
            <YourData />
          ) : pane === 'system' ? (
            <SystemPane />
          ) : (
            <ConnectPane />
          )}
        </div>
      </div>
    </WindowFrame>
  );
}

const RATES = [0.5, 1, 2] as const;

/** Coach answer language and the Studio's starting speed, saved on the account (A07). */
function CoachPrefs() {
  const s = useStore();
  const [rate, setRate] = useState<number>(() => {
    const r: number = readStartRate();
    return (RATES as readonly number[]).includes(r) ? r : 1;
  });
  return (
    <div className="pane">
      <PaneHead title="Coach and playback" lede="Saved on your account, so the coach answers the same way in every browser." />
      <ul className="group settings-list">
        <li className="setting">
          <span className="setting-l">
            Coach language
            <span className="meta">Explanations and Ask answers. The app itself stays in English.</span>
          </span>
          <span className="setting-v">
            <Segmented label="Coach language" value={s.language} onChange={s.setLanguage} options={COACH_LANGUAGES.map((l) => ({ id: l.id, label: l.label }))} />
          </span>
        </li>
        <li className="setting">
          <span className="setting-l">
            Starting speed
            <span className="meta">How fast the Studio plays when a match opens.</span>
          </span>
          <span className="setting-v">
            <Segmented
              label="Starting speed"
              value={String(rate)}
              onChange={(v) => {
                const r = Number(v);
                setRate(r);
                void pushSettings({ playbackSpeed: r });
              }}
              options={RATES.map((r) => ({ id: String(r), label: `${r}×` }))}
            />
          </span>
        </li>
      </ul>
    </div>
  );
}

/** Profile: name, username, password and Steam (A07). Only with accounts on. */
function Profile() {
  const { user, state, refresh, arrival, clearArrival } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(arrival.kind === 'settings' && arrival.error ? { ok: false, text: arrival.error } : null);
  const [busy, setBusy] = useState(false);

  // Shown once: the error the Steam link came back with
  useEffect(() => {
    if (arrival.kind === 'settings') clearArrival();
  }, [arrival.kind, clearArrival]);

  if (!user || !state) return null;

  async function save(e: React.FormEvent, body: Parameters<typeof api.updateMe>[0], done: string) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.updateMe(body);
      await refresh();
      setCurrent('');
      setNext('');
      setMsg({ ok: true, text: done });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pane">
      <div className="profile-h">
        <Avatar name={user.displayName} url={user.avatarUrl} size={64} />
        <div>
          <h1>{user.displayName}</h1>
          <p className="meta">
            {ROLE_LABEL[user.role]}
            {user.username ? ` · @${user.username}` : ''}
            {user.createdAt ? ` · since ${new Date(user.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : ''}
          </p>
        </div>
      </div>
      <Status msg={msg} />

      <section className="sec">
        <div className="sec-h">
          <h2>Name and username</h2>
        </div>
        <form className="form-grid" onSubmit={(e) => save(e, { displayName: displayName.trim(), username: username.trim() || undefined }, 'Profile saved.')}>
          <label>
            Name shown in the app
            <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} required />
          </label>
          <label>
            Username
            <input
              className="field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[A-Za-z0-9_.\-]{3,32}"
              title="3 to 32 letters, digits, dots, dashes or underscores"
              autoComplete="username"
              required={user.hasPassword}
            />
          </label>
          <span className="form-go">
            <button type="submit" className="btn" disabled={busy}>
              Save
            </button>
          </span>
        </form>
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Password</h2>
        </div>
        <form
          className="form-grid"
          onSubmit={(e) =>
            save(
              e,
              { currentPassword: user.hasPassword ? current : undefined, newPassword: next, username: username.trim() || undefined },
              user.hasPassword ? 'Password changed. Other browsers are signed out.' : 'Password set.',
            )
          }
        >
          {user.hasPassword ? (
            <label>
              Current password
              <input className="field" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </label>
          ) : null}
          <label>
            {user.hasPassword ? 'New password' : 'Set a password'}
            <input className="field" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={10} autoComplete="new-password" required />
          </label>
          <span className="form-go">
            <button type="submit" className="btn" disabled={busy}>
              {user.hasPassword ? 'Change Password' : 'Set Password'}
            </button>
          </span>
        </form>
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Steam</h2>
        </div>
        <ul className="rows">
          <li>
            <span>{user.steamId ? <span className="mono">{user.steamId}</span> : <span className="meta">Not linked</span>}</span>
            {user.steamId ? (
              user.hasPassword ? (
                <ConfirmButton
                  label="Unlink"
                  question="Unlink Steam from this account?"
                  onConfirm={async () => {
                    await api.unlinkSteam();
                    await refresh();
                  }}
                />
              ) : (
                <span className="meta">Set a password before unlinking, or you could not sign in.</span>
              )
            ) : state.steam ? (
              <a className="btn" href={api.steamStartUrl({ link: true, next: '/settings' })}>
                Link Steam…
              </a>
            ) : null}
          </li>
        </ul>
        <p className="meta">
          {user.steamId
            ? 'Matches where you played as this Steam account open with you already picked.'
            : 'Link Steam and the coach picks you in every demo you upload, without asking who you played as.'}
        </p>
      </section>
    </div>
  );
}

function shortAgent(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

/** Where this account is signed in, and ending the others (A07). */
function Sessions() {
  const { data, error, reload } = useLoad(() => api.mySessions());
  return (
    <div className="pane">
      <PaneHead title="Signed in" lede="Every browser signed in to your account. Sign out the ones you do not recognise." />
      <LoadState error={error} loading={!data} />
      {data ? (
        <ul className="rows">
          {data.map((x) => (
            <li key={x.id}>
              <span>
                <b>{x.userAgent ? shortAgent(x.userAgent) : 'Unknown browser'}</b>
                {x.current ? <span className="tag">This browser</span> : null}
                <span className="meta block">
                  {x.ip ?? 'no address'} · active {ago(x.lastSeenAt)}
                </span>
              </span>
              {x.current ? null : (
                <ConfirmButton
                  label="Sign out"
                  question="Sign out that browser?"
                  onConfirm={async () => {
                    await api.endMySession(x.id);
                    await reload();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A zip of everything, and deleting the account with it (A12). */
function YourData() {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const expected = user.username ?? 'DELETE';

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.deleteMe(confirm);
      window.location.assign('/');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="pane">
      <PaneHead title="Your data" lede="Take everything with you, or delete the account and all of it.">
        <a className="btn" href={api.exportUrl()} download>
          Download Everything
        </a>
      </PaneHead>
      <p className="meta">The download is a zip with your profile, matches, reviews, Ask history, notes and feedback. Demos and clips stay on this computer.</p>
      <section className="sec danger-zone">
        <div className="sec-h">
          <h2>Delete account</h2>
        </div>
        <p className="meta">Deletes your account, all your matches, reviews, clips, notes and feedback. It cannot be undone.</p>
        <form className="inline-form" onSubmit={remove}>
          <label>
            <span>
              Type <b>{expected}</b> to confirm
            </span>
            <input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <button type="submit" className="btn btn-danger" disabled={busy || confirm !== expected}>
            {busy ? 'Deleting…' : 'Delete Account'}
          </button>
        </form>
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function SystemPane() {
  const s = useStore();
  const { isAdmin } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState(() => new Date());
  const sys = s.system;

  async function check() {
    setChecking(true);
    await s.refreshSystem();
    setChecking(false);
    setCheckedAt(new Date());
  }

  return (
    <div className="pane">
      <PaneHead title="System" lede={`What this computer runs for the coach. Checked at ${checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`}>
        <button type="button" className="btn" onClick={() => void check()} disabled={checking}>
          {checking ? 'Checking…' : 'Check Again'}
        </button>
      </PaneHead>
      {!sys ? (
        <p className="err">The API is not answering, so nothing can be checked. Start it and press Check Again.</p>
      ) : (
        <>
          <ul className="group" style={{ opacity: checking ? 0.5 : 1 }}>
            {sys.checks.map((c) => (
              <li key={c.name} data-state={c.state}>
                <span className="check-name">{CHECK_NAME[c.name] ?? c.name}</span>
                <span className="check-state">{STATE_LABEL[c.state]}</span>
                <span className="check-detail">{c.detail}</span>
              </li>
            ))}
          </ul>
          <dl className="facts">
            <div>
              <dt>RR_LLM_MODEL</dt>
              <dd className="mono">{sys.llmModel}</dd>
            </div>
            <div>
              <dt>Served on the port</dt>
              <dd className="mono">{sys.servedModels.length ? sys.servedModels.join(', ') : 'nothing'}</dd>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <dt>Coach tools over MCP</dt>
              <dd className="mono small">{sys.mcpTools.join(', ')}</dd>
            </div>
          </dl>
          <p className="meta">
            The API reads <code>apps/api/.env</code> when it starts.{' '}
            {isAdmin ? (
              <>
                Most settings can be changed without a restart in{' '}
                <button type="button" className="link" onClick={() => s.openAdmin('settings')}>
                  Admin, Settings
                </button>
                .
              </>
            ) : (
              'Ask the admin to change them.'
            )}
          </p>
        </>
      )}
    </div>
  );
}

const LM_STUDIO = `{
  "mcpServers": {
    "cs2-demo": {
      "command": "python",
      "args": ["-m", "cs2_demo_mcp"],
      "env": { "RR_DATA_DIR": "C:/path/to/cs2-demos/apps/api/data" }
    }
  }
}`;

const CONNECT = [
  { id: 'http', label: 'Streamable HTTP', text: 'python -m cs2_demo_mcp --transport http', note: 'Serves http://127.0.0.1:8765/mcp. Add that URL as an MCP server in Open WebUI (External tools in recent versions).' },
  { id: 'stdio', label: 'Standard input and output', text: 'python -m cs2_demo_mcp', note: 'For apps that start the server themselves. LM Studio: put the block below in its mcp.json.' },
  { id: 'inspector', label: 'Check it first', text: 'npx @modelcontextprotocol/inspector python -m cs2_demo_mcp', note: 'Lists the tools and lets you call one by hand.' },
];

function ConnectPane() {
  const s = useStore();
  const { state, isAdmin } = useAuth();
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="pane">
      <PaneHead title="Connect another app" lede="The coach's tools are an MCP server, so a local chat app can read your matches the same way the coach does." />
      <p className="meta">
        It listens on this computer only. Two tools write (<code>select_moments</code>, <code>request_clip</code>), so connect only apps you trust.{' '}
        {state?.authEnabled ? (
          isAdmin ? (
            <>
              With accounts on, the HTTP server needs a token from{' '}
              <button type="button" className="link" onClick={() => s.openAdmin('security')}>
                Admin, Security
              </button>
              .
            </>
          ) : (
            'With accounts on, the HTTP server needs a token from the admin.'
          )
        ) : null}
      </p>
      <ul className="group connect">
        {CONNECT.map((r) => (
          <li key={r.id}>
            <span className="check-name">{r.label}</span>
            <code className="cmd">{r.text}</code>
            <button type="button" className="link small" onClick={() => void copy(r.id, r.text)}>
              {copied === r.id ? 'Copied' : 'Copy'}
            </button>
            <span className="check-detail">{r.note}</span>
          </li>
        ))}
      </ul>
      <pre className="out">{LM_STUDIO}</pre>
    </div>
  );
}
