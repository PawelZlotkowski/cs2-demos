"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { CoachLanguage, MomentExplanation } from "@/lib/contracts";
import { COACH_LANGUAGES } from "@/lib/coach/language";
import { labRemembered } from "@/components/NavLinks";
import { CoachText, type CiteHandlers } from "./CoachText";
import { Feedback } from "./Feedback";

type Props = CiteHandlers & {
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
export function CoachExplanation({ matchId, playerId, momentId, round, language, onLanguage, ...cites }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
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
  }, [matchId, playerId, momentId, round, roundAsked, language]);

  // Review progress (A09): a moment counts as seen once its explanation is on screen
  const shown = state.kind === "done" && !!momentId;
  useEffect(() => {
    if (shown && momentId) void api.markSeen(matchId, momentId).catch(() => undefined);
  }, [shown, matchId, momentId]);

  return (
    <section className="layer coach-expl" aria-live="polite">
      <div className="coach-expl-h">
        <h3>Coach</h3>
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
      {state.kind === "idle" ? (
        <button type="button" className="link" onClick={() => setRoundAsked(true)}>
          Explain round {round}
        </button>
      ) : state.kind === "loading" ? (
        <p className="meta thinking">{momentId ? "Explaining this moment…" : `Explaining round ${round}…`}</p>
      ) : state.kind === "error" ? (
        <p className="meta err">{state.message}</p>
      ) : (
        <>
          <p className="expl">
            <CoachText text={state.data.text} {...cites} />
          </p>
          <p className="expl-note">
            {sourceNote(state.data)}
            {lab ? (
              <>
                {" "}
                <a href={`/admin/lab?matchId=${encodeURIComponent(matchId)}&job=explain#runs`}>How this was written</a>
              </>
            ) : null}
          </p>
          <Feedback matchId={matchId} target={momentId ?? `round-${round}`} />
        </>
      )}
    </section>
  );
}

export function sourceNote(e: MomentExplanation): string {
  if (e.source === "agent") return `Written by ${e.model ?? "the coach model"} and checked against the findings.`;
  if (e.verifierErrors.some((x) => /no findings/i.test(x))) return "No findings to explain here.";
  if (e.verifierErrors.length)
    return "Written from the findings, because the coach model's text did not pass the checks.";
  return "Written from the findings. The coach model is off.";
}
