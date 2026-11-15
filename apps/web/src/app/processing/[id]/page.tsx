"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";
import type { Match, ReplayEvent, StatusResponse } from "@/lib/contracts";
import { makeRosterLookup } from "@/lib/replay/roster";
import { killDeaths } from "@/lib/coach/findings";

export default function ProcessingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [kills, setKills] = useState<ReplayEvent[]>([]);
  const [choice, setChoice] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  // ?pick=1 reopens the picker on an analysed match to coach someone else.
  const [repick, setRepick] = useState(useSearchParams().get("pick") === "1");

  const choosing =
    status?.status === "awaiting_player" || (repick && status?.status === "complete");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const s = await api.getStatus(id);
        if (cancelled) return;
        setStatus(s);
        if (s.status === "complete") {
          if (!repick) router.replace(`/studio/${id}`);
          return;
        }
        if (s.status === "failed") {
          setError(s.error ?? "Processing failed.");
          return;
        }
        // The picker waits for the user; polling resumes once a player is sent.
        if (s.status === "awaiting_player") return;
        timer = setTimeout(poll, 800);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Status failed.");
          timer = setTimeout(poll, 1500);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, router, pollKey, repick]);

  // Roster and K/D for the picker, once the replay exists.
  useEffect(() => {
    if (!choosing || match) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, ev] = await Promise.all([api.getMatch(id), api.getEvents(id, { limit: 2000 })]);
        if (cancelled) return;
        setMatch(m);
        setKills(ev.events.filter((e) => e.type === "kill"));
        if (m.selectedPlayerId) setChoice(m.selectedPlayerId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the players.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [choosing, match, id]);

  const roster = match?.players ?? [];
  const kd = useMemo(() => killDeaths(kills, roster, makeRosterLookup(roster)), [kills, roster]);
  const teams = (["CT", "T"] as const)
    .map((side) => ({
      side,
      players: roster
        .filter((p) => p.team === side)
        .sort((a, b) => (kd.get(b.id)?.k ?? 0) - (kd.get(a.id)?.k ?? 0)),
    }))
    .filter((t) => t.players.length);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!choice || sending) return;
    setSending(true);
    setError(null);
    try {
      const s = await api.selectPlayer(id, choice);
      setStatus(s);
      setRepick(false);
      setPollKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the analysis.");
    } finally {
      setSending(false);
    }
  }

  const stages = status?.stages ?? [];
  const chosen = roster.find((p) => p.id === choice);

  return (
    <main className="main">
      <h1>{choosing ? "Choose the player to coach" : "Processing"}</h1>
      <p className="lede">
        {choosing
          ? "The radar is ready. Pick whose mistakes and good plays to look for; you can change it later."
          : "Real stages only. Counts appear when they exist."}
      </p>
      {error ? (
        <p className="err" role="alert">
          {error} <Link href="/upload">Choose another demo</Link>
        </p>
      ) : null}

      {choosing ? (
        <form className="picker" onSubmit={onSubmit} aria-busy={!match}>
          {!match ? <p className="meta">Loading players…</p> : null}
          {teams.map(({ side, players }) => (
            <fieldset key={side} className="pick-team">
              <legend>Started on {side}</legend>
              <div className="pick-head" aria-hidden>
                <span>Player</span>
                <span>K</span>
                <span>D</span>
              </div>
              {players.map((p) => {
                const s = kd.get(p.id);
                return (
                  <label key={p.id} className="pick-row">
                    <input
                      type="radio"
                      name="player"
                      value={p.id}
                      checked={choice === p.id}
                      onChange={() => setChoice(p.id)}
                    />
                    <span className="pick-name">{p.name}</span>
                    <span className="pick-n">{s?.k ?? 0}</span>
                    <span className="pick-n">{s?.d ?? 0}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
          {match ? (
            <div className="pick-actions">
              <button type="submit" className="btn btn-fill" disabled={!choice || sending}>
                {sending ? "Starting…" : chosen ? `Analyse ${chosen.name}` : "Analyse this player"}
              </button>
              <Link className="btn btn-line" href={`/studio/${id}`}>
                Open the radar without analysis
              </Link>
            </div>
          ) : null}
        </form>
      ) : null}

      <ol className="stage-list" aria-live="polite">
        {stages.map((stage) => (
          <li key={stage.id} data-state={stage.state}>
            <span className="s-ic" aria-hidden />
            <strong>{stage.label}</strong>
            <span className="meta" style={{ gridColumn: "3", textAlign: "right" }}>
              {stage.state}
            </span>
            {stage.detail ? <div className="meta">{stage.detail}</div> : null}
            {stage.progress ? (
              <div className="meta">
                {stage.progress.done} / {stage.progress.total}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {!status && !error ? <p className="meta">Waiting for status…</p> : null}
    </main>
  );
}
