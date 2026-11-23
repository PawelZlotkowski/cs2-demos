"use client";

import { LoadingState } from "@/components/LoadingState";
import { PillBubble } from "@/components/PillBubble";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { api } from "@/lib/api/client";
import type { Finding, MomentClip, ReplayPlayer, RoundReplay, RoundSummary, SharedReview, StageView } from "@/lib/contracts";
import { errorText } from "@/lib/format";
import { usePlaybackClock, type PlaybackRate } from "@/lib/replay/usePlaybackClock";
import { interpolateAt, samplesHaveRadarCoords } from "@/lib/replay/interpolate";
import { getMapMeta } from "@/lib/replay/maps";
import { formatClock } from "@/lib/replay/time";
import { activeUtility, aspectBox, buildTracks, roundBounds } from "@/lib/replay/camera";
import { aliveSteps, eventTitle, laneMarks, makeRosterLookup, playerRoundScore, reasonLabel, type LaneMark } from "@/lib/replay/roster";
import { findingLabel, kindGlyph, kindLabel, leadFinding, pickedBecause } from "@/lib/coach/findings";
import { RadarView } from "@/components/replay/RadarView";
import { TeamHud } from "@/components/replay/TeamHud";
import { ReplayTimeline } from "@/components/replay/ReplayTimeline";
import { PovClip } from "@/components/replay/PovClip";
import { CoachText } from "@/components/coach/CoachText";
import { EvidenceTiles } from "@/components/review/EvidenceTiles";

const RATES: PlaybackRate[] = [1, 2, 4, 0.5];
type Moment = SharedReview["moments"][number];

/** A shared review (A14): the Studio, read-only. No Ask, notes, edits or share controls. */
export default function SharedPage() {
  const { token } = useParams<{ token: string }>();
  return <SharedStudio key={token} token={token} />;
}

