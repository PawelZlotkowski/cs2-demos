"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { errorText } from "@/lib/format";

/** Load once, reload on demand; optional polling for live pages (jobs, overview). */
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
      setError(errorText(e, "The API did not answer."));
    }
  }, []);

  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const iv = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, pollMs);
    return () => window.clearInterval(iv);
  }, [reload, pollMs]);

  return { data, error, reload, setData };
}

export function PageHead({ title, lede, children }: { title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-h">
      <div>
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {children ? <div className="page-h-actions">{children}</div> : null}
    </header>
  );
}

export function LoadState({ error, loading }: { error: string | null; loading: boolean }) {
  if (error)
    return (
      <p className="err" role="alert">
        {error}
      </p>
    );
  if (loading) return <p className="meta">Loading…</p>;
  return null;
}

/**
 * A destructive or hard-to-undo action that names its object before it runs:
 * the first press turns into "Delete mirage 13-9? Yes / No".
 */
export function ConfirmButton({
  label,
  question,
  onConfirm,
  danger = true,
  small = true,
}: {
  label: string;
  question: string;
  onConfirm: () => Promise<unknown> | void;
  danger?: boolean;
  small?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asking)
    return (
      <button type="button" className={`link${small ? " small" : ""}${danger ? " danger" : ""}`} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <span className="confirm" role="group" aria-label={question}>
      <span>{question}</span>
      <button
        type="button"
        className={`btn btn-line small${danger ? " danger" : ""}`}
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
        {busy ? "Working…" : "Yes"}
      </button>
      <button type="button" className="link small" onClick={() => setAsking(false)} disabled={busy}>
        No
      </button>
      {error ? <span className="err">{error}</span> : null}
    </span>
  );
}

/** A value shown once (an invite code, a token), with a copy button. */
export function Secret({ value, note }: { value: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret">
      <code>{value}</code>
      <button
        type="button"
        className="link small"
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
        {copied ? "Copied" : "Copy"}
      </button>
      {note ? <span className="meta">{note}</span> : null}
    </div>
  );
}

export function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const body = (
    <>
      <span className="stat-v num">{value}</span>
      <span className="stat-l">{label}</span>
    </>
  );
  return href ? (
    <a className="stat" href={href}>
      {body}
    </a>
  ) : (
    <div className="stat">{body}</div>
  );
}
