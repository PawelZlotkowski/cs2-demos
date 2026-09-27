import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/client';
import type { CoachLanguage, CoachedPlayer, SystemStatus } from '@/lib/contracts';
import { BUSY, errorText, fromRow, type Match } from '../data/model';

export type WinId = 'matches' | 'addMatch' | 'studio' | 'progress' | 'coach' | 'settings' | 'lab';

export const WIN_TITLE: Record<WinId, string> = {
  matches: 'Matches',
  addMatch: 'Add Match',
  studio: 'Studio',
  progress: 'Progress',
  coach: 'Coach',
  settings: 'Settings',
  lab: 'Lab',
};

const SIZE: Record<WinId, [number, number]> = {
  matches: [900, 560],
  addMatch: [700, 480],
  studio: [1320, 820],
  progress: [900, 660],
  coach: [780, 720],
  settings: [680, 680],
  lab: [1040, 720],
};

/** Where each window first appears, as a share of the free desktop, so first opens cascade instead of stacking. */
const PLACE: Record<WinId, [number, number]> = {
  matches: [0.1, 0.08],
  addMatch: [0.5, 0.3],
  studio: [0.5, 0.5],
  progress: [0.3, 0.2],
  coach: [0.7, 0.3],
  settings: [0.45, 0.25],
  lab: [0.4, 0.35],
};

export const MENU_H = 26;
export const DOCK_RESERVE = 88;

export type Rect = { x: number; y: number; w: number; h: number };
export type Win = Rect & { id: WinId; open: boolean; minimized: boolean; z: number; zoomed: boolean; restore: Rect | null; placed: boolean };

export function desktopArea() {
  return { x: 0, y: MENU_H, w: window.innerWidth, h: window.innerHeight - MENU_H - DOCK_RESERVE };
}

function placeFor(id: WinId): Rect {
  const a = desktopArea();
  const w = Math.min(SIZE[id][0], a.w - 32);
  const h = Math.min(SIZE[id][1], a.h - 16);
  const [px, py] = PLACE[id];
  return { w, h, x: Math.round(a.x + (a.w - w) * px), y: Math.round(a.y + 8 + (a.h - 16 - h) * py) };
}

type WmState = { wins: Record<WinId, Win>; top: number };
type WmAction =
  | { type: 'open'; id: WinId }
  | { type: 'close'; id: WinId }
  | { type: 'minimize'; id: WinId }
  | { type: 'focus'; id: WinId }
  | { type: 'rect'; id: WinId; rect: Partial<Win> }
  | { type: 'zoom'; id: WinId };

function wmReducer(s: WmState, a: WmAction): WmState {
  const w = s.wins[a.id];
  const put = (next: Partial<Win>, raise = false): WmState => ({
    top: raise ? s.top + 1 : s.top,
    wins: { ...s.wins, [a.id]: { ...w, ...next, ...(raise ? { z: s.top + 1 } : {}) } },
  });
  switch (a.type) {
    case 'open':
      if (w.open && !w.minimized && w.z === s.top) return s;
      return put({ open: true, minimized: false, ...(w.placed ? {} : { ...placeFor(a.id), placed: true }) }, true);
    case 'close':
      return put({ open: false, minimized: false, zoomed: false, restore: null });
    case 'minimize':
      return put({ minimized: true });
    case 'focus':
      return w.z === s.top ? s : put({}, true);
    case 'rect':
      return put({ ...a.rect });
    case 'zoom': {
      if (w.zoomed && w.restore) return put({ ...w.restore, zoomed: false, restore: null }, true);
      const ar = desktopArea();
      return put({ x: 8, y: ar.y + 6, w: ar.w - 16, h: ar.h - 6, zoomed: true, restore: { x: w.x, y: w.y, w: w.w, h: w.h } }, true);
    }
  }
}

function initialWm(): WmState {
  const ids = Object.keys(WIN_TITLE) as WinId[];
  const wins = Object.fromEntries(
    ids.map((id) => [id, { id, open: false, minimized: false, z: 0, x: 0, y: 0, w: SIZE[id][0], h: SIZE[id][1], zoomed: false, restore: null, placed: false }]),
  ) as Record<WinId, Win>;
  return { wins, top: 1 };
}

