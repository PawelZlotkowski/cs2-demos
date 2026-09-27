import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { UNAUTHORIZED_EVENT, api } from '@/lib/api/client';
import type { AuthState, UserOut } from '@/lib/contracts';
import { pullSettings } from '@/lib/prefs';

/**
 * Where the API sent the browser back to (Steam sign-in, a reset link) or where a share link points.
 * The desktop has one page, so it reads the path once at start and puts the address back to "/".
 */
export type Arrival =
  | { kind: 'none' }
  | { kind: 'signin'; error: string | null; invite: string | null; reset: string | null }
  | { kind: 'welcome' }
  | { kind: 'settings'; error: string | null }
  | { kind: 'shared'; token: string };

function readArrival(): Arrival {
  const { pathname, search } = window.location;
  const q = new URLSearchParams(search);
  let out: Arrival = { kind: 'none' };
  if (pathname.startsWith('/r/')) return { kind: 'shared', token: decodeURIComponent(pathname.slice(3)) };
  if (pathname === '/signin' || q.has('invite') || q.has('reset'))
    out = { kind: 'signin', error: q.get('error'), invite: q.get('invite'), reset: q.get('reset') };
  else if (pathname === '/welcome') out = { kind: 'welcome' };
  else if (pathname === '/settings') out = { kind: 'settings', error: q.get('error') };
  if (pathname !== '/' || out.kind !== 'none') {
    // Keep ?lab=1 and the like; drop what was only for this arrival
    for (const k of ['error', 'invite', 'reset', 'next']) q.delete(k);
    const rest = q.toString();
    window.history.replaceState(null, '', `/${rest ? `?${rest}` : ''}`);
  }
  return out;
}

// Read once at load, not in a state initialiser: StrictMode runs those twice, and the second run sees "/"
const FIRST_ARRIVAL = readArrival();

type AuthCtx = {
  /** null until the API has answered once */
  state: AuthState | null;
  /** The API did not answer /auth/me: the desktop opens anyway and each window says the API is down. */
  failed: boolean;
  user: UserOut | null;
  isAdmin: boolean;
  /** Admin or labeller: the Admin window (the labeller sees only its Lab) */
  canLab: boolean;
  refresh: () => Promise<AuthState | null>;
  signOut: () => Promise<void>;
  arrival: Arrival;
  clearArrival: () => void;
  /** The Setup Assistant after a new account (or a Steam sign-up landing on /welcome) */
  welcome: boolean;
  setWelcome: (on: boolean) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [failed, setFailed] = useState(false);
  const [arrival, setArrival] = useState<Arrival>(FIRST_ARRIVAL);
  const [welcome, setWelcome] = useState(FIRST_ARRIVAL.kind === 'welcome');

  const refresh = useCallback(async () => {
    try {
      const s = await api.authState();
      setState(s);
      setFailed(false);
      return s;
    } catch {
      setFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A 401 anywhere means the session ended (signed out elsewhere, disabled, expired): ask again
  useEffect(() => {
    const on = () => void refresh();
    window.addEventListener(UNAUTHORIZED_EVENT, on);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, on);
  }, [refresh]);

  // The account's coach language and starting speed follow it to this browser
  const userId = state?.user?.id;
  useEffect(() => {
    if (userId) void pullSettings();
  }, [userId]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    // A fresh page drops every window's data from the account that just left
    window.location.assign('/');
  }, []);

  const value = useMemo<AuthCtx>(() => {
    const user = state?.user ?? null;
    return {
      state,
      failed,
      user,
      isAdmin: user?.role === 'admin',
      canLab: user?.role === 'admin' || user?.role === 'labeller',
      refresh,
      signOut,
      arrival,
      clearArrival: () => setArrival({ kind: 'none' }),
      welcome,
      setWelcome,
    };
  }, [state, failed, refresh, signOut, arrival, welcome]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
}

export const ROLE_LABEL = { admin: 'Admin', labeller: 'Labeller', player: 'Player' } as const;
