import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { ROLE_LABEL, useAuth } from '../state/auth';
import { WIN_TITLE, useStore, type WinId } from '../state/store';
import { Avatar } from '../ui/kit';

type Item = { label: string; run?: () => void; disabled?: boolean; checked?: boolean; hint?: string } | { head: string; sub: string } | 'sep';
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
  const auth = useAuth();
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
  const llm = s.system?.checks.find((c) => c.name === 'llm');
  const modelLabel = s.apiTooOld ? 'API from another copy' : !s.system ? 'API offline' : llm?.state === 'ok' ? s.system.llmModel : 'Coach model off';
  const openWins = (Object.keys(WIN_TITLE) as WinId[]).filter((id) => s.wins[id].open);
  const views: WinId[] = ['matches', 'progress', 'coach', 'studio', ...(auth.canLab ? (['admin'] as WinId[]) : [])];
  const user = auth.user;
  const signedIn = !!auth.state?.authEnabled && !!user;
  const adminLabel = user?.role === 'labeller' ? 'Lab…' : 'Admin…';

  // Right of the menu bar, like macOS fast user switching: who is signed in and the account's own items
  const account: Menu | null = user
    ? {
        id: 'account',
        label: signedIn ? user.displayName : 'This computer',
        items: [
          signedIn ? { head: user.displayName, sub: `${ROLE_LABEL[user.role]}${user.username ? ` · @${user.username}` : ''}` } : { head: 'This computer', sub: 'Accounts are off, so it is the admin' },
          'sep',
          ...(signedIn ? [{ label: 'Profile…', run: () => s.openSettings('account') }] : []),
          { label: 'Settings…', run: () => s.openSettings(signedIn ? 'coach' : 'system') },
          ...(auth.canLab ? [{ label: adminLabel, run: () => s.openAdmin() }] : []),
          ...(signedIn ? ['sep' as const, { label: `Sign Out ${user.displayName}…`, run: () => void auth.signOut() }] : []),
        ],
      }
    : null;

  const menus: Menu[] = [
    {
      id: 'app',
      label: 'Round Reviewer',
      app: true,
      items: [
        {
          label: 'About Round Reviewer',
          run: () => s.notify({ title: 'Round Reviewer', body: `Floating desktop on the Round Reviewer API (${api.baseUrl}).` }),
        },
        'sep',
        { label: 'Settings…', run: () => s.openSettings() },
        ...(auth.canLab ? [{ label: adminLabel, run: () => s.openAdmin() }] : []),
        ...(signedIn && user ? ['sep' as const, { label: `Sign Out ${user.displayName}…`, run: () => void auth.signOut() }] : []),
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
        { label: 'Earlier reviews of latest', disabled: !latest?.versions, run: () => latest && s.openReviews(latest.id) },
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

  function renderMenu(m: Menu, right = false) {
    return (
      <div className="menu-wrap" key={m.id}>
        <button
          type="button"
          className={`mb-title${m.app ? ' app' : ''}${right ? ' mb-account' : ''}`}
          aria-expanded={open === m.id}
          aria-haspopup="menu"
          onClick={() => setOpen(open === m.id ? null : m.id)}
          onPointerEnter={() => open && setOpen(m.id)}
        >
          {right && user ? <Avatar name={signedIn ? user.displayName : '·'} url={user.avatarUrl} size={17} /> : null}
          {m.label}
        </button>
        {open === m.id ? (
          <div className={`menu${right ? ' right' : ''}`} role="menu">
            {m.items.map((it, i) =>
              it === 'sep' ? (
                <hr key={i} />
              ) : 'head' in it ? (
                <p key={i} className="menu-head">
                  <b>{it.head}</b>
                  <span>{it.sub}</span>
                </p>
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
    );
  }

  return (
    <div className="menubar" ref={ref}>
      <span className="mb-glyph" aria-hidden>
        <svg width="15" height="15" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.2" fill="currentColor" />
        </svg>
      </span>
      {menus.map((m) => renderMenu(m))}
      <span className="mb-spacer" />
      <button type="button" className="mb-status" title="Coach model, from Settings" onClick={() => s.openSettings('system')}>
        <span className="mb-dot" data-state={s.apiTooOld || !s.system ? 'problem' : (llm?.state ?? 'off')} aria-hidden />
        <span className="mono">{modelLabel}</span>
      </button>
      {account ? renderMenu(account, true) : null}
      <span className="mb-status">{time}</span>
    </div>
  );
}
