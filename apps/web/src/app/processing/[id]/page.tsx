"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";
import type { Match, ReplayEvent, StatusResponse } from "@/lib/contracts";
import { PlayerPicker, type PickerPlayer } from "@/components/processing/PlayerPicker";
import { makeRosterLookup } from "@/lib/replay/roster";
import { COACH_LANGUAGES, useCoachLanguage } from "@/lib/coach/language";
import type { CoachLanguage } from "@/lib/contracts";

const TERMINAL = new Set(["complete", "failed"]);

/** Every kill in the match, paged; the picker only needs actor and victim. */
async function allKills(matchId: string): Promise<ReplayEvent[]> {
  const out: ReplayEvent[] = [];
  for (let offset = 0; ; offset += 2000) {
    const page = await api.getEvents(matchId, { offset, limit: 2000 });
    out.push(...page.events.filter((e) => e.type === "kill"));
    if (offset + page.events.length >= page.total || page.events.length === 0) return out;
  }
}

function withKillCounts(match: Match, kills: ReplayEvent[]): PickerPlayer[] {
  const roster = match.players ?? [];
  const lookup = makeRosterLookup(roster);
  const k = new Map<string, number>();
  const d = new Map<string, number>();
  for (const e of kills) {
    const killer = lookup(e.actorId);
    const victim = lookup(e.victimId);
    if (victim) d.set(victim.id, (d.get(victim.id) ?? 0) + 1);
    if (killer && killer.id !== victim?.id && killer.team !== victim?.team) {
      k.set(killer.id, (k.get(killer.id) ?? 0) + 1);
    }
  }
  return roster.map((p) => ({ ...p, kills: k.get(p.id) ?? 0, deaths: d.get(p.id) ?? 0 }));
}

export default function ProcessingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PickerPlayer[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const loadedPlayers = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const s = await api.getStatus(id);
        if (cancelled) return;
        setStatus(s);
        if (s.status === "complete") {
          // Radar is ready — open Studio; clips may still be recording.
          router.replace(`/studio/${id}`);
          return;
        }
        if (s.status === "failed") {
          setError(s.error ?? "Processing failed.");
          return;
        }
        // The Radar is ready here; stop and let the viewer choose whose game to analyse.
        if (s.status === "awaiting_player") {
          setPicking(null);
          return;
        }
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
  }, [id, router, pollKey]);

  const awaiting = status?.status === "awaiting_player";

  useEffect(() => {
    if (!awaiting || loadedPlayers.current) return;
    loadedPlayers.current = true;
    (async () => {
      try {
        const [m, kills] = await Promise.all([api.getMatch(id), allKills(id)]);
        setPlayers(withKillCounts(m, kills));
      } catch (e) {
        loadedPlayers.current = false;
        setError(e instanceof Error ? e.message : "Could not load the players.");
      }
    })();
  }, [awaiting, id]);

  const [coachLang, setCoachLang] = useCoachLanguage();

  const choose = useCallback(
    async (playerId: string) => {
      setPicking(playerId);
      setError(null);
      try {
        const s = await api.selectPlayer(id, playerId, coachLang);
        setStatus(s);
        setPollKey((k) => k + 1);
      } catch (e) {
        setPicking(null);
        setError(e instanceof Error ? e.message : "Could not start the analysis.");
      }
    },
    [id, coachLang],
  );

  const done = status ? TERMINAL.has(status.status) : Boolean(error);
  const failed = status?.status === "failed";

  // Whole-round clips; hidden when that recorder is off (the coach records its moments instead)
  const clips = status?.clips?.clips.some((c) => c.status !== "skipped") ? status.clips : null;
  const clipDetail =
    clips && clips.total > 0
      ? clips.done < clips.total
        ? `Gameplay clips recording — ${clips.done} of ${clips.total} ready. Radar opens first.`
        : `${clips.done} of ${clips.total} gameplay clips ready.`
      : null;

  return (
    <main className="main">
      <h1>{awaiting ? "Choose a player" : "Processing"}</h1>
      <p className="lede">
        {awaiting
          ? "The replay is ready. Pick whose game to analyse; mistakes and good plays are found from that player's side."
          : "Real stages only. Counts appear when they exist."}
      </p>
      {error ? (
        <p className="err" role="alert">
          {error} {failed ? <Link href="/upload">Choose another demo</Link> : null}
        </p>
      ) : null}
      {awaiting && status?.error ? (
        <p className="err" role="alert">
          {status.error}
        </p>
      ) : null}

      {awaiting ? (
        <>
          {players ? (
            <PlayerPicker players={players} busyId={picking} onPick={choose} />
          ) : (
            <p className="meta">Loading players…</p>
          )}
          <p className="meta lang-row" style={{ marginTop: 16 }}>
            <label>
              Coach language{" "}
              <select value={coachLang} onChange={(e) => setCoachLang(e.target.value as CoachLanguage)}>
                {COACH_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </p>
          <p className="meta" style={{ marginTop: 8 }}>
            <Link className="link" href={`/studio/${id}`}>
              Watch the replay without analysis
            </Link>
          </p>
        </>
      ) : null}

      <ol className={`stage-list${awaiting ? " compact" : ""}`} aria-live="polite">
        {(status?.stages ?? []).map((stage) => (
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
        {clips && clips.total > 0 ? (
          <li
            data-state={
              clips.done >= clips.total
                ? "done"
                : clips.clips.some((c) => c.status === "recording")
                  ? "active"
                  : "pending"
            }
          >
            <span className="s-ic" aria-hidden />
            <strong>Gameplay clips</strong>
            <span className="meta" style={{ gridColumn: "3", textAlign: "right" }}>
              {clips.done >= clips.total ? "done" : "recording"}
            </span>
            <div className="meta">
              {clips.done} / {clips.total}
            </div>
          </li>
        ) : null}
      </ol>
      {clipDetail ? <p className="meta">{clipDetail}</p> : null}
      {!status && !error ? <p className="meta">Waiting for status…</p> : null}
      {status && !done && !awaiting ? (
        <p className="meta" style={{ marginTop: 12 }}>
          Status: {status.status}
        </p>
      ) : null}
    </main>
  );
}
