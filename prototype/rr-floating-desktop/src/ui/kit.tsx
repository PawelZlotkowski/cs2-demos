import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { errorText } from '@/lib/format';

/** Load once, reload on demand; optional polling while the window is visible (Jobs, Overview). */
export function useLoad<T>(load: () => Promise<T>, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(errorText(e, 'The API did not answer.'));
    }
  }, []);

  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const iv = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, pollMs);
    return () => window.clearInterval(iv);
  }, [reload, pollMs]);

  return { data, error, reload, setData };
}

export function LoadState({ error, loading }: { error: string | null; loading: boolean }) {
  if (error)
    return (
      <p className="err" role="alert">
        {error}
      </p>
    );
  if (loading) return <p className="meta thinking">Loading</p>;
  return null;
}

/** A pane's heading, like a System Settings pane: title, one line under it, buttons on the right. */
export function PaneHead({ title, lede, children }: { title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="pane-h">
      <div>
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {children ? <div className="pane-h-actions">{children}</div> : null}
    </header>
  );
}

/** A line that says what just happened (saved, deleted, the error). */
export function Status({ msg }: { msg: { ok: boolean; text: string } | string | null }) {
  if (!msg) return null;
  const m = typeof msg === 'string' ? { ok: true, text: msg } : msg;
  return (
    <p className={m.ok ? 'status-line' : 'err'} role={m.ok ? 'status' : 'alert'}>
      {m.text}
    </p>
  );
}

/**
 * A destructive or hard-to-undo action that names its object before it runs: the first press
 * becomes "Delete mirage 13-9?  Delete / Cancel", inline, like a macOS confirmation in a row.
 */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  danger = true,
}: {
  label: string;
  question: string;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown> | void;
  danger?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asking)
    return (
      <button type="button" className={`link${danger ? ' danger' : ''}`} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <span className="confirm-inline" role="group" aria-label={question}>
      <span>{question}</span>
      <button
        type="button"
        className={`btn small${danger ? ' btn-danger' : ''}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onConfirm();
            setAsking(false);
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Working…' : (confirmLabel ?? label)}
      </button>
      <button type="button" className="btn small" onClick={() => setAsking(false)} disabled={busy}>
        Cancel
      </button>
      {error ? <span className="err">{error}</span> : null}
    </span>
  );
}

/** A value shown once (an invite code, a token, a share link), with a copy button. */
export function Secret({ value, note }: { value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret">
      <code>{value}</code>
      <button
        type="button"
        className="btn small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {note ? <span className="meta">{note}</span> : null}
    </div>
  );
}

export function Stat({ label, value, onOpen }: { label: string; value: ReactNode; onOpen?: () => void }) {
  const body = (
    <>
      <span className="stat-v num">{value}</span>
      <span className="stat-l">{label}</span>
    </>
  );
  return onOpen ? (
    <button type="button" className="stat" onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className="stat">{body}</div>
  );
}

/**
 * A macOS sheet: slides down from under the title bar and dims the window behind it. It is drawn
 * into its window (not the scrolling body), so it stays put while the list behind it scrolls.
 * Escape or a click on the dimmed part closes it.
 */
export function Sheet({ title, onClose, children, width = 420 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(anchor.current?.closest<HTMLElement>('.win') ?? null);
  }, []);
  const close = useRef(onClose);
  close.current = onClose;
  // Focus once when the sheet appears, not on every parent render (the match list polls)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelector<HTMLElement>('input, select, textarea, button.btn-default')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
    };
    el.addEventListener('keydown', key);
    return () => el.removeEventListener('keydown', key);
  }, [host]);
  const sheet = (
    <div className="sheet-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={{ width }}>
        <h2 className="sheet-h">{title}</h2>
        {children}
      </div>
    </div>
  );
  return (
    <>
      <span ref={anchor} hidden />
      {host ? createPortal(sheet, host) : null}
    </>
  );
}

export function Avatar({ name, url, size = 22 }: { name: string; url?: string | null; size?: number }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return url ? (
    <img className="avatar" src={url} alt="" width={size} height={size} />
  ) : (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden>
      {letters || '·'}
    </span>
  );
}
