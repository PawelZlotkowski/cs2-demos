"use client";

import { LoadingState } from "@/components/LoadingState";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { CoachLanguage, MomentExplanation } from "@/lib/contracts";
import { COACH_LANGUAGES } from "@/lib/coach/language";
import { labRemembered } from "@/components/NavLinks";
import { CoachText, type CiteHandlers } from "./CoachText";
import { Feedback } from "./Feedback";

type Props = CiteHandlers & {
  onSeen: (id: string) => void;
  evidence?: ReactNode;
  matchId: string;
  playerId: string;
  /** The picked moment in view; without one the round is explained on request. */
  momentId?: string | null;
  round: number;
  language: CoachLanguage;
  onLanguage: (lang: CoachLanguage) => void;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: MomentExplanation }
  | { kind: "error"; message: string };

/** Coach explanation in the Analysis tab (plan §6.3, T43). Only verified or template text reaches it. */
export function CoachExplanation({ matchId, playerId, momentId, round, language, onLanguage, evidence, onSeen, ...cites }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [roundAsked, setRoundAsked] = useState(false);
  const [lab, setLab] = useState(false);

  useEffect(() => setLab(labRemembered()), []);

  // A new round or moment starts clean; a round has to be asked for again.
  useEffect(() => {
    setRoundAsked(false);
  }, [round, momentId]);

  useEffect(() => {
    if (!momentId && !roundAsked) {
      setState({ kind: "idle" });
      return;
    }
    let live = true;
    setState({ kind: "loading" });
    const req = momentId
      ? api.getMomentExplanation(matchId, playerId, momentId, language)
      : api.explainRound(matchId, playerId, round, language);
    req
      .then((data) => live && setState({ kind: "done", data }))
      .catch(
        (e: unknown) =>
          live && setState({ kind: "error", message: e instanceof Error ? e.message : "The coach did not answer." }),
      );
    return () => {
      live = false;
    };
  }, [matchId, playerId, momentId, round, roundAsked, language, attempt]);

  // Review progress (A09): a moment counts as seen once its explanation is on screen
  const shown = state.kind === "done" && !!momentId;
  useEffect(() => {
    if (!shown || !momentId) return;
    onSeen(momentId);
    void api.markSeen(matchId, momentId).catch(() => undefined);
  }, [shown, matchId, momentId, onSeen]);

  return (
    <section className="layer coach-expl" aria-live="polite">
      {state.kind === "idle" ? (
        <button type="button" className="link" onClick={() => setRoundAsked(true)}>
          Explain round {round}
        </button>
      ) : state.kind === "loading" ? (
        <LoadingState label={momentId ? "Loading the moment explanation…" : "Explaining the round…"} />
      ) : state.kind === "error" ? (
        <div><p role="alert">The explanation could not be loaded. {state.message}</p>
          <button className="btn btn-line" onClick={() => setAttempt((n) => n + 1)}>Try again</button></div>
      ) : (
        <>
          <p className="expl">
            <CoachText text={state.data.text} {...cites} />
          </p>
          {evidence}
          <div className="source-tile" data-checked={state.data.source === "agent" && !state.data.verifierErrors.length} title={state.data.model ?? undefined}>
            <span aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                {state.data.source === "agent" && !state.data.verifierErrors.length
                  ? <path d="M3.5 8.5l3 3 6-7" />
                  : <path d="M8 7.5V11.5M8 4.6v.1" />}
              </svg>
            </span>
            <p>
            {sourceNote(state.data)}
            {lab ? (
              <>
                {" "}
                <a href={`/admin/lab?matchId=${encodeURIComponent(matchId)}&job=explain#runs`}>How this was written</a>
              </>
            ) : null}
          </p></div>
        </>
      )}
      <details className="analysis-details"><summary>Feedback and language</summary>
        {state.kind === "done" && <Feedback matchId={matchId} target={momentId ?? `round-${round}`} />}
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
      </details>
    </section>
  );
}

/** "gemma-4-26b-a4b-it-ud-iq4_xs" → "Gemma 4 26B", "qwen3-14b-q4_k_m" → "Qwen3 14B"; the full id stays in the tile's title. */
export function modelLabel(id: string | null | undefined): string {
  if (!id) return "the coach model";
  const parts = id.split(/[-_/]/);
  const size = parts.findIndex((p) => /^\d+(\.\d+)?b$/i.test(p));
  if (size < 0) return id;
  return parts.slice(0, size + 1).map((p, i) => (i === size ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}

export function sourceNote(e: MomentExplanation): string {
  if (e.source === "agent" && e.verifierErrors.length) return `Written by ${modelLabel(e.model)}. The verifier reported issues.`;
  if (e.source === "agent") return `Checked: every claim matches the findings it cites. Written by ${modelLabel(e.model)} on our own GPU.`;
  if (e.verifierErrors.some((x) => /no findings|no moments/i.test(x))) return "Written from the finding templates. No findings were available to explain.";
  if (e.verifierErrors.length)
    return "Written from the finding templates. A verified model answer was unavailable.";
  return "Written from the finding templates.";
}