/** FastAPI's reply for a route it does not have: the API is from a copy without PR #22's endpoints. */
const isMissingRoute = (e: unknown) => e instanceof Error && e.message === 'Not Found';

export type Notice = { id: number; title: string; body: string; action?: { label: string; run: () => void } };
export type StudioTarget = { matchId: string; findingId?: string; nonce: number };

type Store = {
  wins: Record<WinId, Win>;
  focused: WinId | null;
  open: (id: WinId) => void;
  close: (id: WinId) => void;
  minimize: (id: WinId) => void;
  focus: (id: WinId) => void;
  setRect: (id: WinId, rect: Partial<Win>) => void;
  zoom: (id: WinId) => void;

  /** Every match the API knows, newest first; polled while one is being processed. */
  matches: Match[];
  matchesError: string | null;
  /** The API answers but lacks the endpoints this desktop needs (GET /matches, /players): it is from another copy. */
  apiTooOld: boolean;
  refreshMatches: () => Promise<void>;
  /** GET /system: which model llama-server serves and what is switched on. */
  system: SystemStatus | null;
  refreshSystem: () => Promise<void>;
  /** People picked for review in at least one match; the Coach and Progress windows follow one of them. */
  players: CoachedPlayer[];
  playerId: string | null;
  pickPlayer: (id: string) => void;
  /** The match the Add match window should ask a player for (from Matches' "Pick a player"). */
  /** The match the Add Match installer follows; null for a fresh upload. */
  installFor: string | null;
  /** Open the installer on a match (picks up at its current step), or on a new upload. */
  openInstaller: (matchId: string | null) => void;
  /** The installer says which match it follows now, without raising the window. */
  followInstall: (matchId: string | null) => void;
  studio: StudioTarget | null;
  openStudio: (matchId: string, findingId?: string) => void;

  lab: boolean;
  setLab: (on: boolean) => void;
  language: CoachLanguage;
  setLanguage: (l: CoachLanguage) => void;

  notices: Notice[];
  notify: (n: Omit<Notice, 'id'>) => void;
  dismiss: (id: number) => void;
};

const Ctx = createContext<Store | null>(null);