function SharedStudio({ token }: { token: string }) {
  const [data, setData] = useState<SharedReview | null>(null);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [replay, setReplay] = useState<RoundReplay | null>(null);
  const [replayFailed, setReplayFailed] = useState(false);
  const [roundAttempt, setRoundAttempt] = useState(0);
  const [momentId, setMomentId] = useState<string | null>(null);
  const [review, setReview] = useState<"summary" | "wrapup" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [stageMode, setStageMode] = useState<StageView>("radar");
  const [mediaFailed, setMediaFailed] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [whole, setWhole] = useState(false);
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const pendingFinding = useRef<string | null>(null);
  const wasPlaying = useRef(false);
  const clock = usePlaybackClock(0);

  useEffect(() => setBarSlot(document.getElementById("bar-match")), []);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    Promise.all([api.shared(token), api.sharedRounds(token)])
      .then(([shared, rs]) => {
        if (!live) return;
        const first = shared.moments[0];
        const start = (first && rs.find((r) => r.number === first.round)) || rs[0];
        if (first && start?.number === first.round) {
          setMomentId(first.id);
          pendingSeek.current = first.t0;
          pendingFinding.current = first.findingIds[0] ?? null;
        }
        setData(shared);
        setRounds(rs);
        setRoundId(start?.id ?? null);
      })
      .catch((e) => { if (live) setError(errorText(e)); });
    return () => { live = false; };
  }, [token, attempt]);

  useEffect(() => {
    if (!roundId) return;
    let live = true;
    setReplay(null);
    setReplayFailed(false);
    clock.pause();
    api.sharedReplay(token, roundId)
      .then((r) => {
        if (!live) return;
        setReplay(r);
        clock.reset(r.durationSec);
        if (pendingSeek.current != null) clock.seek(pendingSeek.current);
        pendingSeek.current = null;
        setSelectedId(pendingFinding.current);
        pendingFinding.current = null;
      })
      .catch(() => { if (live) setReplayFailed(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, roundId, roundAttempt]);

  // ---- Derived replay state (as in the Studio) ----

  const moments = data?.moments ?? [];
  const stats = useMemo(() => [...(data?.roundStats ?? [])].sort((a, b) => a.round - b.round), [data]);
  const roundNumber = replay?.roundNumber ?? null;
  const roundStats = stats.find((s) => s.round === roundNumber);
  const roster = useMemo<ReplayPlayer[]>(() => {
    const list = replay?.players ?? [];
    const coached = list.find((p) => p.id === data?.playerId);
    // Older replays store the starting roster on every round, including after a side swap.
    if (!coached || !roundStats?.side || coached.team === roundStats.side) return list;
    return list.map((p) => ({ ...p, team: p.team === "CT" ? "T" : "CT" }));
  }, [replay, data?.playerId, roundStats?.side]);
  const lookup = useMemo(() => makeRosterLookup(roster), [roster]);
  const focus = lookup(data?.playerId);
  const hasRadar = useMemo(() => (replay ? samplesHaveRadarCoords(replay.samples, replay.map) : false), [replay]);
  const players = useMemo(() => (replay && hasRadar ? interpolateAt(replay.samples, clock.t, replay.map) : []), [replay, clock.t, hasRadar]);
  const tracks = useMemo(() => (replay ? buildTracks(replay.samples, replay.map) : new Map()), [replay]);
  const utility = useMemo(() => (replay ? activeUtility(replay.events, clock.t, replay.map) : []), [replay, clock.t]);
  const events = useMemo(() => (replay?.events ?? []).filter((e) => e.type !== "round_start" && e.type !== "round_end"), [replay]);
  const alive = useMemo(() => aliveSteps(replay?.samples ?? [], lookup), [replay, lookup]);
  const findingsById = useMemo(() => new Map((data?.findings ?? []).map((f) => [f.id, f])), [data]);
  const marks = useMemo(() => {
    const leads = new Set(moments.map((m) => m.findingIds[0]));
    const coach: LaneMark[] = (data?.findings ?? [])
      .filter((f) => f.round === roundNumber && (f.kind === "mistake" || f.kind === "good"))
      .map((f) => ({
        key: f.id, eventId: f.id, lane: "coach", t: f.t, glyph: kindGlyph(f.kind),
        label: findingLabel(f), detail: f.summary, priority: (leads.has(f.id) ? 1 : 0) + f.severity,
      }));
    return [...coach, ...laneMarks(events, lookup, focus)];
  }, [data, moments, roundNumber, events, lookup, focus]);

  const activeMoment = review ? undefined : moments.find((m) => m.id === momentId && m.round === roundNumber);
  const momentIdx = activeMoment ? moments.indexOf(activeMoment) : -1;
  const nextMoment = activeMoment ? moments[momentIdx + 1] : moments.find((m) => roundNumber != null && m.round > roundNumber);
  const momentFindings = activeMoment ? activeMoment.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => Boolean(f)) : [];
  const selectedFinding = selectedId ? findingsById.get(selectedId) : undefined;
  const headFinding = review ? undefined : selectedFinding ?? (activeMoment && !selectedId ? leadFinding(activeMoment, findingsById) : undefined);
  const selectedEvent = selectedId ? events.find((e) => e.id === selectedId) : undefined;
  const momentTitle = (m: Moment) => {
    const f = leadFinding(m, findingsById);
    return `${f ? findingLabel(f) : kindLabel(m.kind)}${f?.zone ? ` in ${f.zone}` : ""}`;
  };
  const name = data?.playerName ?? "the player";
  const mapLabel = getMapMeta(replay?.map ?? data?.map ?? "")?.displayName ?? data?.map?.replace(/^de_/, "") ?? "";
  const activeRound = rounds.find((r) => r.id === roundId);

  // Who the lens shows: the moment's other players and the duel opponent
  const eventInMoment = activeMoment && events.find((e) => e.type === "kill" && e.t >= activeMoment.t0 && e.t <= activeMoment.t1 &&
    (lookup(e.actorId)?.id === focus?.id || lookup(e.victimId)?.id === focus?.id));
  const participants = new Set(momentFindings.flatMap((f) => f.otherIds.map((id) => lookup(id)?.id ?? id)));
  for (const id of [eventInMoment?.actorId, eventInMoment?.victimId]) {
    const p = lookup(id);
    if (p) participants.add(p.id);
  }
  const opponent = eventInMoment && [eventInMoment.actorId, eventInMoment.victimId].map((id) => lookup(id)).find((p) => p && p.id !== focus?.id && p.team !== focus?.team);
  const opponentId = opponent?.id ?? [...participants].find((id) => lookup(id)?.team !== focus?.team);
  const killFeed = events.filter((e) => e.type === "kill" && e.t <= clock.t && clock.t - e.t < 5).slice(-2);
  const band = activeMoment
    ? { t0: activeMoment.t0, t1: activeMoment.t1, label: momentTitle(activeMoment), glyph: kindGlyph(activeMoment.kind), n: momentIdx + 1 }
    : null;

  // The moment's recorded clip, on the same clock as the radar
  const clipMoment = activeMoment ?? moments.find((m) => m.round === roundNumber && m.clip && clock.t >= m.t0 && clock.t <= m.t1);
  const clip: MomentClip | null = clipMoment?.clip
    ? { id: clipMoment.id, playerId: data!.playerId, round: clipMoment.round, momentId: clipMoment.id, status: "ready",
        t0: clipMoment.clipT0 ?? clipMoment.t0, t1: clipMoment.clipT1 ?? clipMoment.t1, url: clipMoment.clip }
    : null;
  const clipSrc = clip?.url && !mediaFailed ? api.mediaUrl(clip.url) : null;
  const clipMain = stageMode === "gameplay" && Boolean(clipSrc);
  useEffect(() => setMediaFailed(false), [clip?.url]);
  useEffect(() => { if (stageMode === "gameplay" && !clipSrc) setStageMode("radar"); }, [stageMode, clipSrc]);

  // ---- Radar camera: round area by default, whole map on toggle ----

  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  useLayoutEffect(() => {
    if (!stage) return;
    const measure = () => setSize({ w: Math.max(1, stage.clientWidth), h: Math.max(1, stage.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);
  const radarSize = getMapMeta(replay?.map ?? "")?.radarSize ?? 1024;
  const viewBox = useMemo(
    () => aspectBox((whole ? null : roundBounds(tracks, 100)) ?? { x: 0, y: 0, w: radarSize, h: radarSize }, size.w / size.h),
    [whole, tracks, radarSize, size],
  );
  const pxPerUnit = Math.min(size.w / viewBox.w, size.h / viewBox.h);

  // ---- Actions ----

  function openRound(roundNo: number, t: number | null, findingId: string | null) {
    const target = rounds.find((r) => r.number === roundNo);
    if (!target) return;
    clock.pause();
    setReview(null);
    if (target.id === roundId && replay) {
      if (t != null) clock.seek(t);
      setSelectedId(findingId);
    } else {
      pendingSeek.current = t;
      pendingFinding.current = findingId;
      setRoundId(target.id);
    }
  }
  const selectMoment = (m: Moment) => {
    setMomentId(m.id);
    openRound(m.round, m.t0, m.findingIds[0] ?? null);
  };
  const seekFinding = (f: Finding) => {
    setMomentId(moments.find((m) => m.round === f.round && m.findingIds.includes(f.id))?.id ?? null);
    openRound(f.round, Math.max(0, f.t - 3), f.id);
  };
  const selectRound = (r: RoundSummary) => {
    setMomentId(null);
    openRound(r.number, null, null);
  };
  const seek = (t: number, id?: string) => {
    clock.seek(t);
    setSelectedId(id ?? null);
  };
  const togglePlay = () => {
    if (!replay) return;
    if (!clock.playing && clock.t >= clock.duration) clock.seek(0);
    clock.toggle();
  };
  const stepEvent = (dir: 1 | -1) => {
    const ev = dir > 0 ? events.find((e) => e.t > clock.t + 0.05) : [...events].reverse().find((e) => e.t < clock.t - 0.05);
    if (!ev) return;
    clock.pause();
    seek(ev.t, ev.id);
  };
  const cites = {
    onHighlightFinding: setHighlighted,
    onFinding: (id: string) => { const f = findingsById.get(id); if (f) seekFinding(f); },
    onSeek: (t: number) => { clock.pause(); seek(t); },
    onMoment: (id: string) => { const m = moments.find((x) => x.id === id); if (m) selectMoment(m); },
    momentLabel: (id: string) => { const m = moments.find((x) => x.id === id); return m ? `round ${m.round} moment` : undefined; },
    passages: false,
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape" && ctxOpen) setCtxOpen(false);
      else if (e.code === "Space" && !el?.closest("button, a, summary, video")) { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (el?.closest('[role="slider"]')) return;
        e.preventDefault();
        clock.seekBy((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 5 : 1));
      } else if (e.key === "," || e.key === ".") stepEvent(e.key === "," ? -1 : 1);
      else if (e.key === "[" || e.key === "]") {
        const next = rounds[rounds.findIndex((r) => r.id === roundId) + (e.key === "[" ? -1 : 1)];
        if (next) selectRound(next);
      } else if (e.key.toLowerCase() === "n") {
        if (nextMoment) selectMoment(nextMoment);
        else if (activeMoment && data?.explanations.wrapup) setReview("wrapup");
      } else if (e.key.toLowerCase() === "v" && clipSrc) setStageMode((m) => (m === "radar" ? "gameplay" : "radar"));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Render ----

  if (error) return <main className="main state-page" id="content"><section className="sheet state-sheet">
    <h1>This shared review isn&rsquo;t available</h1>
    <p role="alert">{error} Check the link with the person who shared it.</p>
    <button type="button" className="btn btn-line" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
  </section></main>;
  if (!data) return <main id="content" className="studio studio-loading">
    <LoadingState label="Loading review moments…" /><LoadingState shape="stage" label="Loading the replay…" />
    <LoadingState label="Loading coach analysis…" />
  </main>;

  const score = playerRoundScore(stats);
  const scoreParts = String(data.score ?? "").match(/(\d+)\s*[–-]\s*(\d+)/);
  const us = score?.[0] ?? scoreParts?.[1] ?? "–";
  const them = score?.[1] ?? scoreParts?.[2] ?? "–";
  const reviewText = review ? data.explanations[review] : undefined;
  const momentText = activeMoment ? data.explanations[activeMoment.id] ?? activeMoment.pickedBecause : undefined;

  return (
    <main id="content" className="studio shared-studio">
      <h1 className="sr-only">{`${name} on ${mapLabel}, shared review`}</h1>
      {barSlot && createPortal(
        <div className="sb" aria-label={`${mapLabel}, ${us} to ${them}`}>
          <span className="sb-map">{mapLabel}</span>
          <span className="sb-score" aria-hidden><b>{us}</b><i>–</i><b className="them">{them}</b></span>
          <span className="tag shared-pill">Shared review, read only</span>
        </div>,
        barSlot,
      )}

      <aside className="rail glass" aria-label={moments.length ? "Review path" : "Rounds in this match"}>
        <div className="rail-h">
          <b>{moments.length ? `${moments.length} ${moments.length === 1 ? "moment" : "moments"}` : "Rounds"}</b>
          <span>{name}</span>
        </div>
        <div className="rail-scroll">
          {moments.length ? (
            <ol className="moments" aria-label={`Moments for ${name}`}>
              {moments.map((m, i) => {
                const current = m.id === activeMoment?.id;
                const lead = leadFinding(m, findingsById);
                const reason = pickedBecause(m);
                return (
                  <li key={m.id}>
                    <button type="button" className={`mom k-${kindGlyph(m.kind)}`} aria-current={current ? "true" : "false"} data-moment={m.id}
                      aria-label={`Moment ${i + 1}, ${kindLabel(m.kind)}: ${momentTitle(m)}. Round ${m.round}, ${formatClock(lead?.t ?? m.t0)}.`}
                      onClick={() => selectMoment(m)}>
                      {current && <span className="rail-ind" aria-hidden />}
                      <span className="mom-n">{String(i + 1).padStart(2, "0")}</span>
                      <i className={`g g-${kindGlyph(m.kind)}`} aria-hidden />
                      <span className="mom-title">{lead ? findingLabel(lead) : kindLabel(m.kind)}</span>
                      {current && <span className="mom-meta">
                        Round {m.round} at {formatClock(lead?.t ?? m.t0)}{lead?.zone ? `, ${lead.zone}` : ""}
                        {m.clip && <span className="mom-clip">Clip ready</span>}
                      </span>}
                      {current && reason && <span className="mom-reason">{reason.charAt(0).toUpperCase() + reason.slice(1)}</span>}
                    </button>
                  </li>
                );
              })}
              {data.explanations.wrapup ? (
                <li>
                  <button type="button" className="mom mom-cap" aria-current={review === "wrapup" ? "true" : "false"} onClick={() => setReview("wrapup")}>
                    {review === "wrapup" && <span className="rail-ind" aria-hidden />}
                    <span className="mom-n" aria-hidden><i className="g g-round" /></span>
                    <span className="mom-title">Debrief</span>
                    <span className="mom-meta"><span className="when">What to practise next</span></span>
                  </button>
                </li>
              ) : null}
            </ol>
          ) : null}
          <details className="round-picker" open={moments.length ? undefined : true}>
            <summary>All rounds</summary>
            {data.explanations.summary ? <button type="button" className="brief-link" onClick={() => setReview("summary")}>Match brief</button> : null}
            <ol className={`moments${moments.length ? " secondary" : ""}`} aria-label="All rounds">
              {rounds.map((r) => {
                const current = r.id === roundId && !activeMoment && !review;
                return (
                  <li key={r.id}>
                    <button type="button" className="mom" aria-current={current ? "true" : "false"} data-round={r.id}
                      aria-label={`Round ${r.number}. ${r.winner ?? "No"} win, ${reasonLabel(r.reason)}.`} onClick={() => selectRound(r)}>
                      {current && <span className="rail-ind" aria-hidden />}
                      <span className="mom-n" aria-hidden>{String(r.number).padStart(2, "0")}</span>
                      <span className="mom-title">{r.winner ? `${r.winner} win` : "No result"}</span>
                      <span className="mom-meta"><span className="when">{reasonLabel(r.reason)}, {Math.round(r.durationSec)} s</span></span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </details>
        </div>
      </aside>

      <section className="work" aria-label="Replay">
        {replay && <TeamHud roster={roster} players={players} round={replay.roundNumber} rounds={rounds} stats={stats} selectedId={focus?.id} />}
        <div className="stage-wrap">
          <div className="stage" ref={setStage}>
            {replay ? (
              <>
                <div className={`surface${clipMain ? " is-hidden" : " is-main"}`} data-mode="radar" hidden={clipMain}>
                  {hasRadar ? (
                    <>
                      <RadarView mapName={replay.map} t={clock.t} players={players} lookup={lookup} focus={focus} tracks={tracks}
                        utility={utility} viewBox={viewBox} pxPerUnit={pxPerUnit} moment={activeMoment ?? null} selectedId={focus?.id}
                        participants={[...participants]} opponentId={opponentId} lens={!whole}
                        highlighted={!!highlighted && momentFindings.some((f) => f.id === highlighted)}
                        shot={!!opponent && !!eventInMoment && clock.t >= eventInMoment.t && clock.t - eventInMoment.t < 1} />
                      <button type="button" className="zoom" aria-pressed={whole} onClick={() => setWhole((w) => !w)}>
                        {whole ? "This round" : "Whole map"}
                      </button>
                    </>
                  ) : (
                    <div className="stage-msg"><p>Radar positions are not available for <strong>{mapLabel}</strong>. The timeline still plays.</p></div>
                  )}
                </div>
                {clip && clipMain ? (
                  <PovClip clip={clip} src={clipSrc} main onMediaError={() => { clock.pause(); setMediaFailed(true); }}
                    playerName={name} t={clock.t} playing={clock.playing} rate={clock.rate}
                    onSeek={(t) => seek(t)} onEnlarge={() => setStageMode("gameplay")} onEnd={clock.pause} />
                ) : null}
                {killFeed.length > 0 && !clipMain && <div className="kill-feed" aria-label="Recent eliminations">
                  {killFeed.map((e) => <span key={e.id} title={e.label}>
                    <b data-side={lookup(e.actorId)?.team}>{lookup(e.actorId)?.name ?? "Unknown"}</b>
                    <span>{e.label.match(/\(([^()]+)\)\s*$/)?.[1]?.replace(/^weapon_/, "").replaceAll("_", " ") || "eliminated"}</span>
                    <b data-side={lookup(e.victimId)?.team}>{lookup(e.victimId)?.name ?? "Unknown"}</b>
                  </span>)}
                </div>}
              </>
            ) : (
              <div className="stage-msg">
                {replayFailed ? <><p role="alert">The replay for this round could not be loaded.</p>
                  <button type="button" className="btn btn-line" onClick={() => setRoundAttempt((n) => n + 1)}>Retry round</button></>
                  : roundId ? <LoadingState shape="stage" label="Loading round replay…" /> : <p>This match has no rounds to replay.</p>}
              </div>
            )}
          </div>
        </div>

        {replay && <div className="dock">
          <div className="transport">
            <button type="button" className="play" aria-label={clock.playing ? "Pause" : "Play"} aria-keyshortcuts="Space"
              title={clock.playing ? "Pause (Space)" : "Play (Space)"} onClick={togglePlay}>
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
                {clock.playing
                  ? <><rect x="2.5" y="1.5" width="3.2" height="11" fill="currentColor" /><rect x="8.3" y="1.5" width="3.2" height="11" fill="currentColor" /></>
                  : <path d="M3 1.5v11l9.5-5.5z" fill="currentColor" />}
              </svg>
            </button>
            <button type="button" className="step" aria-label="Previous event" title="Previous event (,)" onClick={() => stepEvent(-1)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 3.5v9M12 4 7 8l5 4z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="step" aria-label="Next event" title="Next event (.)" onClick={() => stepEvent(1)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M12 3.5v9M4 4l5 4-5 4z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="clock"><b>{formatClock(clock.t)}</b><span>of {formatClock(clock.duration).split(".")[0]}</span></div>
            <span className="transport-space" />
            <div className="seg" role="group" aria-label="View" title="Switch view (V)">
              <PillBubble value={clipMain ? "gameplay" : "radar"} />
              <button type="button" data-mode="radar" aria-pressed={!clipMain} onClick={() => setStageMode("radar")}>Radar</button>
              <button type="button" data-mode="gameplay" aria-pressed={clipMain} disabled={!clipSrc}
                title={clipSrc ? "Clip (V)" : "No clip was recorded for this moment"} onClick={() => setStageMode("gameplay")}>Clip</button>
            </div>
            <button type="button" className="t-opt" aria-label={`Playback speed, ${clock.rate} times`} title="Playback speed"
              onClick={() => clock.setRate(RATES[(RATES.indexOf(clock.rate) + 1) % RATES.length])}>{clock.rate}×</button>
            <button type="button" className="btn btn-line ctx-toggle" aria-expanded={ctxOpen} aria-controls="ctx" onClick={() => setCtxOpen((o) => !o)}>Coach</button>
          </div>
          <ReplayTimeline duration={replay.durationSec} t={clock.t} marks={marks} alive={alive} band={band}
            selectedEventId={highlighted ?? selectedId}
            onSeek={(t, id) => { if (id) clock.pause(); seek(t, id); }}
            onScrub={(active) => {
              if (active) { wasPlaying.current = clock.playing; clock.pause(); } else if (wasPlaying.current) clock.play();
            }} />
        </div>}
      </section>

      <aside className={`ctx sheet${ctxOpen ? " open" : ""}`} id="ctx" aria-label="Analysis">
        <button type="button" className="sheet-grab" aria-expanded={ctxOpen} aria-controls="ctx"
          aria-label={ctxOpen ? "Close the analysis" : "Open the analysis"} onClick={() => setCtxOpen((o) => !o)}>
          <span aria-hidden />
        </button>
        <div className="p-head">
          {headFinding ? <i className={`g g-${kindGlyph(headFinding.kind)}`} aria-hidden /> : null}
          <span className="lab">Analysis</span>
          <span className="sp" />
          {ctxOpen ? (
            <button type="button" className="icon-btn" aria-label="Close the analysis" onClick={() => setCtxOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          ) : null}
        </div>
        <div className="insight" id="insight">
          <span className="tag shared-pill shared-pill-sheet">Shared review, read only</span>
          {review ? (
            <>
              <h2 className="ins-head">{review === "summary" ? `${name} on ${mapLabel}` : "Debrief"}</h2>
              {reviewText ? <p lang={data.lang}><CoachText text={reviewText} {...cites} /></p> : null}
            </>
          ) : (
            <>
              {headFinding && <p className="ins-meta">
                <i className={`g g-${kindGlyph(headFinding.kind)}`} aria-hidden />
                {kindLabel(headFinding.kind)}{momentIdx >= 0 ? `, moment ${momentIdx + 1} of ${moments.length}` : ""}
              </p>}
              <h2 className="ins-head">
                {headFinding ? findingLabel(headFinding) : selectedEvent ? eventTitle(selectedEvent, lookup) : activeRound ? `Round ${activeRound.number}` : "Pick a moment"}
              </h2>
              {headFinding && <EvidenceTiles finding={headFinding} related={momentFindings} highlightedId={highlighted ?? selectedId} onSeek={seekFinding} />}
              {momentText ? <p lang={data.lang}><CoachText text={momentText} {...cites} /></p>
                : !moments.length ? <p>No coaching moments were selected for this review. Choose a round to watch its replay.</p> : null}
              {activeMoment ? (
                <div className="moment-step">
                  {nextMoment ? (
                    <button type="button" className="next-btn" aria-keyshortcuts="N" onClick={() => selectMoment(nextMoment)}>
                      <span className="next-k">Next</span>
                      <b>{String(momentIdx + 2).padStart(2, "0")}</b>
                      <i className={`g g-${kindGlyph(nextMoment.kind)}`} aria-hidden />
                      <span className="next-t">{momentTitle(nextMoment)}</span>
                      <kbd aria-hidden>N</kbd>
                    </button>
                  ) : data.explanations.wrapup ? (
                    <button type="button" className="next-btn is-last" aria-keyshortcuts="N" onClick={() => setReview("wrapup")}>
                      <span className="next-k">Done</span>
                      <span className="next-t">Open the debrief</span>
                      <kbd aria-hidden>N</kbd>
                    </button>
                  ) : null}
                </div>
              ) : null}
              {roundStats && activeRound ? (
                <section className="layer">
                  <h3>{name} in round {activeRound.number}{roundStats.side ? `, ${roundStats.side} side` : ""}{roundStats.won != null ? (roundStats.won ? ", won" : ", lost") : ""}</h3>
                  <dl className="stat-grid">
                    <div><dt><abbr title="Kills">K</abbr></dt><dd>{roundStats.kills}</dd></div>
                    <div><dt><abbr title="Deaths">D</abbr></dt><dd>{roundStats.deaths}</dd></div>
                    <div><dt><abbr title="Assists">A</abbr></dt><dd>{roundStats.assists}</dd></div>
                    <div><dt><abbr title="Damage">DMG</abbr></dt><dd>{roundStats.damage}</dd></div>
                    <div><dt><abbr title="Utility thrown">UTIL</abbr></dt><dd>{roundStats.utilityThrown}</dd></div>
                    <div><dt><abbr title="Equipment">EQUIP</abbr></dt><dd>{roundStats.equipValue != null ? `$${roundStats.equipValue}` : "—"}</dd></div>
                  </dl>
                </section>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </main>
  );
}
