"use client";

import { LoadingState } from "@/components/LoadingState";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useCoachedPlayer } from "@/lib/coach/players";
import type { ProgressResponse } from "@/lib/contracts";

const MAP_NAME: Record<string, string> = { de_ancient: "Ancient", de_anubis: "Anubis", de_mirage: "Mirage" };

function trend(recent: number | null, before: number | null): string {
  if (recent == null || before == null) return "";
  if (recent === before) return `${recent} per 10 rounds, as before`;
  return `${recent} per 10 rounds lately, ${before} before`;
}

/** Progress: each detector per match and where the player dies (A11 without accounts; doc 29 §2.4, R17). */
export default function ProgressPage() {
  const { players, error: loadError, playerId, player, pick, retry } = useCoachedPlayer();
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!playerId) return;
    let live = true;
    setData(null);
    setError(null);
    api
      .getProgress(playerId)
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "The API did not answer."));
    return () => {
      live = false;
    };
  }, [playerId, attempt]);

  const refs = new Map((data?.matches ?? []).map((m) => [m.ref, m.matchId]));
  const trends = data?.detectors.some((d) => d.per10Recent != null) ?? false;
  const maxCount = Math.max(1, ...(data?.detectors ?? []).flatMap((d) => d.counts));
  const byMap = new Map<string, ProgressResponse["zones"]>();
  for (const z of data?.zones ?? []) byMap.set(z.map, [...(byMap.get(z.map) ?? []), z]);

  return (
    <main className="main wide page-list edge-scroll" id="content">
      <header className="page-h">
        <div>
          <h1>Progress</h1>
          <p className="lede">What keeps happening across your matches, oldest on the left. Counts come from the detectors; nothing here is a score.</p>
        </div>
        {players && players.length > 1 ? (
          <label className="who-pick">
            <span>Player</span>
            <select value={playerId ?? ""} onChange={(e) => pick(e.target.value)}>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {loadError || error ? (
        <div className="sheet state-sheet"><p role="alert">Player progress could not be loaded.</p>
          <button className="btn btn-line" onClick={loadError ? retry : () => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      ) : players?.length === 0 ? (
        <div className="empty">
          <p>No reviewed matches yet. Add a match and pick a player.</p>
          <Link className="btn btn-fill" href="/upload">
            Add match
          </Link>
        </div>
      ) : !data ? (
        <LoadingState label="Loading player progress…" />
      ) : (
        <>
          <p className="meta">
            {player?.name ?? data.playerId}, <span className="num">{data.matches.length}</span>{" "}
            {data.matches.length === 1 ? "match" : "matches"}.{" "}
            {/* The API compares the last 3 matches with the ones before (RECENT in apps/api/app/coach/plan.py) */}
            {trends ? null : "Trends show from the fourth match on."}
          </p>
          <div className="table-wrap">
            <table className="data prog">
              <thead>
                <tr>
                  <th scope="col">What</th>
                  {data.matches.map((m) => (
                    <th scope="col" key={m.ref} className="n">
                      <Link href={`/studio/${m.matchId}`} title={`${m.map}, ${m.when}, ${m.rounds} rounds`}>
                        {m.ref}
                      </Link>
                    </th>
                  ))}
                  {trends ? <th scope="col">Lately</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.detectors.map((d) => (
                  <tr key={d.detector} data-kind={d.kind}>
                    <th scope="row">
                      <i className={`g g-${d.kind === "good" ? "strength" : "mistake"}`} aria-hidden /> {d.label}
                    </th>
                    {d.counts.map((c, i) => (
                      <td key={i} className="n">
                        <span
                          className="dot"
                          style={{ ["--s" as string]: String(c ? 0.35 + (0.65 * c) / maxCount : 0) }}
                          aria-hidden
                        />
                        <span className="num">{c || ""}</span>
                      </td>
                    ))}
                    {trends ? <td className="meta">{trend(d.per10Recent, d.per10Before)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="settings-sec">
            <div className="sec-h">
              <h2>Where you die</h2>
              <span className="meta">Callouts with the most deaths across your matches, with the mistakes found there.</span>
            </div>
            {byMap.size === 0 ? (
              <p className="meta">No deaths placed on a callout yet.</p>
            ) : (
              <div className="zones-cols">
                {[...byMap.entries()].map(([map, zones]) => (
                  <div key={map}>
                    <h3>{MAP_NAME[map] ?? map}</h3>
                    <ol className="zone-rank">
                      {zones.map((z) => (
                        <li key={z.zone}>
                          <span className="num">{z.deaths}</span>
                          <span>{z.zone}</span>
                          <span className="zone-ex">
                            {z.examples.map((e) => {
                              const [ref, fid] = e.split(":");
                              const mid = refs.get(ref);
                              return mid ? (
                                <Link key={e} className="cite" href={`/studio/${mid}?f=${fid}`}>
                                  {e}
                                </Link>
                              ) : null;
                            })}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
