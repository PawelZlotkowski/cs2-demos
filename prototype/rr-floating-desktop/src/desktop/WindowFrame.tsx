import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { DOCK_RESERVE, MENU_H, WIN_TITLE, useStore, type WinId } from '../state/store';

type Props = {
  id: WinId;
  title?: string;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  /** Toolbar centred in the title bar (tabs), instead of trailing. */
  centerToolbar?: boolean;
  tall?: boolean;
  minW?: number;
  minH?: number;
  flush?: boolean;
  /** A fixed-size panel, like an installer: no resizing and no zoom. */
  fixed?: boolean;
  className?: string;
  children: ReactNode;
};

type Anim = 'none' | 'leaving' | 'minimizing' | 'restoring' | 'zooming';

const INTERACTIVE = 'button, a, input, select, textarea, label, [role="tab"], .seg';

export function WindowFrame({ id, title, subtitle, toolbar, centerToolbar, tall, minW = 360, minH = 240, flush, fixed, className, children }: Props) {
  const { wins, focused, focus, close, minimize, setRect, zoom } = useStore();
  const win = wins[id];
  const isFocused = focused === id;
  const [anim, setAnim] = useState<Anim>('none');
  const [entered, setEntered] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const size = useRef<{ x: number; y: number; w: number; h: number; mode: 'both' | 'r' | 'b' } | null>(null);
  const wasMin = useRef(win.minimized);

  useEffect(() => {
    if (wasMin.current && !win.minimized) setAnim('restoring');
    wasMin.current = win.minimized;
  }, [win.minimized]);

  function startDrag(e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(INTERACTIVE)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
  }

  function onDrag(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const x = Math.min(window.innerWidth - 90, Math.max(90 - win.w, e.clientX - d.dx));
    const y = Math.min(window.innerHeight - DOCK_RESERVE + 30, Math.max(MENU_H, e.clientY - d.dy));
    setRect(id, { x, y, ...(win.zoomed ? { zoomed: false, restore: null } : {}) });
  }

  function startSize(mode: 'both' | 'r' | 'b') {
    return (e: RPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      size.current = { x: e.clientX, y: e.clientY, w: win.w, h: win.h, mode };
    };
  }

  function onSize(e: RPointerEvent<HTMLDivElement>) {
    const s = size.current;
    if (!s) return;
    const w = s.mode === 'b' ? s.w : Math.max(minW, Math.min(window.innerWidth - win.x - 4, s.w + e.clientX - s.x));
    const h = s.mode === 'r' ? s.h : Math.max(minH, Math.min(window.innerHeight - win.y - 4, s.h + e.clientY - s.y));
    setRect(id, { w, h });
  }

  const end = () => {
    drag.current = null;
    size.current = null;
  };

  function onAnimEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    setEntered(true);
    if (anim === 'leaving') close(id);
    else if (anim === 'minimizing') minimize(id);
    if (anim !== 'none' && anim !== 'zooming') setAnim('none');
  }

  const toDock = {
    '--mx': `${window.innerWidth / 2 - (win.x + win.w / 2)}px`,
    '--my': `${window.innerHeight - 40 - (win.y + win.h / 2)}px`,
  } as CSSProperties;

  const cls = ['win', className ?? '', entered ? 'entered' : '', isFocused ? 'focused' : '', win.minimized && anim !== 'restoring' ? 'minimized' : '', anim !== 'none' ? anim : ''].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      role="dialog"
      aria-label={title ?? WIN_TITLE[id]}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z, ...toDock }}
      onPointerDownCapture={() => focus(id)}
      onAnimationEnd={onAnimEnd}
      onTransitionEnd={(e) => e.target === e.currentTarget && anim === 'zooming' && setAnim('none')}
      data-win={id}
    >
      <div
        className={`titlebar${tall ? ' tall' : ''}`}
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={(e) => {
          if (fixed || (e.target as HTMLElement).closest(INTERACTIVE)) return;
          setAnim('zooming');
          zoom(id);
        }}
      >
        <div className="lights">
          <button type="button" className="light close" aria-label="Close" onClick={() => setAnim('leaving')}>
            <svg viewBox="0 0 6 6" aria-hidden>
              <path d="M1 1l4 4M5 1L1 5" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </button>
          <button type="button" className="light min" aria-label="Minimise" onClick={() => setAnim('minimizing')}>
            <svg viewBox="0 0 6 6" aria-hidden>
              <path d="M0.8 3h4.4" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </button>
          <button
            type="button"
            className="light zoom"
            aria-label={win.zoomed ? 'Restore size' : 'Zoom'}
            disabled={fixed}
            onClick={() => {
              setAnim('zooming');
              zoom(id);
            }}
          >
            <svg viewBox="0 0 6 6" aria-hidden>
              <path d="M1.2 3.8V1.2h2.6zM4.8 2.2v2.6H2.2z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <div className="win-title">
          <b>{title ?? WIN_TITLE[id]}</b>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        {toolbar ? <div className={`toolbar${centerToolbar ? ' center' : ''}`}>{toolbar}</div> : null}
      </div>
      <div className={`win-body${flush ? ' flush' : ''}`}>{children}</div>
      {fixed ? null : (
        <>
          <div className="resize-r" onPointerDown={startSize('r')} onPointerMove={onSize} onPointerUp={end} />
          <div className="resize-b" onPointerDown={startSize('b')} onPointerMove={onSize} onPointerUp={end} />
          <div className="resize" onPointerDown={startSize('both')} onPointerMove={onSize} onPointerUp={end} />
        </>
      )}
    </div>
  );
}
