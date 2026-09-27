import { Fragment, useState, type ReactNode } from 'react';
import { passage, type Passage } from '../mock/world';
import { clock } from './time';

/** [F12], [t:34.5], [m3], [K7], [M2:F3] (a finding in another match) and lists such as [F1, F2]. */
const TOK = String.raw`(?:M\d+:F\d+|F\d+|m\d+|K\d+|t:\d+(?:\.\d+)?)`;
const TOKEN_RE = new RegExp(String.raw`\[(${TOK}(?:\s*,\s*${TOK})*)\]`, 'g');

export type CiteHandlers = {
  onFinding?: (id: string) => void;
  onSeek?: (t: number) => void;
  onMoment?: (id: string) => void;
  onMatchFinding?: (ref: string, findingId: string) => void;
};

export function CoachText({ text, ...h }: CiteHandlers & { text: string }) {
  const [open, setOpen] = useState<Passage | null>(null);

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
      return h.onMatchFinding ? (
        <button key={key} type="button" className="cite" title={`Open ${fid} of match ${ref} in the Studio`} onClick={() => h.onMatchFinding!(ref, fid)}>
          {tok}
        </button>
      ) : (
        <span key={key} className="cite cite-plain">
          {tok}
        </span>
      );
    }
    if (tok.startsWith('K')) {
      const p = passage(tok);
      return (
        <button key={key} type="button" className="cite" title={p?.title ?? 'Knowledge passage'} aria-expanded={open?.id === tok} onClick={() => setOpen(open?.id === tok || !p ? null : p)}>
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
          <b>
            {open.id} {open.title}
          </b>
          {open.text}
          <span className="meta">Source: {open.source}</span>
        </span>
      ) : null}
    </>
  );
}
