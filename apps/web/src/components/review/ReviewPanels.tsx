"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { CoachLanguage, MomentExplanation, ReviewWrapUp } from "@/lib/contracts";
import { COACH_LANGUAGES } from "@/lib/coach/language";
import { CoachText, type CiteHandlers } from "@/components/coach/CoachText";

type Load<T> = { kind: "loading" } | { kind: "done"; data: T } | { kind: "error"; message: string };

function useReview<T>(fetcher: () => Promise<T>, deps: unknown[]): Load<T> {
  const [state, setState] = useState<Load<T>>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    fetcher()
      .then((data) => live && setState({ kind: "done", data }))
      .catch(
        (e: unknown) =>
          live && setState({ kind: "error", message: e instanceof Error ? e.message : "The coach did not answer." }),
      );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function sourceNote(e: MomentExplanation): string {
  if (e.source === "agent") return `Written by ${e.model ?? "the coach model"} and checked against the findings.`;
  if (e.verifierErrors.some((x) => /no moments/i.test(x))) return "";
  if (e.verifierErrors.length) return "Written from the findings, because the coach model's text did not pass the checks.";
  return "Written from the findings. The coach model is off.";
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
        <p className="meta thinking">{loadingText}</p>
      ) : state.kind === "error" ? (
        <p className="meta err">{state.message}</p>
      ) : (
        <>
          <p className="expl">
            <CoachText text={state.data.text} {...cites} />
          </p>
          {sourceNote(state.data) ? <p className="expl-note">{sourceNote(state.data)}</p> : null}
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
  actions,
  ...cites
}: Shared & { total: number; actions: ReactNode }) {
  const wrap = useReview<ReviewWrapUp>(
    () => api.getReviewWrapUp(matchId, playerId, language),
    [matchId, playerId, language],
  );
  const text: Load<MomentExplanation> =
    wrap.kind === "done" ? { kind: "done", data: wrap.data.explanation } : wrap;
  const drills = wrap.kind === "done" ? wrap.data.drills : [];
  return (
    <>
      <h2 className="ins-head">You reviewed all {total} moments</h2>
      <p className="picked">Here is what to take into your next match.</p>
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
          Add demo
        </Link>
      </p>
    </>
  );
}
