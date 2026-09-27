"use client";

import type { RoundSummary } from "@/lib/contracts";

type Props = {
  rounds: RoundSummary[];
  /** Round number -> won by the coached player's team (from RoundStats). */
  won: ReadonlyMap<number, boolean>;
  /** Round number -> glyph of the moment picked in it. */
  moments: ReadonlyMap<number, "mistake" | "strength">;
  currentRoundId: string | null;
  onSelect: (roundId: string) => void;
};

/**
 * One cell per round (design plan item 2): filled for a round the player's team won,
 * outlined for a loss, and a triangle or circle under rounds that hold a moment.
 */
export function RoundStrip({ rounds, won, moments, currentRoundId, onSelect }: Props) {
  const half = Math.ceil(rounds.length / 2);
  return (
    <ol className="round-strip" aria-label="Rounds, won or lost" style={{ "--rounds": rounds.length } as React.CSSProperties}>
      {rounds.map((r, i) => {
        const w = won.get(r.number);
        const glyph = moments.get(r.number);
        const result = w == null ? "no result" : w ? "won" : "lost";
        return (
          <li key={r.id} className={i === half && rounds.length > 12 ? "half" : undefined}>
            <button
              type="button"
              className="rs-cell"
              data-won={w == null ? undefined : String(w)}
              aria-current={r.id === currentRoundId ? "true" : undefined}
              aria-label={`Round ${r.number}, ${result}${glyph ? `, ${glyph === "mistake" ? "a mistake" : "a good play"} picked` : ""}`}
              title={`Round ${r.number}, ${result}`}
              onClick={() => onSelect(r.id)}
            >
              <span className="rs-box" aria-hidden />
              {glyph ? <i className={`g g-${glyph}`} aria-hidden /> : <span className="rs-none" aria-hidden />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
