"use client";

import { Fragment, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { KnowledgePassage } from "@/lib/contracts";
import { formatClock } from "@/lib/replay/time";

/** [F12], [t:34.5], [m3], [K7], [M2:F3] (a finding in another match, Coach page) and lists such as [F1, F2]. */
const TOK = String.raw`(?:M\d+:F\d+|F\d+|m\d+|K\d+|t:\d+(?:\.\d+)?)`;
const TOKEN_RE = new RegExp(String.raw`\[(${TOK}(?:\s*,\s*${TOK})*)\]`, "g");

export type CiteHandlers = {
  onFinding?: (id: string) => void;
  onSeek?: (t: number) => void;
  onMoment?: (id: string) => void;
  /** Label for a moment token, e.g. "moment 3, untraded death". */
  momentLabel?: (id: string) => string | undefined;
  /** Link for a finding in another match ("M2", "F3"); without it the token is plain text. */
  matchFindingHref?: (ref: string, findingId: string) => string | undefined;
};

type Props = CiteHandlers & { text: string; className?: string };

/** Coach prose with seekable citation tokens and expandable knowledge passages. */
export function CoachText({ text, className, ...h }: Props) {
  const [open, setOpen] = useState<KnowledgePassage | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function showPassage(id: string) {
    if (open?.id === id) {
      setOpen(null);
      return;
    }
    setLoading(id);
    try {
      setOpen(await api.getKnowledge(id));
    } catch {
      setOpen({ id, title: "Passage not found", map: "", source: "", text: "" });
    } finally {
      setLoading(null);
    }
  }

  function token(tok: string, key: string): ReactNode {
    if (tok.startsWith("t:")) {
      const t = Number(tok.slice(2));
      return h.onSeek ? (
        <button key={key} type="button" className="cite" title="Seek to this time" onClick={() => h.onSeek!(t)}>
          {formatClock(t)}
        </button>
      ) : (
        <span key={key} className="cite">
          {formatClock(t)}
        </span>
      );
    }
    if (tok.startsWith("M")) {
      const [ref, fid] = tok.split(":");
      const href = h.matchFindingHref?.(ref, fid);
      const label = `match ${ref.slice(1)}, ${fid}`;
      return href ? (
        <a key={key} className="cite" href={href} title="Open this finding in the Studio">
          {label}
        </a>
      ) : (
        <span key={key} className="cite">
          {label}
        </span>
      );
    }
    if (tok.startsWith("F") && h.onFinding) {
      return (
        <button key={key} type="button" className="cite" title={`Jump to ${tok}`} onClick={() => h.onFinding!(tok)}>
          {tok}
        </button>
      );
    }
    if (tok.startsWith("m") && h.onMoment) {
      return (
        <button key={key} type="button" className="cite" title="Open this moment" onClick={() => h.onMoment!(tok)}>
          {h.momentLabel?.(tok) ?? tok}
        </button>
      );
    }
    if (tok.startsWith("K")) {
      return (
        <button
          key={key}
          type="button"
          className="cite"
          aria-expanded={open?.id === tok}
          title="Show the source passage"
          onClick={() => void showPassage(tok)}
        >
          {loading === tok ? "…" : tok}
        </button>
      );
    }
    return (
      <span key={key} className="cite">
        {tok}
      </span>
    );
  }

  const parts: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) parts.push(<Fragment key={`s${n++}`}>{text.slice(last, at)}</Fragment>);
    m[1].split(/\s*,\s*/).forEach((tok, i) => {
      if (i) parts.push(<Fragment key={`c${n++}`}> </Fragment>);
      parts.push(token(tok, `t${n++}`));
    });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={`s${n++}`}>{text.slice(last)}</Fragment>);

  return (
    <>
      <span className={className}>{parts}</span>
      {open ? (
        <span className="k-passage" role="note">
          <b>{open.title}</b>
          {open.text ? <span className="k-text">{open.text}</span> : null}
          {open.source ? <span className="k-src">Source: {open.source}</span> : null}
        </span>
      ) : null}
    </>
  );
}
