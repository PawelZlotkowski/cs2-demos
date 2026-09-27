import { Fragment, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/client';
import type { KnowledgePassage } from '@/lib/contracts';
import { clock } from './time';

const passages = new Map<string, Promise<KnowledgePassage>>();

function passage(id: string): Promise<KnowledgePassage> {
  let p = passages.get(id);
  if (!p) {
    p = api.getKnowledge(id);
    p.catch(() => passages.delete(id));
    passages.set(id, p);
  }
  return p;
}

/** [F12], [t:34.5], [m3], [K7], [M2:F3] (a finding in another match) and lists such as [F1, F2]. */
const TOK = String.raw`(?:M\d+:F\d+|F\d+|m\d+|K\d+|t:\d+(?:\.\d+)?)`;
const TOKEN_RE = new RegExp(String.raw`\[(${TOK}(?:\s*,\s*${TOK})*)\]`, 'g');

export type CiteHandlers = {
  onFinding?: (id: string) => void;
  onSeek?: (t: number) => void;
  onMoment?: (id: string) => void;
  /** Opens a finding of another match; the text's [M2:F3] refs resolve through `matches`. */
  onMatchFinding?: (matchId: string, findingId: string) => void;
  /** Match ref ("M2") to match id, as the API returns it with cross-match answers. */
  matches?: Record<string, string>;
};

type Open = { id: string; p: KnowledgePassage | null; error?: string };

export function CoachText({ text, matches, ...h }: CiteHandlers & { text: string }) {
  const [open, setOpen] = useState<Open | null>(null);

  function toggle(id: string) {
    if (open?.id === id) return setOpen(null);
    setOpen({ id, p: null });
    passage(id)
      .then((p) => setOpen((o) => (o?.id === id ? { id, p } : o)))
      .catch(() => setOpen((o) => (o?.id === id ? { id, p: null, error: 'The passage could not be loaded.' } : o)));
  }

  function cite(tok: string, key: string): ReactNode {
    if (tok.startsWith('t:')) {
      const t = Number(tok.slice(2));
      return h.onSeek ? (
        <button key={key} type="button" className="cite" title="Seek to this time" onClick={() => h.onSeek!(t)}>
          {clock(t)}
        </button>
      ) : (
        <span key={key} className="cite cite-plain">
          {clock(t)}
        </span>
      );
    }
    if (/^M\d+:F\d+$/.test(tok)) {
      const [ref, fid] = tok.split(':');
      const matchId = matches?.[ref];
      return h.onMatchFinding && matchId ? (
        <button key={key} type="button" className="cite" title={`Open ${fid} of match ${ref} in the Studio`} onClick={() => h.onMatchFinding!(matchId, fid)}>
          {tok}
        </button>
      ) : (
        <span key={key} className="cite cite-plain">
          {tok}
        </span>
      );
    }
    if (tok.startsWith('K')) {
      return (
        <button key={key} type="button" className="cite" title="Knowledge passage" aria-expanded={open?.id === tok} onClick={() => toggle(tok)}>
          {tok}
        </button>
      );
    }
    if (tok.startsWith('m') && h.onMoment)
      return (
        <button key={key} type="button" className="cite" title="Open this moment" onClick={() => h.onMoment!(tok)}>
          {tok}
        </button>
      );
    if (tok.startsWith('F') && h.onFinding)
      return (
        <button key={key} type="button" className="cite" title={`Jump to ${tok}`} onClick={() => h.onFinding!(tok)}>
          {tok}
        </button>
      );
    return (
      <span key={key} className="cite cite-plain">
        {tok}
      </span>
    );
  }

  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    out.push(text.slice(last, m.index));
    const toks = m[1].split(/\s*,\s*/);
    out.push(<Fragment key={`c${n++}`}>{toks.map((tok, i) => cite(tok, `${n}-${i}`))}</Fragment>);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));

  return (
    <>
      {out}
      {open ? (
        <span className="k-passage" role="note">
          {open.p ? (
            <>
              <b>
                {open.id} {open.p.title}
              </b>
              {open.p.text}
              <span className="meta">Source: {open.p.source}</span>
            </>
          ) : (
            <span className="meta">{open.error ?? `Loading ${open.id}`}</span>
          )}
        </span>
      ) : null}
    </>
  );
}