/** The switch in Settings or ?lab=1; null when neither was set, so the API's RR_LAB_ENABLED decides. */
function labFromUrl(): boolean | null {
  try {
    const q = new URLSearchParams(window.location.search).get('lab');
    if (q != null) return q === '1';
    const saved = window.localStorage.getItem('rr.lab');
    return saved == null ? null : saved === '1';
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [wm, dispatch] = useReducer(wmReducer, undefined, initialWm);
  const [matches, setMatchesState] = useState<Match[]>([]);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [apiTooOld, setApiTooOld] = useState(false);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [players, setPlayers] = useState<CoachedPlayer[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [studio, setStudio] = useState<StudioTarget | null>(null);
  const [installFor, setInstallFor] = useState<string | null>(null);
  const [lab, setLabState] = useState(() => labFromUrl() ?? false);
  const [language, setLanguage] = useState<CoachLanguage>('en');
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextNotice = useRef(1);

  const refreshPlayers = useCallback(async () => {
    try {
      const ps = await api.getPlayers();
      setPlayers(ps);
      setApiTooOld(false);
      setPlayerId((cur) => {
        if (cur && ps.some((p) => p.id === cur)) return cur;
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem('rr.coachPlayer');
        } catch {
          /* storage blocked */
        }
        return ps.find((p) => p.id === saved)?.id ?? ps[0]?.id ?? null;
      });
    } catch (e) {
      if (isMissingRoute(e)) setApiTooOld(true);
    }
  }, []);

  const refreshMatches = useCallback(async () => {
    try {
      const rows = await api.listMatches();
      setMatchesState(rows.map(fromRow));
      setMatchesError(null);
    } catch (e) {
      setMatchesError(errorText(e));
      if (isMissingRoute(e)) setApiTooOld(true);
    }
    void refreshPlayers();
  }, [refreshPlayers]);

  const refreshSystem = useCallback(async () => {
    try {
      setSystem(await api.getSystem());
    } catch {
      setSystem(null);
    }
  }, []);

  useEffect(() => {
    void refreshMatches();
    void refreshSystem();
    api
      .features()
      .then((f) => {
        if (f.lab && labFromUrl() == null) setLabState(true);
      })
      .catch(() => undefined);
  }, [refreshMatches, refreshSystem]);

  const busy = matches.some((m) => BUSY.has(m.status));
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => void refreshMatches(), 2500);
    return () => window.clearInterval(t);
  }, [busy, refreshMatches]);

  const pickPlayer = useCallback((id: string) => {
    setPlayerId(id);
    try {
      window.localStorage.setItem('rr.coachPlayer', id);
    } catch {
      /* storage blocked */
    }
  }, []);

  const open = useCallback((id: WinId) => dispatch({ type: 'open', id }), []);
  const close = useCallback((id: WinId) => dispatch({ type: 'close', id }), []);
  const minimize = useCallback((id: WinId) => dispatch({ type: 'minimize', id }), []);
  const focus = useCallback((id: WinId) => dispatch({ type: 'focus', id }), []);
  const setRect = useCallback((id: WinId, rect: Partial<Win>) => dispatch({ type: 'rect', id, rect }), []);
  const zoom = useCallback((id: WinId) => dispatch({ type: 'zoom', id }), []);

  const openStudio = useCallback((matchId: string, findingId?: string) => {
    setStudio((s) => ({ matchId, findingId, nonce: (s?.nonce ?? 0) + 1 }));
    dispatch({ type: 'open', id: 'studio' });
  }, []);

  const openInstaller = useCallback((matchId: string | null) => {
    setInstallFor(matchId);
    dispatch({ type: 'open', id: 'addMatch' });
  }, []);

  const setLab = useCallback((on: boolean) => {
    setLabState(on);
    try {
      window.localStorage.setItem('rr.lab', on ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    if (!on) dispatch({ type: 'close', id: 'lab' });
  }, []);

  const dismiss = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (n: Omit<Notice, 'id'>) => {
      const id = nextNotice.current++;
      setNotices((all) => [...all.slice(-2), { ...n, id }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );


  // Say when a match finishes in the background: a pick is waiting, or its review is ready.
  // The installer shows both itself while it follows that match.
  const lastStatus = useRef(new Map<string, Match['status']>());
  const installerOn = wm.wins.addMatch.open && !wm.wins.addMatch.minimized;
  useEffect(() => {
    const prev = lastStatus.current;
    for (const m of matches) {
      const was = prev.get(m.id);
      prev.set(m.id, m.status);
      if (!was || was === m.status || !BUSY.has(was)) continue;
      if (installerOn && installFor === m.id) continue;
      if (m.status === 'awaiting_player')
        notify({
          title: `${m.mapLabel} ${m.score} is ready for a player`,
          body: 'The demo has been read. Pick whose game the coach should review.',
          action: { label: 'Pick a player', run: () => openInstaller(m.id) },
        });
      else if (m.status === 'complete')
        notify({
          title: `Review ready: ${m.mapLabel} ${m.score}`,
          body: `${m.playerName ?? 'The player'}, written by ${m.model ?? 'the templates'}.${m.versions ? ' The earlier review is kept.' : ''}`,
          action: { label: 'Open in Studio', run: () => openStudio(m.id) },
        });
      else if (m.status === 'failed')
        notify({ title: `${m.mapLabel}: the demo could not be processed`, body: m.error ?? 'Open Matches for details.' });
    }
  }, [matches, installerOn, installFor, notify, openInstaller, openStudio]);

  const focused = useMemo(() => {
    let best: Win | null = null;
    for (const w of Object.values(wm.wins)) if (w.open && !w.minimized && (!best || w.z > best.z)) best = w;
    return best?.id ?? null;
  }, [wm.wins]);

  const value: Store = {
    wins: wm.wins,
    focused,
    open,
    close,
    minimize,
    focus,
    setRect,
    zoom,
    matches,
    matchesError,
    apiTooOld,
    refreshMatches,
    system,
    refreshSystem,
    players,
    playerId,
    pickPlayer,
    installFor,
    openInstaller,
    followInstall: setInstallFor,
    studio,
    openStudio,
    lab,
    setLab,
    language,
    setLanguage,
    notices,
    notify,
    dismiss,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
