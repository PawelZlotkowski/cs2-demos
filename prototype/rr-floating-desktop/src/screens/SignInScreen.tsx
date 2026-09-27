import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/format';
import { useAuth } from '../state/auth';

type Mode = 'signin' | 'create' | 'reset';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/**
 * The login window (doc 27 A05), drawn like the macOS lock screen: the date and time over the
 * wallpaper, the app's mark, and one frosted panel. Sign in with Steam or a username, create an
 * account (the first one is the admin, later ones need an invite unless sign-up is open), or use
 * a reset code from the admin.
 */
export function SignInScreen() {
  const { state, refresh, arrival, clearArrival, setWelcome } = useAuth();
  const from = arrival.kind === 'signin' ? arrival : null;
  const setup = !!state?.needsSetup;
  const [mode, setMode] = useState<Mode>(setup ? 'create' : from?.reset ? 'reset' : from?.invite ? 'create' : 'signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [invite, setInvite] = useState(from?.invite ?? '');
  const [code, setCode] = useState(from?.reset ?? '');
  const [error, setError] = useState<string | null>(from?.error ?? null);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  useEffect(() => {
    if (setup) setMode('create');
  }, [setup]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await api.login(username, password);
      else if (mode === 'create') await api.register({ username, password, displayName: displayName || undefined, inviteCode: invite || undefined });
      else await api.resetPassword(code, password);
      clearArrival();
      if (mode === 'create') setWelcome(true);
      await refresh();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const needsInvite = mode === 'create' && !setup && state?.signup === 'invite';
  const closed = mode === 'create' && !setup && state?.signup === 'closed';
  const heading = setup ? 'Create the admin account' : mode === 'create' ? 'Create an account' : mode === 'reset' ? 'Set a new password' : 'Round Reviewer';

  return (
    <div className="login">
      <div className="login-clock" aria-hidden>
        <span className="login-date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <span className="login-time num">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <main className="login-panel" aria-labelledby="login-h">
        <span className="login-mark" aria-hidden>
          <svg width="46" height="46" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="8" cy="8" r="2.2" fill="currentColor" />
          </svg>
        </span>
        <h1 id="login-h">{heading}</h1>
        {setup ? <p className="login-note">This is the first account on this computer, so it becomes the admin and takes over the matches already here.</p> : null}
        {mode === 'reset' ? <p className="login-note">Enter the code the admin gave you and choose a new password.</p> : null}

        {error ? (
          <p className="login-err" role="alert">
            {error}
          </p>
        ) : null}

        {mode !== 'reset' && !closed && state?.steam !== false ? (
          <>
            <a className="btn btn-large login-steam" href={api.steamStartUrl({ next: '/', invite: invite || undefined })}>
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="10.4" cy="6" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path d="M2.6 9.6l3.8 1.6M6.4 11.2a1.5 1.5 0 1 0 0-.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              {mode === 'create' ? 'Create an account with Steam' : 'Sign in with Steam'}
            </a>
            <p className="login-or">
              <span>or with a username</span>
            </p>
          </>
        ) : null}

        {closed ? (
          <p className="login-note">Sign-up is closed. Ask the admin for an account.</p>
        ) : (
          <form className="login-form" onSubmit={submit}>
            {mode === 'reset' ? (
              <input className="field" aria-label="Reset code" placeholder="Reset code" required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
            ) : (
              <input
                className="field"
                aria-label="Username"
                placeholder="Username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                pattern="[A-Za-z0-9_.\-]{3,32}"
                title="3 to 32 letters, digits, dots, dashes or underscores"
              />
            )}
            {mode === 'create' ? (
              <input
                className="field"
                aria-label="Name shown in the app (optional)"
                placeholder="Name shown in the app (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
              />
            ) : null}
            <div className="login-pw">
              <input
                className="field"
                type="password"
                aria-label={mode === 'signin' ? 'Password' : 'New password, at least 10 characters'}
                placeholder={mode === 'signin' ? 'Password' : 'New password, 10 characters or more'}
                required
                minLength={mode === 'signin' ? 1 : 10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
              <button type="submit" className="login-go" disabled={busy} aria-label={mode === 'signin' ? 'Sign in' : mode === 'create' ? 'Create account' : 'Set password'}>
                {busy ? (
                  <span className="thinking" aria-hidden />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
            {needsInvite ? (
              <input className="field" aria-label="Invite code" placeholder="Invite code, like ABCD-1234-EF56" required value={invite} onChange={(e) => setInvite(e.target.value)} />
            ) : null}
          </form>
        )}

        {!setup ? (
          <p className="login-switch">
            {mode !== 'signin' ? (
              <button type="button" className="link" onClick={() => setMode('signin')}>
                I have an account
              </button>
            ) : null}
            {mode !== 'create' && state?.signup !== 'closed' ? (
              <button type="button" className="link" onClick={() => setMode('create')}>
                Create an account
              </button>
            ) : null}
            {mode !== 'reset' ? (
              <button type="button" className="link" onClick={() => setMode('reset')}>
                I have a reset code
              </button>
            ) : null}
          </p>
        ) : null}
      </main>
    </div>
  );
}
