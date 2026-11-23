"use client";

import { LoadingState } from "@/components/LoadingState";
import { ModelNotice, useSystemStatus } from "@/components/SystemNotice";
import { PillBubble } from "@/components/PillBubble";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api/client";
import {
  REPLAY_READY_STATUSES,
  type ClipManifest,
  type Finding,
  type Match,
  type MomentClip,
  type ReplayPlayer,
  type RoundClip,
  type RoundReplay,
  type RoundStats,
  type RoundSummary,
  type SelectedMoment,
  type StageView,
} from "@/lib/contracts";
import { usePlaybackClock, type PlaybackRate } from "@/lib/replay/usePlaybackClock";
import { interpolateAt, samplesHaveRadarCoords } from "@/lib/replay/interpolate";
import { getMapMeta } from "@/lib/replay/maps";
import { formatClock } from "@/lib/replay/time";
import {
  activeUtility,
  aspectBox,
  buildTracks,
  roundBounds,
  type Box,
} from "@/lib/replay/camera";
import {
  aliveSteps,
  eventTitle,
  glyphForEvent,
  laneMarks,
  makeRosterLookup,
  playerRoundScore,
  matchRating,
  reasonLabel,
  typeLabel,
  type LaneMark,
} from "@/lib/replay/roster";
import { GameplayView } from "@/components/replay/GameplayView";
import { PovClip } from "@/components/replay/PovClip";
import {
  findingLabel,
  kindGlyph,
  kindLabel,
  leadFinding,
  pickedBecause,
} from "@/lib/coach/findings";
import { RadarView } from "@/components/replay/RadarView";
import { TeamHud } from "@/components/replay/TeamHud";
import { EvidenceTiles } from "@/components/review/EvidenceTiles";
import { ReplayTimeline } from "@/components/replay/ReplayTimeline";
import { CoachExplanation } from "@/components/coach/CoachExplanation";
import { CoachPanel } from "@/components/coach/CoachPanel";
import { NotFound, isNotFound } from "@/components/NotFound";
import { RoundStrip } from "@/components/review/RoundStrip";
import { RoundPanel } from "@/components/review/RoundPanel";
import { NotesPanel } from "@/components/review/NotesPanel";
import { DoneWell } from "@/components/review/DoneWell";
import { ReviewOverview, ReviewWrapUpPanel } from "@/components/review/ReviewPanels";
import { useCoachLanguage } from "@/lib/coach/language";
import gsap from "gsap";
import { fadeIn, flipFrom } from "@/lib/motion";

const RATES: PlaybackRate[] = [1, 2, 4, 0.5];
/** The two stage surfaces that trade places when Gameplay and Radar swap. */
const SWAP_SURFACES = [".stage .pov", '.stage .surface[data-mode="radar"]'];
const LIVE_SEC = 2.5;

function scorePhrase(score: string): string {
  const m = String(score).match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!m) return score;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === b) return `drew ${a} to ${b}`;
  return `${a > b ? "won" : "lost"} ${a} to ${b}`;
}

type PlayerAnalysisView = {
  playerId: string;
  moments: SelectedMoment[];
  findings: Finding[];
  stats: RoundStats[];
};

function focusKey(matchId: string) {
  return `rr.focus.${matchId}`;
}

const Chev = () => (
  <svg className="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
    <path d="M3.5 1.5L7 5 3.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export default function StudioPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  return <StudioMatch key={matchId} matchId={matchId} />;
}

