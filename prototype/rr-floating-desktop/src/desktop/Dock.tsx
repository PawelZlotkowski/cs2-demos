import { useState } from 'react';
import { useAuth } from '../state/auth';
import { WIN_TITLE, useStore, type WinId } from '../state/store';
import { AppIcon } from '../ui/icons';

export function Dock() {
  const s = useStore();
  const { canLab } = useAuth();
  const [launching, setLaunching] = useState<WinId | null>(null);

  const apps: WinId[] = ['matches', 'studio', 'progress', 'coach'];
  const system: WinId[] = ['settings', ...(canLab ? (['admin'] as WinId[]) : [])];
  const transient: WinId[] = (['addMatch', 'reviews'] as WinId[]).filter((id) => s.wins[id].open);
  const minimized = (Object.keys(WIN_TITLE) as WinId[]).filter((id) => s.wins[id].open && s.wins[id].minimized);

  function launch(id: WinId) {
    if (!s.wins[id].open) {
      setLaunching(id);
      window.setTimeout(() => setLaunching((l) => (l === id ? null : l)), 560);
    }
    s.open(id);
  }

  const item = (id: WinId) => (
    <button
      key={id}
      type="button"
      className={`dock-item${launching === id ? ' launch' : ''}`}
      aria-label={WIN_TITLE[id]}
      onClick={() => launch(id)}
    >
      <AppIcon id={id} />
      <span className="tip">{WIN_TITLE[id]}</span>
      {s.wins[id].open ? <span className="run" aria-hidden /> : null}
    </button>
  );

  return (
    <nav className="dock" aria-label="Dock">
      {apps.map(item)}
      {transient.map(item)}
      <span className="dock-sep" aria-hidden />
      {system.map(item)}
      {minimized.length ? <span className="dock-sep" aria-hidden /> : null}
      {minimized.map((id) => (
        <button key={`min-${id}`} type="button" className="dock-item mini" aria-label={`Restore ${WIN_TITLE[id]}`} onClick={() => s.open(id)}>
          <AppIcon id={id} size={22} />
          <span className="mini-t">{WIN_TITLE[id]}</span>
          <span className="tip">{WIN_TITLE[id]}, minimised</span>
        </button>
      ))}
    </nav>
  );
}
