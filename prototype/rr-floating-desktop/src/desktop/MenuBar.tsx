import { useEffect, useRef, useState } from 'react';
import { SERVED_MODEL } from '../mock/world';
import { WIN_TITLE, useStore, type WinId } from '../state/store';

type Item = { label: string; run?: () => void; disabled?: boolean; checked?: boolean; hint?: string } | 'sep';
type Menu = { id: string; label: string; items: Item[]; app?: boolean };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return now.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '');
}

export function MenuBar() {
  const s = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const time = useClock();

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  const latest = s.matches.find((m) => m.status === 'complete');
  const openWins = (Object.keys(WIN_TITLE) as WinId[]).filter((id) => s.wins[id].open);
  const views: WinId[] = ['matches', 'progress', 'coach', 'studio', ...(s.lab ? (['lab'] as WinId[]) : [])];

  const menus: Menu[] = [
    {
      id: 'app',
      label: 'Round Reviewer',
      app: true,
      items: [
        {
          label: 'About Round Reviewer',
          run: () => s.notify({ title: 'Round Reviewer', body: 'Floating desktop prototype. Mock data only; no API is called.' }),
        },
        'sep',
        { label: 'Settings…', run: () => s.open('settings') },
      ],
    },
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Add match…', run: () => s.open('addMatch') },
        'sep',
        { label: 'Close window', disabled: !s.focused, run: () => s.focused && s.close(s.focused) },
      ],
    },
    {
      id: 'match',
      label: 'Match',
      items: [
        { label: 'Open latest in Studio', disabled: !latest, run: () => latest && s.openStudio(latest.id) },
        { label: 'Re-run the coach…', run: () => s.open('matches') },
        'sep',
        { label: 'Show progress', run: () => s.open('progress') },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: views.map((id) => ({ label: WIN_TITLE[id], checked: s.wins[id].open && !s.wins[id].minimized, run: () => s.open(id) })),
    },
    {
      id: 'window',
      label: 'Window',
      items: [
        { label: 'Minimise', disabled: !s.focused, run: () => s.focused && s.minimize(s.focused) },
        { label: 'Zoom', disabled: !s.focused, run: () => s.focused && s.zoom(s.focused) },
        'sep',
        ...(openWins.length
          ? openWins.map((id) => ({ label: WIN_TITLE[id], checked: s.focused === id, run: () => s.open(id) }))
          : [{ label: 'No windows open', disabled: true }]),
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        {
          label: 'Studio keys',
          run: () =>
            s.notify({ title: 'Studio keys', body: 'Space play or pause · V swap clip and radar · , and . previous and next event · N next moment' }),
        },
      ],
    },
  ];

  return (
    <div className="menubar" ref={ref}>
      <span className="mb-glyph" aria-hidden>
        <svg width="15" height="15" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.2" fill="currentColor" />
        </svg>
      </span>
      {menus.map((m) => (
        <div className="menu-wrap" key={m.id}>
          <button
            type="button"
            className={`mb-title${m.app ? ' app' : ''}`}
            aria-expanded={open === m.id}
            aria-haspopup="menu"
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onPointerEnter={() => open && setOpen(m.id)}
          >
            {m.label}
          </button>
          {open === m.id ? (
            <div className="menu" role="menu">
              {m.items.map((it, i) =>
                it === 'sep' ? (
                  <hr key={i} />
                ) : (
                  <button
                    key={it.label}
                    type="button"
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null);
                      it.run?.();
                    }}
                  >
                    {it.checked ? <span className="check">✓</span> : null}
                    {it.label}
                    {it.hint ? <span className="hint">{it.hint}</span> : null}
                  </button>
                ),
              )}
            </div>
          ) : null}
        </div>
      ))}
      <span className="mb-spacer" />
      <button type="button" className="mb-status" title="Coach model, from Settings" onClick={() => s.open('settings')}>
        <span className="mb-dot" aria-hidden />
        <span className="mono">{SERVED_MODEL}</span>
      </button>
      <span className="mb-status">{time}</span>
    </div>
  );
}
