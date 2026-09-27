"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Finding, GoodExamples } from "@/lib/contracts";
import { formatClock } from "@/lib/replay/time";

type Props = {
  matchId: string;
  playerId: string;
  finding: Finding;
  /** Open a finding of this match (same seek as a citation). */
  onFinding: (id: string) => void;
};

/** "Show a round where you did this well": the player's own good plays in the same zone (doc 29 §4.5, R15). */
export function DoneWell({ matchId, playerId, finding, onFinding }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GoodExamples | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
    setData(null);
    setError(null);
  }, [finding.id]);

  useEffect(() => {
    if (!open || data) return;
    let live = true;
    api
      .doneWell(matchId, playerId, finding.id)
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Unable to look that up."));
    return () => {
      live = false;
    };
  }, [open, data, matchId, playerId, finding.id]);

  if (finding.kind !== "mistake" || !finding.zone) return null;

  return (
    <section className="layer done-well">
      {open ? (
        <>
          <h3>Where you did well in {finding.zone}</h3>
          {error ? (
            <p className="meta err">{error}</p>
          ) : !data ? (
            <p className="meta">Looking through your matches…</p>
          ) : data.items.length === 0 ? (
            <p className="meta">No good play in {finding.zone} yet, in this match or your others.</p>
          ) : (
            <ul className="round-list">
              {data.items.map((g) => {
                const inner = (
                  <>
                    <span className="num t">
                      R{g.round} {formatClock(g.t)}
                    </span>
                    <span className="round-what">{g.summary}</span>
                    <span className="meta">{g.sameMatch ? "This match" : `Match ${g.id.split(":")[0].slice(1)}`}</span>
                  </>
                );
                return (
                  <li key={g.id}>
                    {g.sameMatch ? (
                      <button type="button" onClick={() => onFinding(g.findingId)}>
                        {inner}
                      </button>
                    ) : (
                      <Link href={`/studio/${g.matchId}?f=${g.findingId}`}>{inner}</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Show a round where you did this well
        </button>
      )}
    </section>
  );
}
