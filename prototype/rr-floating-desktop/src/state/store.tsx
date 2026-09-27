import { createContext, useCallback, useContext, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { CoachLanguage } from '../mock/coach';
import { MATCHES, type Match } from '../mock/world';

export type WinId = 'matches' | 'addMatch' | 'studio' | 'progress' | 'coach' | 'settings' | 'lab';

export const WIN_TITLE: Record<WinId, string> = {
  matches: 'Matches',
  addMatch: 'Add match',
  studio: 'Studio',
  progress: 'Progress',
  coach: 'Coach',
  settings: 'Settings',
  lab: 'Lab',
};

const SIZE: Record<WinId, [number, number]> = {
  matches: [900, 560],
  addMatch: [520, 600],
  studio: [1320, 820],
  progress: [900, 660],
  coach: [780, 720],
  settings: [680, 680],
  lab: [1040, 720],
};

/** Where each window first appears, as a share of the free desktop, so first opens cascade instead of stacking. */
const PLACE: Record<WinId, [number, number]> = {
  matches: [0.1, 0.08],
  addMatch: [0.62, 0.14],
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

export type Notice = { id: number; title: string; body: string; action?: { label: string; run: () => void } };
export type StudioTarget = { matchId: string; findingId?: string; nonce: number };
export type Note = { id: string; round: number; t: number; note: string };

type Store = {
  wins: Record<WinId, Win>;
  focused: WinId | null;
  open: (id: WinId) => void;
  close: (id: WinId) => void;
  minimize: (id: WinId) => void;
  focus: (id: WinId) => void;
  setRect: (id: WinId, rect: Partial<Win>) => void;
  zoom: (id: WinId) => void;

  matches: Match[];
  setMatches: (f: (m: Match[]) => Match[]) => void;
  studio: StudioTarget | null;
  openStudio: (matchId: string, findingId?: string) => void;

  lab: boolean;
  setLab: (on: boolean) => void;
  language: CoachLanguage;
  setLanguage: (l: CoachLanguage) => void;

  notices: Notice[];
  notify: (n: Omit<Notice, 'id'>) => void;
  dismiss: (id: number) => void;

  notes: Record<string, Note[]>;
  setNotes: (matchId: string, f: (n: Note[]) => Note[]) => void;
  ticks: Record<string, boolean>;
  setTick: (detector: string, done: boolean) => void;
};

const Ctx = createContext<Store | null>(null);

function labFromUrl(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('lab');
    if (q != null) return q === '1';
    return window.localStorage.getItem('rr.lab') === '1';
  } catch {
    return false;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [wm, dispatch] = useReducer(wmReducer, undefined, initialWm);
  const [matches, setMatchesState] = useState<Match[]>(MATCHES);
  const [studio, setStudio] = useState<StudioTarget | null>(null);
  const [lab, setLabState] = useState(labFromUrl);
  const [language, setLanguage] = useState<CoachLanguage>('en');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [notes, setNotesState] = useState<Record<string, Note[]>>({
    m5: [{ id: 'n1', round: 7, t: 30, note: 'Should I have waited for halvard before Connector?' }],
  });
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const nextNotice = useRef(1);

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

  const setNotes = useCallback((matchId: string, f: (n: Note[]) => Note[]) => {
    setNotesState((all) => ({ ...all, [matchId]: f(all[matchId] ?? []) }));
  }, []);
  const setTick = useCallback((d: string, done: boolean) => setTicks((t) => ({ ...t, [d]: done })), []);
  const setMatches = useCallback((f: (m: Match[]) => Match[]) => setMatchesState(f), []);

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
    setMatches,
    studio,
    openStudio,
    lab,
    setLab,
    language,
    setLanguage,
    notices,
    notify,
    dismiss,
    notes,
    setNotes,
    ticks,
    setTick,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