function StudioMatch({ matchId }: { matchId: string }) {
  const system = useSystemStatus();
  const recorder = system?.checks.find((check) => check.name === "csdm")?.state;
  const [debug, setDebug] = useState(false);

  const [match, setMatch] = useState<Match | null>(null);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [replay, setReplay] = useState<RoundReplay | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [matchAttempt, setMatchAttempt] = useState(0);
  const [roundAttempt, setRoundAttempt] = useState(0);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [clipListFailed, setClipListFailed] = useState(false);
  const [povListFailed, setPovListFailed] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [panelOn, setPanelOn] = useState(true);
  const [ctxOpen, setCtxOpen] = useState(false);
  /** Sheet drag on phones: where it started, and whether the pointer moved enough to be a drag. */
  const grab = useRef<{ y: number; t: number; base: number; max: number; dy: number } | null>(null);
  const grabDragged = useRef(false);
  /** Set while a keyboard shortcut is being handled: keyboard actions never animate (11 Motion). */
  const viaKey = useRef(false);
  const insightRef = useRef<HTMLDivElement>(null);
  const railPrev = useRef<{ top: number; left: number; w: number; h: number } | null>(null);
  const swapFirst = useRef<Map<string, DOMRect> | null>(null);
  const [highlightedFinding, setHighlightedFinding] = useState<string | null>(null);
  const [lens, setLens] = useState(true);
  const pendingFinding = useRef<string | null>(null);
  const [whole, setWhole] = useState(false);
  const [asking, setAsking] = useState(false);
  // The Round and Notes tabs (doc 29 R04, R08) take the panel's place; the ask bar stays under them
  const [extraTab, setExtraTab] = useState<"round" | "notes" | null>(null);
  const [analysis, setAnalysis] = useState<PlayerAnalysisView | null>(null);
  const [momentId, setMomentId] = useState<string | null>(null);
  /** Design plan items 2 and 3: the opening overview and the closing wrap-up take the panel. */
  const [review, setReview] = useState<"overview" | "wrapup" | null>(null);
  const [seenMoments, setSeenMoments] = useState<Set<string>>(() => new Set());
  const [coachLang, setCoachLang] = useCoachLanguage();
  /** Clock time to seek to once the next round replay has loaded (moment jumps across rounds). */
  const pendingSeek = useRef<number | null>(null);
  const askRef = useRef<HTMLInputElement>(null);
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
  const [stageMode, setStageMode] = useState<StageView>("radar");
  const [clipManifest, setClipManifest] = useState<ClipManifest | null>(null);
  const [povClips, setPovClips] = useState<MomentClip[]>([]);
  const [retryError, setRetryError] = useState<{ id: string; text: string } | null>(null);
  const [povPoll, setPovPoll] = useState(0);
  const clock = usePlaybackClock(0);
  const wasPlaying = useRef(false);

  useEffect(() => {
    setDebug(new URLSearchParams(window.location.search).get("debug") === "1");
    setBarSlot(document.getElementById("bar-match"));
  }, []);

  // ---- Data ----

  useEffect(() => {
    let cancelled = false;
    setLoadingMatch(true);
    setAnalysisFailed(false);
    setMatch(null);
    setLoadError(null);
    setRounds([]);
    setRoundId(null);
    setReplay(null);
    setSeen(new Set());
    setAnalysis(null);
    setMomentId(null);
    setReview(null);
    setSeenMoments(new Set());
    pendingFinding.current = null;
    pendingSeek.current = null;
    try {
      setFocusId(window.localStorage.getItem(focusKey(matchId)));
    } catch {
      setFocusId(null);
    }
    (async () => {
      try {
        const [m, rs] = await Promise.all([api.getMatch(matchId), api.getRounds(matchId)]);
        if (cancelled) return;
        let view: PlayerAnalysisView | null = null;
        const pid = m.selectedPlayerId;
        if (pid && m.status === "complete") {
          try {
            const [moments, findings, stats, progress] = await Promise.all([
              api.getPlayerMoments(matchId, pid),
              api.getFindings(matchId, pid),
              api.getRoundStats(matchId, pid),
              api.getReviewProgress(matchId).catch(() => []),
            ]);
            if (!cancelled) setSeenMoments(new Set(moments.filter((m) => progress.some((p) => p.momentId === m.id)).map((m) => m.id)));
            view = { playerId: pid, moments, findings, stats };
          } catch {
            if (!cancelled) setAnalysisFailed(true);
          }
        }
        if (cancelled) return;
        setMatch(m);
        setRounds(rs);
        setAnalysis(view);
        if (pid) setFocusId(pid);
        // Open the linked evidence or the first selected moment.
        // ?f=F3 (from the Coach page) opens the moment holding that finding at its time, or else its round.
        const q = new URLSearchParams(window.location.search);
        const linkedFinding = view?.findings.find((x) => x.id === q.get("f"));
        const findingMoment = linkedFinding
          ? view?.moments.find((x) => x.findingIds.includes(linkedFinding.id))
          : undefined;
        if (linkedFinding && !findingMoment) {
          const fRound = rs.find((r) => r.number === linkedFinding.round);
          if (fRound) {
            pendingFinding.current = linkedFinding.id;
            pendingSeek.current = Math.max(0, linkedFinding.t - 3);
            setRoundId(fRound.id);
            return;
          }
        }
        if (linkedFinding && findingMoment) {
          q.set("m", findingMoment.id);
          pendingFinding.current = linkedFinding.id;
          if (!q.get("t") || !Number.isFinite(Number(q.get("t")))) q.set("t", String(Math.max(0, linkedFinding.t - 3)));
        }
        const linked = view?.moments.find((x) => x.id === q.get("m"));
        const first = linked ?? view?.moments[0];
        const firstRound = first ? rs.find((r) => r.number === first.round) : undefined;
        const linkedT = Number(q.get("t"));
        if (first && firstRound) {
          pendingSeek.current = linked && Number.isFinite(linkedT) && q.get("t") ? linkedT : first.t0;
          setMomentId(first.id);
          setRoundId(firstRound.id);
          setReview(null);
        } else if (rs.length) setRoundId(rs[0].id);

      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load.");
      } finally {
        if (!cancelled) setLoadingMatch(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, matchAttempt]);

  useEffect(() => {
    if (!roundId) return;
    let cancelled = false;
    setReplay(null);
    setLoadError(null);
    clock.pause();
    setLoadingReplay(true);
    setSeen((s) => (s.has(roundId) ? s : new Set(s).add(roundId)));
    (async () => {
      try {
        const r = await api.getRoundReplay(matchId, roundId);
        if (cancelled) return;
        setReplay(r);
        clock.reset(r.durationSec);
        if (pendingSeek.current != null) {
          clock.seek(pendingSeek.current);
          pendingSeek.current = null;
        }
        setSelectedEventId(pendingFinding.current);
        pendingFinding.current = null;
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load replay.");
      } finally {
        if (!cancelled) setLoadingReplay(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, roundId, roundAttempt]);

  // Poll clip manifest so Gameplay enables as rounds finish recording
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (!match || !rounds.length) return;
    async function poll() {
      try {
        const man = await api.getClips(matchId);
        if (cancelled) return;
        setClipManifest(man);
        setClipListFailed(false);
        const pending = man.clips.some(
          (c) => c.status === "queued" || c.status === "recording",
        );
        if (pending) timer = setTimeout(poll, 2000);
      } catch {
        if (!cancelled) { setClipListFailed(true); timer = setTimeout(poll, 4000); }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [matchId, match, rounds.length]);

  // Poll the coached player's POV clips while any are queued or recording.
  // Re-runs on round change: explaining a round on demand queues a clip for it.
  const analysedPlayer = analysis?.playerId ?? null;
  useEffect(() => {
    if (!analysedPlayer) {
      setPovClips([]);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const list = await api.getPlayerClips(matchId, analysedPlayer!);
        if (cancelled) return;
        setPovClips(list);
        setPovListFailed(false);
        if (list.some((c) => c.status === "queued" || c.status === "recording")) timer = setTimeout(poll, 3000);
      } catch {
        if (!cancelled) { setPovListFailed(true); timer = setTimeout(poll, 6000); }
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [matchId, analysedPlayer, roundId, povPoll]);

  // ---- Derived replay state ----

  const roundNumber = replay?.roundNumber ?? null;
  const roundStats = analysis?.stats.find((r) => r.round === roundNumber);
  const roster = useMemo<ReplayPlayer[]>(() => {
    const players = replay?.players ?? match?.players ?? [];
    const coached = players.find((p) => p.id === analysis?.playerId);
    // Older replays store the starting roster on every round, including after a side swap.
    if (!coached || !roundStats?.side || coached.team === roundStats.side) return players;
    return players.map((p) => ({ ...p, team: p.team === "CT" ? "T" : "CT" }));
  }, [replay, match, analysis?.playerId, roundStats?.side]);
  const lookup = useMemo(() => makeRosterLookup(roster), [roster]);
  const focus = useMemo(
    () => lookup(focusId) ?? roster.find((p) => p.team === "CT") ?? roster[0],
    [lookup, focusId, roster],
  );

  const hasRadar = useMemo(
    () => (replay ? samplesHaveRadarCoords(replay.samples, replay.map) : false),
    [replay],
  );
  const players = useMemo(
    () => (replay && hasRadar ? interpolateAt(replay.samples, clock.t, replay.map) : []),
    [replay, clock.t, hasRadar],
  );
  const tracks = useMemo(
    () => (replay ? buildTracks(replay.samples, replay.map) : new Map()),
    [replay],
  );
  const utility = useMemo(
    () => (replay ? activeUtility(replay.events, clock.t, replay.map) : []),
    [replay, clock.t],
  );

  const events = useMemo(
    () =>
      (replay?.events ?? []).filter((e) => e.type !== "round_start" && e.type !== "round_end"),
    [replay],
  );
  const findingsById = useMemo(
    () => new Map((analysis?.findings ?? []).map((f) => [f.id, f])),
    [analysis],
  );
  const roundFindings = useMemo(
    () => (analysis?.findings ?? []).filter((f) => f.round === roundNumber).sort((a, b) => a.t - b.t),
    [analysis, roundNumber],
  );
  const momentLeads = useMemo(
    () => new Set((analysis?.moments ?? []).map((m) => m.findingIds[0]).filter(Boolean)),
    [analysis],
  );
  const marks = useMemo(() => {
    const coach: LaneMark[] = roundFindings
      .filter((f) => f.kind === "mistake" || f.kind === "good")
      .map((f) => ({
        key: f.id,
        eventId: f.id,
        lane: "coach",
        t: f.t,
        glyph: kindGlyph(f.kind),
        label: findingLabel(f),
        detail: f.summary,
        // Moment leads win a shared spot on the lane, then severity.
        priority: (momentLeads.has(f.id) ? 1 : 0) + f.severity,
      }));
    return [...coach, ...laneMarks(events, lookup, focus)];
  }, [roundFindings, momentLeads, events, lookup, focus]);
  const moments = analysis?.moments ?? [];
  const activeMoment = moments.find((m) => m.id === momentId && m.round === roundNumber);
  const analysedName = analysis ? (lookup(analysis.playerId)?.name ?? "the selected player") : "";
  const povClip = useMemo(() => {
    const here = povClips.filter((c) => c.round === roundNumber);
    const newest = (list: MomentClip[]) => list[list.length - 1];
    return (
      (activeMoment && newest(here.filter((c) => c.momentId === activeMoment.id))) ||
      newest(here.filter((c) => clock.t >= c.t0 && clock.t <= c.t1 && c.status === "ready")) ||
      here.find((c) => c.status === "ready") ||
      newest(here) ||
      null
    );
  }, [povClips, roundNumber, activeMoment, clock.t]);
  const povReady = new Set(povClips.filter((c) => c.status === "ready" && c.momentId).map((c) => c.momentId));
  const retryPov = useCallback(
    (clipId: string) => {
      if (!analysedPlayer) return;
      setRetryError(null);
      void api
        .retryPlayerClip(matchId, analysedPlayer, clipId)
        .catch(() => setRetryError({ id: clipId, text: "The recording could not be queued. Check the recorder and try again." }))
        .finally(() => setPovPoll((n) => n + 1));
    },
    [matchId, analysedPlayer],
  );

  const markMomentSeen = useCallback((id: string) => {
    setSeenMoments((seen) => seen.has(id) ? seen : new Set(seen).add(id));
  }, []);

  // Keep ?m=&t= in the address so a moment can be sent to a teammate (design plan item 3).
  const pausedAt = clock.playing ? null : Math.round(clock.t * 10) / 10;
  useEffect(() => {
    if (loadingMatch || loadingReplay || replay?.roundId !== roundId) return;
    const url = new URL(window.location.href);
    const inMoment = Boolean(momentId && !review && activeMoment);
    if (inMoment) url.searchParams.set("m", momentId!);
    else url.searchParams.delete("m");
    if (selectedEventId && findingsById.has(selectedEventId) && !review) url.searchParams.set("f", selectedEventId);
    else url.searchParams.delete("f");
    if (inMoment && pausedAt != null) url.searchParams.set("t", String(pausedAt));
    else url.searchParams.delete("t");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [loadingMatch, loadingReplay, replay?.roundId, roundId, momentId, review, activeMoment, pausedAt, selectedEventId, findingsById]);

  const momentRounds = useMemo(
    () =>
      new Map(
        (analysis?.moments ?? []).map((m) => [m.round, kindGlyph(m.kind) as "mistake" | "strength"]),
      ),
    [analysis],
  );

  const liveEvent = useMemo(() => {
    let last = null;
    for (const e of events) if (e.t <= clock.t + 0.05) last = e;
    return last;
  }, [events, clock.t]);
  const selectedFinding = selectedEventId ? findingsById.get(selectedEventId) : undefined;
  const selected =
    (selectedEventId && events.find((e) => e.id === selectedEventId)) || (selectedFinding ? null : liveEvent);

  const roundIdx = rounds.findIndex((r) => r.id === roundId);
  const activeRound = roundIdx >= 0 ? rounds[roundIdx] : undefined;
  const nextRound = roundIdx >= 0 ? rounds[roundIdx + 1] : undefined;
  const mapMeta = getMapMeta(replay?.map ?? match?.map ?? "");
  const mapLabel = mapMeta?.displayName ?? match?.map?.replace(/^de_/, "") ?? "—";

  const activeClip: RoundClip | null = useMemo(() => {
    if (!roundId) return null;
    const fromReplay = replay?.clip ?? null;
    const fromMan = clipManifest?.clips.find((c) => c.roundId === roundId) ?? null;
    const fromRound = activeRound?.clip ?? null;
    return fromMan ?? fromReplay ?? fromRound;
  }, [roundId, replay, clipManifest, activeRound]);

  // The coached player's moment clip wins over a whole-round clip for the Gameplay view
  const povSrc = povClip?.status === "ready" && povClip.url ? api.mediaUrl(povClip.url) : null;
  const roundClipReady = activeClip?.status === "ready" && Boolean(activeClip.url);
  const gameplayReady = Boolean(povSrc) || roundClipReady;
  const gameplaySrc = !povSrc && roundClipReady && roundId ? api.clipUrl(matchId, roundId) : null;
  const currentMedia = povSrc ?? gameplaySrc;
  const mediaFailed = Boolean(currentMedia && mediaError === currentMedia);
  const povMain = stageMode === "gameplay" && Boolean(povSrc) && !mediaFailed;
  const gameplayDisabledReason = useMemo(() => {
    if (gameplayReady) return null;
    if (retryError && retryError.id === povClip?.id) return retryError.text;
    if (povClip?.status === "failed") return povClip.error || "Recording this moment failed. Follow it on the radar.";
    if (activeClip?.status === "failed" && !povClip) return activeClip.error || "Recording this round failed. Follow it on the radar.";
    if (recorder === "off") return "The clip recorder is off on this PC. The radar shows the same moment.";
    if (recorder === "problem") return "The clip recorder is unavailable. Follow this moment on the radar.";
    if (povClip?.status === "queued" || povClip?.status === "recording") return "Recording this moment's clip…";
    if (povClip?.status === "skipped") return povClip.error || "The recorder skipped this clip. You can follow the moment on the radar.";

    if (activeClip?.status === "skipped") return activeClip.error || "No clip was recorded for this round. Follow the moment on the radar.";
    if (clipListFailed || povListFailed) return "Clip details could not be loaded. Checking again…";
    if (!clipManifest && !activeClip) return "Checking for recorded clips…";
    if (!activeClip) return "No clip was recorded for this round. Follow the moment on the radar.";
    if (activeClip.status === "queued" || activeClip.status === "recording") {
      const done = clipManifest?.done ?? 0;
      const total = clipManifest?.total ?? 0;
      return total
        ? `Recording gameplay… ${done} of ${total} clips ready.`
        : "Recording gameplay…";
    }
    if (activeClip.status === "failed") {
      return activeClip.error ?? "Unable to record gameplay for this round. The radar still covers it.";
    }
    return "Gameplay clip is not ready.";
  }, [activeClip, gameplayReady, clipManifest, povClip, recorder, clipListFailed, povListFailed, retryError]);

  // Keep clock master in sync with stage mode
  useEffect(() => {
    // A moment clip follows the shared clock; only a whole-round clip drives it
    if (stageMode === "gameplay" && gameplayReady && !povSrc && !mediaFailed) {
      clock.setMaster("video");
    } else {
      clock.setMaster("raf");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageMode, gameplayReady, povSrc, mediaFailed]);

  const setMode = useCallback(
    (mode: StageView) => {
      // Continuity for the Gameplay/Radar swap: remember where both surfaces were (FLIP)
      if (!viaKey.current && mode !== stageMode) {
        const first = new Map<string, DOMRect>();
        for (const sel of SWAP_SURFACES) {
          const el = document.querySelector(sel);
          if (el) first.set(sel, el.getBoundingClientRect());
        }
        swapFirst.current = first;
      }
      if (mode === "gameplay" && (!gameplayReady || mediaFailed)) clock.pause();
      setStageMode(mode);
    },
    [stageMode, gameplayReady, mediaFailed, clock.pause],
  );

  useLayoutEffect(() => {
    const first = swapFirst.current;
    swapFirst.current = null;
    if (!first) return;
    for (const [sel, rect] of first) {
      const el = document.querySelector(sel);
      if (el) flipFrom(el, rect, { duration: 240 });
    }
  }, [stageMode]);

  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ w: 1, h: 1 });

  useLayoutEffect(() => {
    if (!stage) return;
    const measure = () => setStageSize({ w: Math.max(1,stage.clientWidth), h: Math.max(1,stage.clientHeight) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  // ---- Radar camera: round area by default, whole map on toggle; 320ms viewBox tween ----

  const radarSize = mapMeta?.radarSize ?? 1024;
  // Under a clip the radar is a square inset, so frame it square instead of the stage's shape
  const aspect = povMain ? 1 : stageSize.w / Math.max(stageSize.h, 1);
  const target = useMemo<Box>(() => {
    const area = whole ? null : roundBounds(tracks, 100);
    return aspectBox(area ?? { x: 0, y: 0, w: radarSize, h: radarSize }, aspect);
  }, [whole, tracks, radarSize, aspect]);

  const [viewBox, setViewBox] = useState<Box>(target);
  const vbRef = useRef(viewBox);
  const animateCam = useRef(false);
  useEffect(() => {
    const from = vbRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animateCam.current || reduce) {
      vbRef.current = target;
      setViewBox(target);
      return;
    }
    animateCam.current = false;
    // Radar camera move (GSAP: space and continuity). A proxy box tweens; React draws each frame.
    const box = { ...from };
    const tween = gsap.to(box, {
      x: target.x,
      y: target.y,
      w: target.w,
      h: target.h,
      duration: 0.32,
      ease: "power2.inOut",
      onUpdate: () => {
        const b = { x: box.x, y: box.y, w: box.w, h: box.h };
        vbRef.current = b;
        setViewBox(b);
      },
    });
    return () => {
      tween.kill();
    };
  }, [target]);

  const pxPerUnit = Math.min(stageSize.w / viewBox.w, stageSize.h / viewBox.h);

  // ---- Actions ----

  const selectRound = useCallback(
    (id: string) => {
      animateCam.current = !viaKey.current;
      setReview(null);
      setMomentId(null);
      setSelectedEventId(null);
      pendingFinding.current = null;
      pendingSeek.current = null;
      setRoundId(id);
    },
    [],
  );

  const seekTo = useCallback(
    (t: number, eventId?: string) => {
      clock.seek(t);
      setSelectedEventId(eventId ?? null);
      setReview(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clock.seek],
  );

  const selectMoment = useCallback(
    (m: SelectedMoment) => {
      const target = rounds.find((r) => r.number === m.round);
      if (!target) return;
      clock.pause();
      setReview(null);
      setMomentId(m.id);
      const lead = m.findingIds[0] ?? null;
      if (target.id === roundId && replay) {
        clock.seek(m.t0);
        setSelectedEventId(lead);
      } else {
        animateCam.current = !viaKey.current;
        pendingSeek.current = m.t0;
        pendingFinding.current = lead;
        setRoundId(target.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rounds, roundId, replay, clock.pause, clock.seek],
  );

  const seekFinding = useCallback(
    (f: Finding) => {
      const target = rounds.find((r) => r.number === f.round);
      if (!target) return;
      clock.pause();
      setReview(null);
      const seekTime = Math.max(0,f.t - 3);
      const moment = moments.find((m) => m.round === f.round && m.findingIds.includes(f.id));
      setMomentId(moment?.id ?? null);
      if (target.id === roundId && replay) {
        seekTo(seekTime, f.id);
      } else {
        animateCam.current = !viaKey.current;
        pendingSeek.current = seekTime;
        pendingFinding.current = f.id;
        setRoundId(target.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rounds, roundId, replay, clock.pause, seekTo, moments],
  );

  /** Open a round (if it is not the one in view) at a time: the Notes tab's rows. */
  const openAt = useCallback(
    (roundNo: number, t: number) => {
      const target = rounds.find((r) => r.number === roundNo);
      if (!target) return;
      clock.pause();
      setReview(null);
      if (target.id === roundId && replay) {
        seekTo(t);
      } else {
        pendingSeek.current = t;
        setMomentId(null);
        setRoundId(target.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rounds, roundId, replay, clock.pause, seekTo],
  );

  const stepEvent = useCallback(
    (dir: 1 | -1) => {
      const ts = events.map((e) => e.t);
      const idx =
        dir > 0
          ? ts.findIndex((x) => x > clock.t + 0.05)
          : ts.map((x, i) => (x < clock.t - 0.05 ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
      const ev = idx >= 0 ? events[idx] : undefined;
      if (!ev) return;
      clock.pause();
      seekTo(ev.t, ev.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, clock.t, clock.pause, seekTo],
  );

  const stepRound = useCallback(
    (dir: 1 | -1) => {
      const next = rounds[roundIdx + dir];
      if (next) selectRound(next.id);
    },
    [rounds, roundIdx, selectRound],
  );

  const follow = (id: string) => {
    setFocusId(id);
    try {
      window.localStorage.setItem(focusKey(matchId), id);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const togglePlay = () => {
    if (!replay || loadingReplay) return;
    if (!clock.playing && clock.t >= clock.duration) clock.seek(0);
    clock.toggle();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage?.requestFullscreen?.();
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (e.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (e.key === "Escape" && ctxOpen && window.matchMedia("(max-width: 1180px)").matches) {
        setCtxOpen(false);
        const opener = document.querySelector<HTMLElement>(window.matchMedia("(max-width: 720px)").matches ? ".sheet-grab" : ".ctx-toggle");
        opener?.focus();
        return;
      }
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      viaKey.current = true;
      insightRef.current?.setAttribute("data-instant", "");
      window.setTimeout(() => {
        viaKey.current = false;
      }, 0);
      window.setTimeout(() => insightRef.current?.removeAttribute("data-instant"), 300);

      if (e.code === "Space") {
        if (el?.closest("button, a, summary, [role=tab]")) return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        clock.seekBy(e.shiftKey ? -5 : -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        clock.seekBy(e.shiftKey ? 5 : 1);
      } else if (e.key === ",") {
        e.preventDefault();
        stepEvent(-1);
      } else if (e.key === ".") {
        e.preventDefault();
        stepEvent(1);
      } else if (e.key === "[") {
        stepRound(-1);
      } else if (e.key === "]") {
        stepRound(1);
      } else if (e.key === "/") {
        e.preventDefault();
        setAsking(true);
        setExtraTab(null);
        if (!panelOn) setPanelOn(true);
        setCtxOpen(window.matchMedia("(max-width: 1180px)").matches);
        window.setTimeout(() => askRef.current?.focus(), 0);

      } else if (e.key === "n" || e.key === "N") {
        // Next moment; after the last one, the wrap-up (design plan item 3)
        if (review === "overview" && moments[0]) selectMoment(moments[0]);
        else if (nextMoment) selectMoment(nextMoment);
        else if (activeMoment) setReview("wrapup");
      } else if (e.key.toLowerCase() === "l") {
        setLens((visible) => !visible);
      } else if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        setMode(stageMode === "radar" ? "gameplay" : "radar");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!roundId) return;
    document
      .querySelector(momentId ? `.mom[data-moment="${momentId}"]` : `.mom[data-round="${roundId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [roundId, momentId, loadingMatch]);

  useEffect(() => {
    document.title = activeRound
      ? `Round ${activeRound.number}, ${mapLabel} · Round Reviewer`
      : "Round Reviewer";
  }, [activeRound, mapLabel]);

  // Selection moves in the rail (FLIP, 180 ms) and the panel's new content fades in (140 ms),
  // so a moment switch reads as one change rather than a jump. Keyboard switches stay instant.
  const railKey = `${review ?? ""}|${activeMoment?.id ?? ""}|${roundId ?? ""}`;
  useLayoutEffect(() => {
    const animate = !viaKey.current && !loadingMatch;
    const scroller = document.querySelector(".rail-scroll");
    const ind = document.querySelector(".rail .rail-ind");
    if (ind && scroller) {
      const box = scroller.getBoundingClientRect();
      const r = ind.getBoundingClientRect();
      const prev = railPrev.current;
      if (prev && animate) {
        const first = new DOMRect(
          prev.left - scroller.scrollLeft + box.left,
          prev.top - scroller.scrollTop + box.top,
          prev.w,
          prev.h,
        );
        flipFrom(ind, first, { duration: 180 });
      }
      railPrev.current = {
        top: r.top - box.top + scroller.scrollTop,
        left: r.left - box.left + scroller.scrollLeft,
        w: r.width,
        h: r.height,
      };
    } else railPrev.current = null;
    if (animate) fadeIn(insightRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railKey]);



  // ---- Panel content ----

  const headFinding =
    selectedFinding ??
    (activeMoment && !selectedEventId ? leadFinding(activeMoment, findingsById) : undefined);
  const headT = headFinding?.t ?? selected?.t;
  const panelLive = headT != null && clock.t >= headT && clock.t - headT < LIVE_SEC;
  const momentFindings = activeMoment
    ? activeMoment.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => Boolean(f))
    : [];
  const nextMoment = activeMoment
    ? moments[moments.findIndex((m) => m.id === activeMoment.id) + 1]
    : moments.find((m) => roundNumber != null && m.round > roundNumber);
  const findingRows = (list: Finding[]) => (
    <ul className="find-list">
      {list.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            className={`find-row${headFinding?.id === f.id ? " linked" : ""}`}
            onClick={() => seekFinding(f)}
          >
            <i className={`g g-${kindGlyph(f.kind)}`} aria-hidden />
            <b>{findingLabel(f)}</b>
            <span className="ev-v">{formatClock(f.t)}</span>
            <p>{f.summary}</p>
          </button>
        </li>
      ))}
    </ul>
  );
  const killsThisRound = events.filter((e) => e.type === "kill").length;
  const hpById = new Map(players.map((p) => [p.id, p]));
  // What the coach will be given as context; shown so the viewer knows what it can see.
  const knows = activeRound
    ? analysis
      ? `Knows ${analysedName}'s findings and stats, round ${activeRound.number} at ${formatClock(clock.t)}${
          activeMoment ? `, the picked moment` : ""
        } and the map notes. Answers cite what they use.`
      : `Knows round ${activeRound.number} at ${formatClock(clock.t)}, the radar view${
          selected ? `, the ${typeLabel(selected.type).toLowerCase()} at ${formatClock(selected.t)}` : ""
        }${focus ? ` and that you are following ${focus.name}` : ""}.`
    : "";
  const suggestions = activeRound
    ? analysis
      ? [
          headFinding
            ? kindGlyph(headFinding.kind) === "strength"
              ? `Why did this work for ${analysedName}?`
              : `Why is ${findingLabel(headFinding).toLowerCase()} a problem here?`
            : `What was ${analysedName}'s biggest mistake in round ${activeRound.number}?`,
          headFinding
            ? `What should ${analysedName} have done instead?`
            : `What did ${analysedName} do well in round ${activeRound.number}?`,
          `What happened in the seconds before this?`,
        ]
      : [
          `Why did ${activeRound.winner ?? "this side"} win round ${activeRound.number}?`,
          selected?.type === "kill" && lookup(selected.victimId)
            ? `Could ${lookup(selected.victimId)!.name} have avoided that death?`
            : `What should ${focus?.name ?? "I"} have done differently here?`,
          `Where was ${focus ? `${focus.name}'s` : "my"} team out of position?`,
        ]
    : [];
  const coachCites = {
    onHighlightFinding: setHighlightedFinding,
    onFinding: (id: string) => {
      const f = findingsById.get(id);
      if (f) seekFinding(f);
    },
    onSeek: (t: number) => {
      clock.pause();
      seekTo(t);
    },
    onMoment: (id: string) => {
      const m = moments.find((x) => x.id === id);
      if (m) selectMoment(m);
    },
    momentLabel: (id: string) => {
      const m = moments.find((x) => x.id === id);
      return m ? `round ${m.round} moment` : undefined;
    },
  };
  const teams = (["CT", "T"] as const).map((side) => ({
    side,
    players: roster.filter((p) => p.team === side),
  }));


  // ---- Review overview (design plan item 2): numbers only from RoundStats ----
  const statRows = analysis ? [...analysis.stats].sort((a, b) => a.round - b.round) : [];
  const wonByRound = new Map(statRows.filter((r) => r.won != null).map((r) => [r.round, Boolean(r.won)]));
  const roundsWon = [...wonByRound.values()].filter(Boolean).length;
  const roundsLost = wonByRound.size - roundsWon;
  const kills = statRows.reduce((n, r) => n + r.kills, 0);
  const deaths = statRows.reduce((n, r) => n + r.deaths, 0);
  const damage = statRows.reduce((n, r) => n + r.damage, 0);
  const overviewFacts = [
    wonByRound.size
      ? `${roundsWon === roundsLost ? "Drew" : roundsWon > roundsLost ? "Won" : "Lost"} ${roundsWon} to ${roundsLost}`
      : null,
    match?.when ?? null,
    statRows[0]?.side ? `Started ${statRows[0].side}` : null,
    statRows.length ? `K/D ${kills}/${deaths}` : null,
    statRows.length ? `ADR ${Math.round(damage / statRows.length)}` : null,
  ].filter((f): f is string => Boolean(f));
  const momentTitle = (m: SelectedMoment) => {
    const f = leadFinding(m, findingsById);
    return `${f ? findingLabel(f) : kindLabel(m.kind)}${f?.zone ? ` in ${f.zone}` : ""}`;
  };
  const momentIdx = activeMoment ? moments.findIndex((m) => m.id === activeMoment.id) : -1;
  const unreviewedRound = rounds.find((r) => !momentRounds.has(r.number));

  const alive = useMemo(() => aliveSteps(replay?.samples ?? [],lookup), [replay,lookup]);
  const subject = players.find((p) => p.id === focus?.id);
  const eventInMoment = activeMoment && events.find((e) => e.type === "kill" && e.t >= activeMoment.t0 && e.t <= activeMoment.t1 &&
    (lookup(e.actorId)?.id === focus?.id || lookup(e.victimId)?.id === focus?.id));
  const participants = new Set(momentFindings.flatMap((f) => f.otherIds.map((id) => lookup(id)?.id ?? id)));
  for (const id of [eventInMoment?.actorId,eventInMoment?.victimId]) {
    const player = lookup(id);
    if (player) participants.add(player.id);
  }
  const eventOpponent = eventInMoment && [eventInMoment.actorId, eventInMoment.victimId]
    .map((id) => lookup(id)).find((p) => p && p.id !== focus?.id && p.team !== focus?.team);
  const opponentId = eventOpponent?.id ?? [...participants].find((id) => lookup(id)?.team !== focus?.team);
  const killFeed = events.filter((e) => e.type === "kill" && e.t <= clock.t && clock.t-e.t < 5).slice(-2);
  const band =
    activeMoment && !review && momentIdx >= 0
      ? {
          t0: activeMoment.t0,
          t1: activeMoment.t1,
          label: momentTitle(activeMoment),
          glyph: kindGlyph(activeMoment.kind),
          n: momentIdx + 1,
        }
      : null;
  // What the ask bar says it is looking at: one line of context instead of a greeting.
  const askContext = activeRound
    ? [
        `R${activeRound.number}`,
        formatClock(clock.t),
        ...(band ? [band.label] : selected ? [typeLabel(selected.type)] : []),
        stageMode === "gameplay" ? "Gameplay" : "Radar",
      ]
    : [];
  // Scorebug: rounds from the coached player's side when stats exist, else the match's own score.
  const scoreParts = String(match?.score ?? "").match(/(\d+)\s*[–-]\s*(\d+)/);
  const personalScore = playerRoundScore(statRows);
  const rating = matchRating(statRows);
  const goodCount = moments.filter((m) => m.kind === "good").length;
  const sbScore = personalScore
    ? { us: personalScore[0], them: personalScore[1], text: personalScore.join("–") }
    : { us: scoreParts?.[1] ?? "–", them: scoreParts?.[2] ?? "–", text: String(match?.score ?? "") };

  if (loadingMatch) return <main id="content" className="studio studio-loading">
    <LoadingState label="Loading review moments…" /><LoadingState shape="stage" label="Loading the replay…" />
    <LoadingState label="Loading coach analysis…" />
  </main>;
  if (!match && isNotFound(loadError)) return <NotFound title="This match isn’t here" detail="It may have been deleted, or the link is wrong." />;
  if (!match || !rounds.length) {
    const failed = match?.status === "failed";
    const processing = match && !failed && !REPLAY_READY_STATUSES.has(match.status);
    return <main id="content" className="main state-page"><section className="sheet state-sheet">
      <h1>{!match ? "Unable to load this review" : failed ? "This demo could not be processed" : processing ? "This demo is still processing" : "No replay for this demo"}</h1>
      <p>{!match ? "Check the connection and try loading the review again." : failed ? "Open the processing log to see what happened." : processing ? "Open processing to check the demo and player setup." : "Choose another match to watch its rounds."}</p>
      {!match ? <button className="btn btn-fill" onClick={() => setMatchAttempt((n) => n + 1)}>Try again</button> :
        <Link className="btn btn-fill" href={processing || failed ? "/processing/" + matchId : "/matches"}>{processing || failed ? "View processing" : "View matches"}</Link>}
    </section></main>;
  }
  return (
    <main id="content" className={`studio${panelOn ? "" : " panel-off"}`}>
      <h1 className="sr-only">
        {match ? `${mapLabel} review${analysedName ? ` for ${analysedName}` : ""}` : "Match review"}
      </h1>
      {barSlot && match
        ? createPortal(
            <div className="sb" aria-label={`${mapLabel}, ${scorePhrase(sbScore.text)}`}>
              <span className="sb-map">{mapLabel}</span>
              <span className="sb-score" aria-hidden>
                <b>{sbScore.us}</b>
                <i>–</i>
                <b className="them">{sbScore.them}</b>
              </span>
              {rounds.length ? (
                <ol className="sb-rounds" aria-label="Rounds">
                  {rounds.map((r, i) => {
                    const result = r.winner === "T" ? "terrorists won" : r.winner === "CT" ? "counter-terrorists won" : "result unavailable";
                    const previousSide = statRows.find((s) => s.round === rounds[i - 1]?.number)?.side;
                    const currentSide = statRows.find((s) => s.round === r.number)?.side;
                    return (
                      <li key={r.id} className={previousSide && currentSide && currentSide !== previousSide ? "half" : undefined}>
                        <button
                          type="button"
                          className="sb-cell"
                          data-side={r.winner}
                          aria-current={r.id === roundId ? "true" : undefined}
                          aria-label={`Round ${r.number}, ${result}`}
                          title={`Round ${r.number}, ${result}`}
                          onClick={() => selectRound(r.id)}
                        >
                          <span className="sb-box" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </div>,
            barSlot,
          )
        : null}

      <aside className="rail glass" aria-label={moments.length ? "Review path" : "Rounds in this match"}>
        <div className="rail-h">
          <b>{moments.length ? `${moments.length} ${moments.length === 1 ? "moment" : "moments"}` : "Rounds"}</b>
          {moments.length ? (
            <span>
              {seenMoments.size} seen
            </span>
          ) : rounds.length ? (
            <span>
              {seen.size} of {rounds.length} seen
            </span>
          ) : null}
        </div>
        {rating && moments.length ? (
          <div
            className="rail-score"
            title={`HLTV 2.0-style rating from this match (1.00 is average): ${rating.kpr.toFixed(2)} kills and ${rating.dpr.toFixed(2)} deaths per round, ${Math.round(rating.adr)} damage per round, KAST ${Math.round(rating.kast)}%`}
          >
            <b>{rating.rating.toFixed(2)}</b> rating, {goodCount} good, {moments.length - goodCount} to fix
          </div>
        ) : null}
          <div className="rail-scroll">
            {moments.length ? (
              <ol className="moments" aria-label={`Moments for ${analysedName}`}>
                {moments.map((m, i) => {
                  const current = m.id === activeMoment?.id && !review;
                  const lead = leadFinding(m, findingsById);
                  const title = lead ? findingLabel(lead) : kindLabel(m.kind);
                  const reason = pickedBecause(m);
                  const done = seenMoments.has(m.id) && !current;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        className={`mom k-${kindGlyph(m.kind)}${done ? " is-seen" : ""}`}
                        aria-current={current ? "true" : "false"}
                        aria-label={`Moment ${i + 1}, ${kindLabel(m.kind)}: ${title}. Round ${m.round}, ${formatClock(lead?.t ?? m.t0)}. ${reason}${done ? ". Seen" : ""}`}
                        onClick={() => selectMoment(m)}
                        data-moment={m.id}
                      >
                        {current && <span className="rail-ind" aria-hidden />}
                        {current && mapMeta?.radarImage && subject && <svg className="moment-thumb" aria-hidden="true"
                          viewBox={`${subject.rx-74} ${subject.ry-74} 148 148`}>
                          <image href={mapMeta.radarImage} width={radarSize} height={radarSize}/>
                          <circle cx={subject.rx} cy={subject.ry} r="12" fill={focus?.team === "CT" ? "var(--side-ct)" : "var(--side-t)"} stroke="var(--stage-you)" strokeWidth="4"/>
                        </svg>}
                        <span className="mom-n">{String(i+1).padStart(2,"0")}</span>
                        <i className={`g g-${kindGlyph(m.kind)}`} aria-hidden />
                        <span className="mom-title">{title}</span>
                        {current && <span className="mom-meta">
                          Round {m.round} at {formatClock(lead?.t ?? m.t0)}{lead?.zone ? `, ${lead.zone}` : ""}
                          {povReady.has(m.id) && <span className="mom-clip">Clip ready</span>}
                        </span>}
                        {current && reason && <span className="mom-reason">{reason.charAt(0).toUpperCase() + reason.slice(1)}</span>}
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    className="mom mom-cap"
                    aria-current={review === "wrapup" ? "true" : "false"}
                    onClick={() => setReview("wrapup")}
                  >
                    {review === "wrapup" ? <span className="rail-ind" aria-hidden /> : null}
                    <span className="mom-n" aria-hidden>
                      <i className="g g-round" />
                    </span>
                    <span className="mom-title">Debrief</span>
                    <span className="mom-meta">
                      <span className="when">What to practise next</span>
                    </span>
                  </button>
                </li>
              </ol>
            ) : null}
            <details className="round-picker" key={moments.length ? "moments" : "rounds"} open={moments.length ? undefined : true}>
              <summary>All rounds</summary>
              {moments.length > 0 && <button className="brief-link" onClick={() => setReview("overview")}>Match brief</button>}
            <ol className={`moments${moments.length ? " secondary" : ""}`} aria-label="All rounds">
              {rounds.map((r) => {
                const current = r.id === roundId && !activeMoment && !review;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={`mom${seen.has(r.id) && !current ? " is-seen" : ""}`}
                      aria-current={current ? "true" : "false"}
                      aria-label={`Round ${r.number}. ${r.winner ?? "No"} win, ${reasonLabel(r.reason)}.`}
                      onClick={() => selectRound(r.id)}
                      data-round={r.id}
                    >
                      {current ? <span className="rail-ind" aria-hidden /> : null}
                      <span className="mom-n" aria-hidden>
                        {String(r.number).padStart(2, "0")}
                      </span>
                      <span className="mom-title">
                        {r.winner ? `${r.winner} win` : "No result"}
                      </span>
                      <span className="mom-meta">
                        <span className="when">
                          {reasonLabel(r.reason)}, {Math.round(r.durationSec)} s
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            </details>
          </div>
      </aside>

      <section className="work" aria-label="Replay">
        {replay && <TeamHud roster={roster} players={players} round={replay.roundNumber} rounds={rounds} stats={analysis?.stats} selectedId={analysis?.playerId ?? focusId ?? undefined} />}
        <div className="stage-wrap">
          <div className="stage" ref={setStage}>
            {replay ? (
              <>
                <div
                  className={`surface${stageMode === "gameplay" && !povMain ? " is-main" : " is-hidden"}`}
                  data-mode="gameplay"
                  hidden={stageMode !== "gameplay" || povMain}
                >
                  <GameplayView
                    src={mediaFailed ? null : gameplaySrc}
                    onMediaError={() => { clock.pause(); setMediaError(gameplaySrc); }}
                    active={stageMode === "gameplay"}
                    disabledReason={mediaFailed ? "This clip could not be played. The radar shows the same moment." : gameplayDisabledReason}
                    onRetry={mediaFailed ? () => setMediaError(null) : recorder !== "off" && povClip?.status === "failed" ? () => retryPov(povClip.id) : undefined}
                    onBind={clock.bindVideo}
                    onRadar={() => { setMode("radar"); document.querySelector<HTMLButtonElement>('.seg button[data-mode="radar"]')?.focus(); }}
                  />
                </div>
                <div
                  className={`surface${stageMode === "radar" ? " is-main" : povMain ? " is-inset" : " is-hidden"}`}
                  data-mode="radar"
                  hidden={stageMode !== "radar" && !povMain}
                  onClick={povMain ? () => setMode("radar") : undefined}
                  title={povMain ? "Show the radar large (V)" : undefined}
                >
                  {hasRadar ? (
                    <>
                      <RadarView
                        mapName={replay.map}
                        t={clock.t}
                        players={players}
                        lookup={lookup}
                        focus={focus}
                        tracks={tracks}
                        utility={utility}
                        viewBox={viewBox}
                        pxPerUnit={pxPerUnit}
                        moment={activeMoment && !review ? activeMoment : null}
                        instantRef={viaKey}
                        selectedId={analysis?.playerId ?? focusId ?? undefined}
                        participants={[...participants]}
                        opponentId={opponentId}
                        lens={lens && !whole && stageMode === "radar"}
                        highlighted={!!highlightedFinding && momentFindings.some((f) => f.id === highlightedFinding)}
                        shot={!!eventOpponent && !!eventInMoment && clock.t >= eventInMoment.t && clock.t-eventInMoment.t < 1}
                      />
                      <button
                        type="button"
                        className="zoom"
                        aria-pressed={whole}
                        onClick={() => {
                          animateCam.current = true;
                          setWhole((w) => !w);
                        }}
                      >
                        {whole ? "This round" : "Whole map"}
                      </button>
                    </>
                  ) : (
                    <div className="stage-msg">
                      <p>
                        Radar positions are not available for <strong>{mapLabel}</strong> yet.
                        Timeline playback still works. Overview metadata exists for Ancient and
                        Anubis.
                      </p>
                    </div>
                  )}
                </div>
                {povClip && povMain ? (
                  <PovClip
                    clip={povClip}
                    src={povSrc}
                    onMediaError={() => { clock.pause(); setMediaError(povSrc); }}
                    main={povMain}
                    playerName={analysedName}
                    t={clock.t}
                    playing={clock.playing}
                    rate={clock.rate}
                    onSeek={(t) => seekTo(t)}
                    onEnlarge={() => setMode("gameplay")}
                    onEnd={clock.pause}
                  />
                ) : null}
                {killFeed.length > 0 && stageMode === "radar" && <div className="kill-feed" aria-label="Recent eliminations">
                  {killFeed.map((e) => <span key={e.id} title={e.label}>
                    <b data-side={lookup(e.actorId)?.team}>{lookup(e.actorId)?.name ?? "Unknown"}</b>
                    <span>{e.label.match(/\(([^()]+)\)\s*$/)?.[1]?.replace(/^weapon_/, "").replaceAll("_", " ") || "eliminated"}</span>
                    <b data-side={lookup(e.victimId)?.team}>{lookup(e.victimId)?.name ?? "Unknown"}</b>
                  </span>)}
                </div>}
              </>
            ) : (
              <div className="stage-msg">
                {loadError ? <><p role="alert">The replay for this round could not be loaded.</p>
                  <button className="btn btn-line" onClick={() => setRoundAttempt((n) => n + 1)}>Retry round</button></>
                  : <LoadingState shape="stage" label="Loading round replay…" />}
              </div>
            )}
          </div>
        </div>

        {replay && <div className="dock">
          <div className="transport">
            <button
              type="button"
              className="play"
              aria-label={clock.playing ? "Pause" : "Play"}
              aria-keyshortcuts="Space"
              title={clock.playing ? "Pause (Space)" : "Play (Space)"}
              onClick={togglePlay}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
                {clock.playing ? (
                  <>
                    <rect x="2.5" y="1.5" width="3.2" height="11" fill="currentColor" />
                    <rect x="8.3" y="1.5" width="3.2" height="11" fill="currentColor" />
                  </>
                ) : (
                  <path d="M3 1.5v11l9.5-5.5z" fill="currentColor" />
                )}
              </svg>
            </button>
            <button
              type="button"
              className="step"
              aria-label="Previous event"
              title="Previous event (,)"
              onClick={() => stepEvent(-1)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M4 3.5v9M12 4 7 8l5 4z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="step"
              aria-label="Next event"
              title="Next event (.)"
              onClick={() => stepEvent(1)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M12 3.5v9M4 4l5 4-5 4z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="clock">
              <b>{formatClock(clock.t)}</b>
              <span>of {formatClock(clock.duration).split(".")[0]}</span>
            </div>
            <span className="transport-space" />
            <div
              className="seg"
              role="group"
              aria-label="View"
              title="Switch view (V)"
            >
              <PillBubble value={stageMode} />
              <button
                type="button"
                data-mode="radar"
                aria-pressed={stageMode === "radar"}
                title="Radar (V)"
                onClick={() => setMode("radar")}
              >
                Radar
              </button>
              <button
                type="button"
                data-mode="gameplay"
                aria-pressed={stageMode === "gameplay"}
                title={gameplayReady ? "Gameplay (V)" : (gameplayDisabledReason ?? "Gameplay unavailable")}
                onClick={() => setMode("gameplay")}
              >
                Clip
              </button>
            </div>
            {clipManifest && recorder !== "off" && clipManifest.clips.some((c) => c.status === "queued" || c.status === "recording") ? (
              <span className="clip-progress" title="Gameplay clip recording">
                Clips {clipManifest.done}/{clipManifest.total}
              </span>
            ) : null}
            <button
              type="button"
              className="t-opt"
              aria-label={`Playback speed, ${clock.rate} times`}
              title="Playback speed"
              onClick={() => clock.setRate(RATES[(RATES.indexOf(clock.rate) + 1) % RATES.length])}
            >
              {clock.rate}×
            </button>
            <button
              type="button"
              className="icon-btn fs-btn"
              aria-label="Fullscreen"
              title="Fullscreen"
              onClick={toggleFullscreen}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="btn btn-line ctx-toggle"
              aria-expanded={ctxOpen}
              aria-controls="ctx"
              onClick={() => setCtxOpen((o) => !o)}
            >
              Coach
            </button>
            {!panelOn ? (
              <button
                type="button"
                className="icon-btn panel-show"
                aria-label="Show the analysis"
                title="Show the analysis"
                onClick={() => setPanelOn(true)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M7.8 6.2L6 8l1.8 1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : null}
          </div>

          {replay ? (
            <div>
              <ReplayTimeline
                duration={replay.durationSec}
                t={clock.t}
                marks={marks}
                alive={alive}
                band={band}
                selectedEventId={highlightedFinding ?? selectedEventId}
                onSeek={(t, id) => { if (id) clock.pause(); seekTo(t,id); }}
                onScrub={(active) => {
                  if (active) {
                    wasPlaying.current = clock.playing;
                    clock.pause();
                  } else if (wasPlaying.current) clock.play();
                }}
              />
            </div>
          ) : null}
        </div>}
      </section>

      <aside
        className={`ctx sheet${ctxOpen ? " open" : ""}${asking && !extraTab ? " asking" : ""}${extraTab ? " extra" : ""}`}
        id="ctx"
        aria-label="Analysis of this round"
      >
        {/* Phone only: the sheet's grab handle. Tap or drag up to open, drag down to close (U15). */}
        <button
          type="button"
          className="sheet-grab"
          aria-expanded={ctxOpen}
          aria-controls="ctx"
          aria-label={ctxOpen ? "Close the analysis" : "Open the analysis"}
          onPointerDown={(e) => {
            const sheet = e.currentTarget.parentElement;
            if (!sheet) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const h = sheet.getBoundingClientRect().height;
            const peek = parseFloat(getComputedStyle(sheet).getPropertyValue("--peek")) || 132;
            grab.current = { y: e.clientY, t: performance.now(), base: ctxOpen ? 0 : h - peek, max: h - peek, dy: 0 };
            grabDragged.current = false;
          }}
          onPointerMove={(e) => {
            const g = grab.current;
            const sheet = e.currentTarget.parentElement;
            if (!g || !sheet) return;
            g.dy = e.clientY - g.y;
            if (!grabDragged.current && Math.abs(g.dy) < 4) return;
            grabDragged.current = true;
            // The sheet follows the finger; past either end it resists instead of stopping dead
            let y = g.base + g.dy;
            if (y < 0) y = -Math.sqrt(-y) * 2;
            if (y > g.max) y = g.max + Math.sqrt(y - g.max) * 2;
            sheet.style.transition = "none";
            sheet.style.transform = `translateY(${y}px)`;
          }}
          onPointerUp={(e) => {
            const g = grab.current;
            const sheet = e.currentTarget.parentElement;
            grab.current = null;
            if (!g || !sheet || !grabDragged.current) return;
            // A flick decides by velocity; a slow drag by where it was let go
            const v = g.dy / Math.max(1, performance.now() - g.t);
            const open = Math.abs(v) > 0.11 ? v < 0 : g.base + g.dy < g.max / 2;
            sheet.style.transition = "";
            sheet.style.transform = "";
            setCtxOpen(open);
          }}
          onPointerCancel={(e) => {
            grab.current = null;
            const sheet = e.currentTarget.parentElement;
            if (sheet) {
              sheet.style.transition = "";
              sheet.style.transform = "";
            }
          }}
          onClick={() => {
            // A drag already decided; a tap or the keyboard toggles.
            if (grabDragged.current) grabDragged.current = false;
            else setCtxOpen((o) => !o);
          }}
        >
          <span aria-hidden />
        </button>
        <div className={`p-head${panelLive && !review ? " live" : ""}`}>
          {review ? null : headFinding ? (
            <i className={`g g-${kindGlyph(headFinding.kind)}`} aria-hidden />
          ) : selected ? (
            <i className={`d d-${glyphForEvent(selected.type)}`} aria-hidden />
          ) : null}
          <span className="lab">
            {review === "overview"
              ? "Match overview"
              : review === "wrapup"
                ? "Wrap-up"
                : headFinding
              ? findingLabel(headFinding)
              : selected
                ? typeLabel(selected.type)
                : activeRound
                  ? `Round ${activeRound.number}`
                  : "Round"}
          </span>
          {/* A finding's time is on its row and the timeline; its label needs the room here. */}
          {headFinding || review ? null : (
            <span>
              {activeRound ? `R${activeRound.number} ` : ""}
              {formatClock(headT ?? clock.t)}
            </span>
          )}
          <span className="sp" />
          <div className="ctx-tabs" role="tablist" aria-label="Panel" onKeyDown={(event) => {
            const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
            const index = tabs.indexOf(event.target as HTMLButtonElement);
            if (index < 0) return;
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
              event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : -1;
            if (next < 0) return;
            event.preventDefault();
            event.stopPropagation();
            tabs[next].click();
            tabs[next].focus();
          }}>
            <PillBubble value={extraTab ?? (asking ? "ask" : "analysis")} />
            <button
              type="button"
              role="tab"
              id="tab-insight"
              tabIndex={!asking && !extraTab ? 0 : -1}
              aria-selected={!asking && !extraTab}
              aria-controls="insight"
              onClick={() => {
                setAsking(false);
                setExtraTab(null);
              }}
            >
              Analysis
            </button>
            <button
              type="button"
              role="tab"
              id="tab-ask"
              tabIndex={asking && !extraTab ? 0 : -1}
              aria-selected={asking && !extraTab}
              aria-controls="coach"
              onClick={() => {
                setAsking(true);
                setExtraTab(null);
              }}
            >
              Ask
            </button>
            <button
              type="button"
              role="tab"
              id="tab-round"
              tabIndex={extraTab === "round" ? 0 : -1}
              aria-selected={extraTab === "round"}
              aria-controls="round-tab"
              onClick={() => setExtraTab("round")}
            >
              Round
            </button>
            <button
              type="button"
              role="tab"
              id="tab-notes"
              tabIndex={extraTab === "notes" ? 0 : -1}
              aria-selected={extraTab === "notes"}
              aria-controls="notes-tab"
              onClick={() => setExtraTab("notes")}
            >
              Notes
            </button>
          </div>
          <button
            type="button"
            className="icon-btn p-collapse"
            aria-label="Hide the details panel"
            title="Hide panel"
            onClick={() => setPanelOn(false)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.6" />
              <path d="M6 6.2L7.8 8 6 9.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {ctxOpen ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Close details"
              onClick={() => setCtxOpen(false)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        <ModelNotice />
        <div className="insight" id="insight" role="tabpanel" aria-labelledby="tab-insight" ref={insightRef}
          data-review={review ?? undefined}
        >
          {review === "overview" && analysis ? (
            <ReviewOverview
              matchId={matchId}
              playerId={analysis.playerId}
              language={coachLang}
              onLanguage={setCoachLang}
              heading={`${analysedName} on ${mapLabel}`}
              facts={overviewFacts}
              strip={
                <RoundStrip
                  rounds={rounds}
                  won={wonByRound}
                  moments={momentRounds}
                  currentRoundId={null}
                  onSelect={selectRound}
                />
              }
              start={
                moments[0] ? (
                  <button type="button" className="btn btn-fill btn-wrap" onClick={() => selectMoment(moments[0])}>
                    Review moment 1: {momentTitle(moments[0])}
                  </button>
                ) : null
              }
              {...coachCites}
            />
          ) : review === "wrapup" && analysis ? (
            <ReviewWrapUpPanel
              matchId={matchId}
              playerId={analysis.playerId}
              language={coachLang}
              onLanguage={setCoachLang}
              total={moments.length}
              seen={seenMoments.size}
              actions={
                <>
                  <button type="button" className="btn btn-line" onClick={() => setReview("overview")}>
                    Back to the overview
                  </button>
                  {unreviewedRound ? (
                    <button type="button" className="btn btn-line" onClick={() => selectRound(unreviewedRound.id)}>
                      Analyse round {unreviewedRound.number}
                    </button>
                  ) : null}
                </>
              }
              {...coachCites}
            />
          ) : (
          <>
          {headFinding && <p className="ins-meta">
            <i className={`g g-${kindGlyph(headFinding.kind)}`} aria-hidden />
            {kindLabel(headFinding.kind)}{activeMoment && momentIdx >= 0 ? `, moment ${momentIdx + 1} of ${moments.length}` : ""}
          </p>}
          <h2 className="ins-head">{headFinding ? findingLabel(headFinding) : selected ? eventTitle(selected,lookup) : activeRound ? `Round ${activeRound.number}` : "Pick a round"}</h2>
          {analysis && !moments.length && <p>No coaching moments were selected. Choose a round to review its replay.</p>}
          {analysisFailed && <div><p role="alert">The player analysis could not be loaded. The radar is available.</p>
            <button className="btn btn-line" onClick={() => setMatchAttempt((n) => n + 1)}>Reload analysis</button></div>}
          {!analysis && !analysisFailed && !match.selectedPlayerId && <Link className="btn btn-line" href={"/processing/" + matchId}>Set up this review</Link>}
          {analysis && activeRound ? (
            <CoachExplanation
              key={activeMoment?.id ?? activeRound.id}
              onSeen={markMomentSeen}
              matchId={matchId}
              playerId={analysis.playerId}
              evidence={headFinding && <EvidenceTiles finding={headFinding} related={momentFindings} highlightedId={highlightedFinding ?? selectedEventId} onSeek={seekFinding} />}
              momentId={activeMoment?.id ?? null}
              round={activeRound.number}
              language={coachLang}
              onLanguage={setCoachLang}
              {...coachCites}
            />
          ) : null}

          {activeMoment && momentIdx >= 0 ? (
            <div className="moment-step">
              {nextMoment ? (
                <button
                  type="button"
                  className="next-btn"
                  aria-keyshortcuts="N"
                  onClick={() => selectMoment(nextMoment)}
                >
                  <span className="next-k">Next</span>
                  <b>{String(momentIdx + 2).padStart(2, "0")}</b>
                  <i className={`g g-${kindGlyph(nextMoment.kind)}`} aria-hidden />
                  <span className="next-t">{momentTitle(nextMoment)}</span>
                  <kbd aria-hidden>N</kbd>
                </button>
              ) : (
                <button
                  type="button"
                  className="next-btn is-last"
                  aria-keyshortcuts="N"
                  onClick={() => setReview("wrapup")}
                >
                  <span className="next-k">Done</span>
                  <span className="next-t">Open the debrief</span>
                  <kbd aria-hidden>N</kbd>
                </button>
              )}
            </div>
          ) : null}

          <details className="analysis-details"><summary>Round stats and findings</summary>
          {analysis && headFinding ? (
            <DoneWell matchId={matchId} playerId={analysis.playerId} finding={headFinding} onFinding={coachCites.onFinding} />
          ) : null}

          {momentFindings.length > 1 ? (
            <section className="layer">
              <h3>In this moment</h3>
              {findingRows(momentFindings)}
            </section>
          ) : null}

          {roundStats && activeRound ? (
            <section className="layer">
              <h3>
                {analysedName} in round {activeRound.number}
                {roundStats.side ? `, ${roundStats.side} side` : ""}
                {roundStats.won != null ? (roundStats.won ? ", won" : ", lost") : ""}
              </h3>
              <dl className="stat-grid">
                <div>
                  <dt><abbr title="Kills">K</abbr></dt>
                  <dd>{roundStats.kills}</dd>
                </div>
                <div>
                  <dt><abbr title="Deaths">D</abbr></dt>
                  <dd>{roundStats.deaths}</dd>
                </div>
                <div>
                  <dt><abbr title="Assists">A</abbr></dt>
                  <dd>{roundStats.assists}</dd>
                </div>
                <div>
                  <dt><abbr title="Damage">DMG</abbr></dt>
                  <dd>{roundStats.damage}</dd>
                </div>
                <div>
                  <dt><abbr title="Utility thrown">UTIL</abbr></dt>
                  <dd>{roundStats.utilityThrown}</dd>
                </div>
                <div>
                  <dt><abbr title="Equipment">EQUIP</abbr></dt>
                  <dd>{roundStats.equipValue != null ? `$${roundStats.equipValue}` : "—"}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          {activeRound ? (
            <section className="layer">
              <h3>Round {activeRound.number}</h3>
              <dl className="facts">
                <dt>Winner</dt>
                <dd>{activeRound.winner ?? "—"}</dd>
                <dt>Result</dt>
                <dd>{reasonLabel(activeRound.reason)}</dd>
                <dt>Length</dt>
                <dd>{formatClock(activeRound.durationSec)}</dd>
                {replay ? (
                  <>
                    <dt>Kills</dt>
                    <dd>{killsThisRound}</dd>
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}

          {replay ? (
            <div className="more">
              {analysis ? (
                <details className="ev" open={roundFindings.length > 0}>
                  <summary>
                    Findings this round
                    <span className="aside">
                      {roundFindings.length} <Chev />
                    </span>
                  </summary>
                  {roundFindings.length ? (
                    findingRows(roundFindings)
                  ) : (
                    <p className="meta" style={{ margin: "4px 0 6px" }}>
                      Nothing found for {analysedName} in this round.
                    </p>
                  )}
                </details>
              ) : null}
              <details className="ev" open={!analysis}>
                <summary>
                  Events
                  <span className="aside">
                    {events.length} <Chev />
                  </span>
                </summary>
                <table>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <button
                            type="button"
                            className={`ev-row${selected?.id === e.id ? " linked" : ""}`}
                            onClick={() => {
                              clock.pause();
                              seekTo(e.t, e.id);
                            }}
                          >
                            <i className={`d d-${glyphForEvent(e.type)}`} aria-hidden />
                            <span className="ev-l">{eventTitle(e, lookup)}</span>
                            <span className="ev-v">{formatClock(e.t)}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
              <details className="ev">
                <summary>
                  Players
                  <span className="aside">
                    Following {focus?.name ?? "—"} <Chev />
                  </span>
                </summary>
                <table>
                  <tbody>
                    {teams.map(({ side, players: ps }) => (
                      <FragmentRows key={side} side={side}>
                        {ps.map((p) => {
                          const s = hpById.get(p.id);
                          const dead = s ? !s.alive : false;
                          return (
                            <tr key={p.id}>
                              <td>
                                <button
                                  type="button"
                                  className={`ev-row${p.id === focus?.id ? " linked" : ""}${dead ? " dead" : ""}`}
                                  aria-pressed={p.id === focus?.id}
                                  title="Follow on the radar"
                                  onClick={() => follow(p.id)}
                                >
                                  <i className={p.id === focus?.id ? "g g-ct" : "g g-none"} aria-hidden />
                                  <span className="ev-l">{p.name}</span>
                                  <span className="ev-v">{s ? (s.alive ? `${s.health} hp` : "dead") : ""}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </FragmentRows>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          ) : null}

          {activeMoment ? null : (
            <div className="next-row">
              {nextMoment ? (
                <button type="button" className="link" onClick={() => selectMoment(nextMoment)}>
                  Next moment: {momentTitle(nextMoment)}, round {nextMoment.round}
                </button>
              ) : nextRound ? (
                <button type="button" className="link" onClick={() => selectRound(nextRound.id)}>
                  Next round: Round {nextRound.number}
                </button>
              ) : rounds.length ? (
                <span style={{ color: "var(--text-3)", fontSize: 13 }}>
                  That was the last of the {rounds.length} rounds.
                </span>
              ) : null}
            </div>
          )}

          {debug && replay ? (
            <pre className="debug-block">
              {JSON.stringify(
                {
                  roundId: replay.roundId,
                  map: replay.map,
                  hasRadar,
                  samples: replay.samples.length,
                  events: replay.events.length,
                  t: clock.t,
                  players: players.length,
                  viewBox,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
          </details>
          </>
          )}
        </div>

        {extraTab === "round" ? (
          activeRound ? (
            <RoundPanel
              roundNumber={activeRound.number}
              events={events}
              stats={roundStats}
              findings={roundFindings}
              focusId={analysis?.playerId ?? focus?.id ?? null}
              focusName={analysis ? analysedName : (focus?.name ?? "the player")}
              lookup={lookup}
              onSeek={(t, eventId) => {
                clock.pause();
                seekTo(t, eventId);
              }}
            />
          ) : (
            <div className="round-tab" role="tabpanel" id="round-tab" aria-labelledby="tab-round">
              <p className="meta">Pick a round to see what happened in it.</p>
            </div>
          )
        ) : extraTab === "notes" ? (
          <NotesPanel
            matchId={matchId}
            playerId={analysis?.playerId ?? null}
            playerName={analysedName || "the player"}
            round={activeRound?.number ?? 1}
            t={clock.t}
            language={coachLang}
            onOpen={openAt}
            {...coachCites}
          />
        ) : null}

        {activeRound ? (
          <CoachPanel
            key={activeRound.id}
            matchId={matchId}
            playerId={analysis?.playerId ?? null}
            round={activeRound.number}
            momentId={activeMoment?.id ?? null}
            language={coachLang}
            t={clock.t}
            knows={knows}
            context={askContext}
            suggestions={suggestions}
            inputRef={askRef}
            placeholder={
              review
                ? "What should I practise from this match?"
                : band
                  ? "Ask about this moment"
                  : `What decided round ${activeRound.number}?`
            }
            onAsk={() => {
              setAsking(true);
              setExtraTab(null);
            }}
            {...coachCites}
          />
        ) : null}
      </aside>
    </main>
  );
}

function FragmentRows({ side, children }: { side: string; children: ReactNode }) {
  return (
    <>
      <tr>
        <td className="ev-team" style={{ borderTop: 0 }}>
          {side}
        </td>
      </tr>
      {children}
    </>
  );
}
