"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { api } from "@/lib/api/client";
import type { CoachLanguage } from "@/lib/contracts";
import { CoachText, type CiteHandlers } from "./CoachText";

type Turn = {
  id: number;
  q: string;
  /** Full answer once it arrives; `shown` is how much has streamed in. */
  a: string;
  shown: number;
  pending: boolean;
  /** Tool lookups reported while the coach works (SSE `step` events). */
  steps: string[];
  error?: boolean;
  mocked?: boolean;
  source?: "agent" | "template";
};

type Props = CiteHandlers & {
  matchId: string;
  /** Analysed player: answers come from the coach agent. Without one, the legacy stub answers. */
  playerId?: string | null;
  /** Sent as the stub context id when no player is analysed. */
  contextId: string;
  round: number;
  momentId?: string | null;
  language: CoachLanguage;
  t: number;
  knows: string;
  /** What the coach is looking at, shown on the ask bar: round, time, moment, view. */
  context: string[];
  suggestions: string[];
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  onAsk: () => void;
};

/** What the coach is doing, from the tool it just called. */
export const STEP_LABELS: Record<string, string> = {
  list_rounds: "Reading the rounds",
  get_round_stats: "Reading the round stats",
  list_findings: "Looking through the findings",
  get_finding: "Reading a finding",
  get_round_timeline: "Reading the round timeline",
  get_player_state: "Checking the player at that time",
  get_player_history: "Checking earlier matches",
  search_knowledge: "Searching the map notes",
  request_clip: "Queueing a clip",
  list_matches: "Listing your matches",
  find_moments: "Looking through your matches",
};

export function CoachPanel({
  matchId,
  playerId,
  contextId,
  round,
  momentId,
  language,
  t,
  knows,
  context,
  suggestions,
  inputRef,
  placeholder,
  onAsk,
  ...cites
}: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const reduce = useRef(false);
  const aborts = useRef(new Set<AbortController>());

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const open = aborts.current;
    return () => open.forEach((c) => c.abort());
  }, []);

  // Reveal answers word by word (prototype stream()); instant with reduced motion.
  // Only verified text reaches this point: the server never streams unchecked tokens.
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

  const patch = (id: number, f: (x: Turn) => Turn) => setTurns((ts) => ts.map((x) => (x.id === id ? f(x) : x)));
  const fail = (id: number, msg: string) =>
    patch(id, (x) => ({ ...x, a: msg, shown: msg.length, pending: false, error: true }));

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question) return;
    onAsk();
    setDraft("");
    const id = nextId.current++;
    setTurns((ts) => [...ts, { id, q: question, a: "", shown: 0, pending: true, steps: [] }]);
    if (!playerId) {
      try {
        const res = await api.coach(matchId, { momentId: contextId, question, t, view: "radar" });
        patch(id, (x) => ({ ...x, a: res.answer, pending: false, mocked: res.mocked }));
      } catch (e) {
        fail(id, e instanceof Error ? e.message : "The coach did not answer.");
      }
      return;
    }
    const ctl = new AbortController();
    aborts.current.add(ctl);
    let answered = false;
    try {
      await api.ask(
        matchId,
        playerId,
        { question, language, round, t, momentId: momentId ?? null, view: "radar" },
        (ev) => {
          if (ev.event === "step") {
            const label = STEP_LABELS[ev.data.tool] ?? `Using ${ev.data.tool}`;
            patch(id, (x) => ({ ...x, steps: [...x.steps, label] }));
          } else if (ev.event === "answer") {
            answered = true;
            patch(id, (x) => ({ ...x, a: ev.data.answer, pending: false, source: ev.data.source }));
          } else {
            answered = true;
            fail(id, ev.data.detail);
          }
        },
        ctl.signal,
      );
      if (!answered) fail(id, "The coach stopped before answering.");
    } catch (e) {
      if (!ctl.signal.aborted) fail(id, e instanceof Error ? e.message : "The coach did not answer.");
    } finally {
      aborts.current.delete(ctl);
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
        {turns.length ? null : (
          <p className="thread-empty">Questions about this round collect here. Answers cite the findings and times they use.</p>
        )}
        {turns.map((x) => (
          <div className="qa" key={x.id}>
            <div className="qq">{x.q}</div>
            <div className={`aa${x.error ? " err" : ""}`}>
              {x.pending ? (
                <span className="thinking">{x.steps.length ? `${x.steps[x.steps.length - 1]}…` : "Thinking…"}</span>
              ) : x.error ? (
                x.a
              ) : (
                <CoachText text={x.a.slice(0, x.shown)} {...cites} />
              )}
            </div>
            {!x.pending && x.source === "template" ? (
              <div className="aa-note">Written from the findings: the coach model is off or its answer did not pass the checks.</div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="coach-body">
        {open.length ? (
          <ul className="qs" aria-label="Suggested questions">
            {open.map((q) => (
              <li key={q}>
                <button type="button" className="q" onClick={() => void ask(q)}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {/* The ask bar states its context instead of greeting: the coach already knows the moment. */}
        <form className="ask-row" onSubmit={onSubmit}>
          <p className="ask-ctx" title={knows}>
            <span className="sr-only">{knows}</span>
            {context.map((c, i) => (
              <span key={i} aria-hidden>
                {c}
              </span>
            ))}
          </p>
          <div className="ask-field">
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
              onFocus={onAsk}
            />
            {draft.trim() ? null : <kbd aria-hidden>/</kbd>}
            <button type="submit" className="ask-send" disabled={!draft.trim()}>
              Ask
            </button>
          </div>
        </form>
        {playerId ? null : (
          <div className="proto-note">
            {anyMocked
              ? "Pick a player to analyse first. Until then answers are placeholders."
              : "Pick a player to analyse, and the coach answers from their findings."}
          </div>
        )}
      </div>
    </div>
  );
}
