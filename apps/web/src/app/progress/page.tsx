"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useCoachedPlayer } from "@/lib/coach/players";
import type { ProgressResponse } from "@/lib/contracts";

const MAP_NAME: Record<string, string> = { de_mirage: "Mirage", de_anubis: "Anubis" };

function trend(recent: number | null, before: number | null): string {
  if (recent == null || before == null) return "";
  if (recent === before) return `${recent} per 10 rounds, as before`;
  return `${recent} per 10 rounds lately, ${before} before`;
}

/** Progress: each detector per match and where the player dies (A11 without accounts; doc 29 §2.4, R17). */
export default function ProgressPage() {
  const { players, error: loadError, playerId, player, pick } = useCoachedPlayer();
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;
    let live = true;
    setData(null);
    api
      .getProgress(playerId)
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "The API did not answer."));
    return () => {
      live = false;
    };
  }, [playerId]);

  const refs = new Map((data?.matches ?? []).map((m) => [m.ref, m.matchId]));
  const maxCount = Math.max(1, ...(data?.detectors ?? []).flatMap((d) => d.counts));
  const byMap = new Map<string, ProgressResponse["zones"]>();
  for (const z of data?.zones ?? []) byMap.set(z.map, [...(byMap.get(z.map) ?? []), z]);

  return (
    <main className="main wide page-list" id="content">
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
        <p className="err" role="alert">
          {loadError ?? error}
        </p>
      ) : players?.length === 0 ? (
        <div className="empty">
          <p>No reviewed matches yet. Add a match and pick a player.</p>
          <Link className="btn btn-fill" href="/upload">
            Add match
          </Link>
        </div>
      ) : !data ? (
        <p className="meta">Loading…</p>
      ) : (
        <>
          <p className="meta">
            {player?.name ?? data.playerId}, <span className="num">{data.matches.length}</span>{" "}
            {data.matches.length === 1 ? "match" : "matches"}.{" "}
            {data.matches.length < 2 ? "Trends show from the second match on." : null}
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
                  <th scope="col">Lately</th>
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
                    <td className="meta">{trend(d.per10Recent, d.per10Before)}</td>
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
                                <Link key={e} href={`/studio/${mid}?f=${fid}`}>
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
