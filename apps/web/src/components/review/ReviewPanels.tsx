"use client";

import { LoadingState } from "@/components/LoadingState";
import { sourceNote } from "@/components/coach/CoachExplanation";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { CoachLanguage, MomentExplanation, ReviewWrapUp } from "@/lib/contracts";
import { COACH_LANGUAGES } from "@/lib/coach/language";
import { CoachText, type CiteHandlers } from "@/components/coach/CoachText";

type Load<T> = { kind: "loading" } | { kind: "done"; data: T } | { kind: "error"; message: string; retry: () => void };

function useReview<T>(fetcher: () => Promise<T>, deps: unknown[]): Load<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Load<T>>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    fetcher()
      .then((data) => live && setState({ kind: "done", data }))
      .catch(
        (e: unknown) =>
          live && setState({ kind: "error", retry: () => setAttempt((n) => n + 1), message: e instanceof Error ? e.message : "The coach did not answer." }),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return state;
}

function CoachBlock({
  title,
  state,
  loadingText,
  language,
  onLanguage,
  cites,
}: {
  title: string;
  state: Load<MomentExplanation>;
  loadingText: string;
  language: CoachLanguage;
  onLanguage: (lang: CoachLanguage) => void;
  cites: CiteHandlers;
}) {
  return (
    <section className="layer coach-expl" aria-live="polite">
      <div className="coach-expl-h">
        <h3>{title}</h3>
        <label className="lang-pick">
          <span className="sr-only">Coach language</span>
          <select value={language} onChange={(e) => onLanguage(e.target.value as CoachLanguage)}>
            {COACH_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.kind === "loading" ? (
        <LoadingState label={loadingText} />
      ) : state.kind === "error" ? (
        <div><p role="alert">{state.message}</p><button className="btn btn-line" onClick={state.retry}>Try again</button></div>
      ) : (
        <>
          <p className="expl">
            <CoachText text={state.data.text} {...cites} />
          </p>
          <p className="expl-note">{sourceNote(state.data)}</p>
        </>
      )}
    </section>
  );
}

type Shared = CiteHandlers & {
  matchId: string;
  playerId: string;
  language: CoachLanguage;
  onLanguage: (lang: CoachLanguage) => void;
};

/** The Studio's opening state (design plan item 2): key facts, round strip, the coach's summary. */
export function ReviewOverview({
  matchId,
  playerId,
  language,
  onLanguage,
  heading,
  facts,
  strip,
  start,
  ...cites
}: Shared & {
  heading: string;
  facts: string[];
  strip: ReactNode;
  /** The single primary action: open the first moment. */
  start: ReactNode;
}) {
  const summary = useReview(() => api.getReviewSummary(matchId, playerId, language), [matchId, playerId, language]);
  return (
    <>
      <h2 className="ins-head">{heading}</h2>
      <p className="review-facts">
        {facts.map((f, i) => (
          <span key={i}>{f}</span>
        ))}
      </p>
      <section className="layer">
        <h3>Rounds</h3>
        {strip}
      </section>
      <CoachBlock
        title="Coach"
        state={summary}
        loadingText="Summarising your moments…"
        language={language}
        onLanguage={onLanguage}
        cites={cites}
      />
      <div className="review-start">{start}</div>
    </>
  );
}

/** After the last moment (design plan item 3): what went well, what to fix, what to practise. */
export function ReviewWrapUpPanel({
  matchId,
  playerId,
  language,
  onLanguage,
  total,
  seen,
  actions,
  ...cites
}: Shared & { total: number; seen: number; actions: ReactNode }) {
  const wrap = useReview<ReviewWrapUp>(
    () => api.getReviewWrapUp(matchId, playerId, language),
    [matchId, playerId, language],
  );
  const text: Load<MomentExplanation> =
    wrap.kind === "done" ? { kind: "done", data: wrap.data.explanation } : wrap;
  const drills = wrap.kind === "done" ? wrap.data.drills : [];
  return (
    <>
      <h2 className="ins-head">Match debrief</h2>
      <p className="picked">{seen} of {total} moments seen.</p>
      <CoachBlock
        title="Coach"
        state={text}
        loadingText="Writing the wrap-up…"
        language={language}
        onLanguage={onLanguage}
        cites={cites}
      />
      {drills.length ? (
        <section className="layer">
          <h3>Practise next</h3>
          <ol className="drills">
            {drills.map((d) => (
              <li key={d.detector}>
                <b>{d.title}</b>
                <p>{d.text}</p>
                <span className="meta">
                  <CoachText text={`Covers ${d.findingIds.map((id) => `[${id}]`).join(" ")}. Source [${d.passageId}].`} {...cites} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <p className="row-actions review-actions">
        {actions}
        <Link className="btn btn-line" href="/upload">
          Add match
        </Link>
      </p>
    </>
  );
}
