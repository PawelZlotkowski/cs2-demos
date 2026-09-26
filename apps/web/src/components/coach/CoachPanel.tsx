"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { api } from "@/lib/api/client";
import { formatClock } from "@/lib/replay/time";

type Turn = {
  id: number;
  q: string;
  /** Full answer once it arrives; `shown` is how much has streamed in. */
  a: string;
  shown: number;
  pending: boolean;
  error?: boolean;
  mocked?: boolean;
};

type Props = {
  matchId: string;
  /** Sent as the coach context id. Rounds stand in for moments until detectors exist. */
  contextId: string;
  t: number;
  knows: string;
  suggestions: string[];
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  onAsk: () => void;
  onSeek: (t: number) => void;
};

const CITE_RE = /(\[(?:t:[\d.]+|F\d+|m\d+)\])/g;

/** Coach answers cite clip times as [t:12.3] (seekable) and findings as [F4]. */
function renderCites(text: string, onSeek: (t: number) => void): ReactNode[] {
  return text.split(CITE_RE).map((part, i) => {
    const m = part.match(/^\[(t:([\d.]+)|F\d+|m\d+)\]$/);
    if (!m) return part;
    if (m[2] != null) {
      const t = Number(m[2]);
      return (
        <button key={i} type="button" className="cite" onClick={() => onSeek(t)}>
          {formatClock(t)}
        </button>
      );
    }
    return (
      <span key={i} className="cite">
        {m[1]}
      </span>
    );
  });
}

export function CoachPanel({
  matchId,
  contextId,
  t,
  knows,
  suggestions,
  inputRef,
  placeholder,
  onAsk,
  onSeek,
}: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Stream answers in word by word (prototype stream()); instant with reduced motion.
  const streaming = turns.some((x) => !x.pending && x.shown < x.a.length);
  useEffect(() => {
    if (!streaming) return;
    const iv = window.setInterval(() => {
      setTurns((ts) =>
        ts.map((x) => {
          if (x.pending || x.shown >= x.a.length) return x;
          if (reduce.current) return { ...x, shown: x.a.length };
          let n = x.shown;
          for (let words = 0; words < 2 && n < x.a.length; ) {
            n += 1;
            if (/\s/.test(x.a[n] ?? " ")) words += 1;
          }
          return { ...x, shown: n };
        }),
      );
    }, 28);
    return () => window.clearInterval(iv);
  }, [streaming]);

  useEffect(() => {
    const th = threadRef.current;
    if (th) th.scrollTop = th.scrollHeight;
  }, [turns]);

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question) return;
    onAsk();
    setDraft("");
    const id = nextId.current++;
    setTurns((ts) => [...ts, { id, q: question, a: "", shown: 0, pending: true }]);
    try {
      const res = await api.coach(matchId, { momentId: contextId, question, t, view: "radar" });
      setTurns((ts) =>
        ts.map((x) => (x.id === id ? { ...x, a: res.answer, pending: false, mocked: res.mocked } : x)),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The coach did not answer.";
      setTurns((ts) =>
        ts.map((x) => (x.id === id ? { ...x, a: msg, shown: msg.length, pending: false, error: true } : x)),
      );
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(draft);
  }

  const asked = new Set(turns.map((x) => x.q));
  const open = suggestions.filter((q) => !asked.has(q));
  const anyMocked = turns.some((x) => x.mocked);

  return (
    <div className="coach" id="coach" role="tabpanel" aria-labelledby="tab-ask">
      <div className="thread" ref={threadRef} aria-live="polite">
        {turns.map((x) => (
          <div className="qa" key={x.id}>
            <div className="qq">{x.q}</div>
            <div className={`aa${x.error ? " err" : ""}`}>
              {x.pending ? (
                <span className="thinking">Thinking…</span>
              ) : (
                renderCites(x.a.slice(0, x.shown), onSeek)
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="coach-body">
        <p className="coach-h">Ask about this round</p>
        <p className="knows">{knows}</p>
        {open.length ? (
          <ul className="qs">
            {open.map((q) => (
              <li key={q}>
                <button type="button" className="q" onClick={() => void ask(q)}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form className="ask-row" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="coach-ask">
            Question about this round
          </label>
          <input
            ref={inputRef}
            className="field"
            id="coach-ask"
            placeholder={placeholder}
            autoComplete="off"
            aria-keyshortcuts="/"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn btn-line" disabled={!draft.trim()}>
            Ask
          </button>
        </form>
        <div className="proto-note">
          {anyMocked
            ? "The coach isn't connected yet, so answers are placeholders."
            : "Answers will come from the coach once it's connected."}
        </div>
      </div>
    </div>
  );
}
