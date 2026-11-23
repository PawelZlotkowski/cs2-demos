"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { api } from "@/lib/api/client";
import type { CoachLanguage } from "@/lib/contracts";
import { CoachText, type CiteHandlers } from "./CoachText";
import { Feedback } from "./Feedback";

type Turn = {
  id: number;
  /** Each round keeps its own thread */
  round: number | null;
  q: string;
  /** The complete answer from the final SSE event. */
  a: string;
  pending: boolean;
  /** Tool lookups reported while the coach works (SSE `step` events). */
  steps: string[];
  error?: boolean;
  verified?: boolean;
  source?: "agent" | "template";
  /** Ask history id once stored: feedback attaches to it */
  messageId?: number | null;
};

type Props = CiteHandlers & {
  matchId: string;
  /** Ask requires a player whose match findings are available. */
  playerId?: string | null;
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
  queue: "Waited for the GPU",
};

export function CoachPanel({
  matchId,
  playerId,
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
  const aborts = useRef(new Map<number, AbortController>());

  useEffect(() => {
    const open = aborts.current;
    return () => open.forEach((c) => c.abort());
  }, []);

  // Earlier questions on this match come back when the Studio opens again (A09)
  useEffect(() => {
    if (!playerId) return;
    let live = true;
    api
      .askHistory(matchId)
      .then((rows) => {
        if (!live) return;
        const earlier: Turn[] = rows
          .filter((r) => r.playerId === playerId && r.answer)
          .reverse()
          .map((r) => ({
            id: nextId.current++,
            round: r.round ?? null,
            q: r.question,
            a: r.answer ?? "",
            pending: false,
            steps: [],
            source: r.source === "agent" || r.source === "template" ? r.source : undefined,
            messageId: r.id,
          }));
        setTurns((ts) => [...earlier, ...ts]);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [matchId, playerId]);

  useEffect(() => {
    const th = threadRef.current;
    if (th) th.scrollTop = th.scrollHeight;
  }, [turns, round]);

  const patch = (id: number, f: (x: Turn) => Turn) => setTurns((ts) => ts.map((x) => (x.id === id ? f(x) : x)));
  const fail = (id: number, msg: string) =>
    patch(id, (x) => ({ ...x, a: msg, pending: false, error: true }));

  async function ask(raw: string) {
    const question = raw.trim();
    if (!question || !playerId) return;
    onAsk();
    setDraft("");
    const id = nextId.current++;
    setTurns((ts) => [...ts, { id, round, q: question, a: "", pending: true, steps: [] }]);
    const ctl = new AbortController();
    aborts.current.set(id, ctl);
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
            patch(id, (x) => ({ ...x, a: ev.data.answer, pending: false, source: ev.data.source, verified: ev.data.verified, messageId: ev.data.messageId }));
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
      aborts.current.delete(id);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(draft);
  }

  // Only this round's thread; answers saved before per-round threads (round null) are not shown
  const shown = turns.filter((x) => x.round === round);
  const asked = new Set(shown.map((x) => x.q));
  const open = suggestions.filter((q) => !asked.has(q));

  return (
    <div className="coach" id="coach" role="tabpanel" aria-labelledby="tab-ask">
      <div className="thread" ref={threadRef} aria-live="polite">
        {shown.length ? null : (
          <p className="thread-empty">Questions about this round collect here. Answers cite the findings and times they use.</p>
        )}
        {shown.map((x) => (
          <div className="qa" key={x.id}>
            <div className="qq">{x.q}</div>
            <div className={`aa${x.error ? " err" : ""}`}>
              {x.pending ? (
                <span className="thinking">{x.steps.length ? `${x.steps[x.steps.length - 1]}…` : "Thinking…"}</span>
              ) : x.error ? (
                <><p role="status">{x.a}</p><button className="btn btn-line" onClick={() => void ask(x.q)}>Ask again</button></>
              ) : (
                <CoachText text={x.a} {...cites} />
              )}
            </div>
            {x.pending && <button className="btn btn-line" onClick={() => { aborts.current.get(x.id)?.abort(); fail(x.id, "Answer stopped."); }}>Stop</button>}
            {!x.pending && x.source ? (
              <div className="aa-note">{x.source === "template" ? "Written from the finding templates." : x.verified ? "Model answer, checked against the findings." : "Written by the coach model."}</div>
            ) : null}
            {!x.pending && !x.error && x.messageId ? (
              <Feedback matchId={matchId} target={String(x.messageId)} kind="answer" />
            ) : null}
          </div>
        ))}
      </div>
      <div className="coach-body">
        {playerId && open.length ? (
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
              disabled={!playerId}
              autoComplete="off"
              aria-keyshortcuts="/"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={onAsk}
            />
            <button type="submit" className="ask-send" aria-label="Send question" disabled={!playerId || !draft.trim()}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3m-5 5 5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </form>
        {playerId ? null : (
          <div className="proto-note">
            Pick a player to analyse so the coach can answer from their findings.
          </div>
        )}
      </div>
    </div>
  );
}
