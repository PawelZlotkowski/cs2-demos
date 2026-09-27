"use client";

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
  LANE_ORDER,
  eventTitle,
  glyphForEvent,
  laneMarks,
  makeRosterLookup,
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
  splitCitations,
} from "@/lib/coach/findings";
import { RadarView } from "@/components/replay/RadarView";
import { ReplayTimeline } from "@/components/replay/ReplayTimeline";
import { CoachExplanation } from "@/components/coach/CoachExplanation";
import { CoachPanel } from "@/components/coach/CoachPanel";
import { NotFound, isNotFound } from "@/components/NotFound";
import { RoundStrip } from "@/components/review/RoundStrip";
import { ReviewOverview, ReviewWrapUpPanel } from "@/components/review/ReviewPanels";
import { useCoachLanguage } from "@/lib/coach/language";

const RATES: PlaybackRate[] = [1, 2, 4, 0.5];
const LANE_BASE = 22;
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

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
  const [debug, setDebug] = useState(false);

  const [match, setMatch] = useState<Match | null>(null);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [replay, setReplay] = useState<RoundReplay | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [panelOn, setPanelOn] = useState(true);
  const [ctxOpen, setCtxOpen] = useState(false);
  const grabY = useRef<number | null>(null);
  const grabDragged = useRef(false);
  const [whole, setWhole] = useState(false);
  const [asking, setAsking] = useState(false);
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
    setLoadError(null);
    setRounds([]);
    setRoundId(null);
    setReplay(null);
    setSeen(new Set());
    setAnalysis(null);
    setMomentId(null);
    setReview(null);
    setSeenMoments(new Set());
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
            const [moments, findings, stats] = await Promise.all([
              api.getPlayerMoments(matchId, pid),
              api.getFindings(matchId, pid),
              api.getRoundStats(matchId, pid),
            ]);
            view = { playerId: pid, moments, findings, stats };
          } catch {
            view = null; // no analysis stored: the replay still works
          }
        }
        if (cancelled) return;
        setMatch(m);
        setRounds(rs);
        setAnalysis(view);
        if (pid) setFocusId(pid);
        // Deep link (?m=m3&t=41.5) opens that moment; otherwise the overview, with moment 1 behind it.
        const q = new URLSearchParams(window.location.search);
        const linked = view?.moments.find((x) => x.id === q.get("m"));
        const first = linked ?? view?.moments[0];
        const firstRound = first ? rs.find((r) => r.number === first.round) : undefined;
        const linkedT = Number(q.get("t"));
        if (first && firstRound) {
          pendingSeek.current = linked && Number.isFinite(linkedT) && q.get("t") ? linkedT : first.t0;
          setMomentId(first.id);
          setRoundId(firstRound.id);
          setReview(linked ? null : "overview");
        } else if (rs.length) setRoundId(rs[0].id);
        else if (!REPLAY_READY_STATUSES.has(m.status)) setLoadError("Match is still processing.");
        else setLoadError("No round replays for this match.");
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load.");
      } finally {
        if (!cancelled) setLoadingMatch(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  useEffect(() => {
    if (!roundId) return;
    let cancelled = false;
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
        setSelectedEventId(null);
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
  }, [matchId, roundId]);

  // Poll clip manifest so Gameplay enables as rounds finish recording
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const man = await api.getClips(matchId);
        if (cancelled) return;
        setClipManifest(man);
        const pending = man.clips.some(
          (c) => c.status === "queued" || c.status === "recording",
        );
        if (pending) timer = setTimeout(poll, 2000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [matchId]);

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
        if (list.some((c) => c.status === "queued" || c.status === "recording")) timer = setTimeout(poll, 3000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 6000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [matchId, analysedPlayer, roundId, povPoll]);

  // ---- Derived replay state ----

  const roster = useMemo<ReplayPlayer[]>(
    () => replay?.players ?? match?.players ?? [],
    [replay, match],
  );
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
  const roundNumber = replay?.roundNumber ?? null;
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
      void api
        .retryPlayerClip(matchId, analysedPlayer, clipId)
        .catch(() => undefined)
        .finally(() => setPovPoll((n) => n + 1));
    },
    [matchId, analysedPlayer],
  );
  const roundStats = analysis?.stats.find((r) => r.round === roundNumber);

  useEffect(() => {
    if (momentId && !review) setSeenMoments((s) => (s.has(momentId) ? s : new Set(s).add(momentId)));
  }, [momentId, review]);

  // Keep ?m=&t= in the address so a moment can be sent to a teammate (design plan item 3).
  const pausedAt = clock.playing ? null : Math.round(clock.t * 10) / 10;
  useEffect(() => {
    if (loadingMatch) return;
    const url = new URL(window.location.href);
    const inMoment = Boolean(momentId && !review && activeMoment);
    if (inMoment) url.searchParams.set("m", momentId!);
    else url.searchParams.delete("m");
    if (inMoment && pausedAt != null && pausedAt > 0) url.searchParams.set("t", String(pausedAt));
    else url.searchParams.delete("t");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [loadingMatch, momentId, review, activeMoment, pausedAt]);

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
  const nowEvent = liveEvent && clock.t - liveEvent.t < LIVE_SEC ? liveEvent : null;
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
  const povMain = stageMode === "gameplay" && Boolean(povSrc);
  const gameplayDisabledReason = useMemo(() => {
    if (gameplayReady) return null;
    if (povClip?.status === "queued" || povClip?.status === "recording") return "Recording this moment's clip…";
    if (povClip?.status === "failed") return povClip.error ?? "Recording this moment's clip failed.";
    if (analysis && !povClip) return "No clip for this round. Pick a moment to watch its clip.";
    if (!activeClip) return "Gameplay clips are not available for this match yet.";
    if (activeClip.status === "queued" || activeClip.status === "recording") {
      const done = clipManifest?.done ?? 0;
      const total = clipManifest?.total ?? 0;
      return total
        ? `Recording gameplay… ${done} of ${total} clips ready.`
        : "Recording gameplay…";
    }
    if (activeClip.status === "failed") {
      return activeClip.error ?? "Gameplay recording failed for this round.";
    }
    if (activeClip.status === "skipped") {
      return activeClip.error ?? "Clips are off on this computer, so the radar is shown instead.";
    }
    return "Gameplay clip is not ready.";
  }, [activeClip, gameplayReady, clipManifest, povClip, analysis]);

  // Keep clock master in sync with stage mode
  useEffect(() => {
    // A moment clip follows the shared clock; only a whole-round clip drives it
    if (stageMode === "gameplay" && gameplayReady && !povSrc) {
      clock.setMaster("video");
    } else {
      clock.setMaster("raf");
      if (stageMode === "gameplay" && !gameplayReady) {
        setStageMode("radar");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageMode, gameplayReady, povSrc]);

  const setMode = useCallback(
    (mode: StageView) => {
      if (mode === "gameplay" && !gameplayReady) return;
      setStageMode(mode);
    },
    [gameplayReady],
  );

  // ---- Stage fitting (prototype fitStage): 16:9 stage, spare height to the lanes ----

  const workRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const [laneH, setLaneH] = useState(LANE_BASE);
  const [stageSize, setStageSize] = useState({ w: 640, h: 360 });
  // A fixed lane set for the whole match, so rows don't jump between rounds (U13).
  // The Coach lane appears once the coach has findings for this player.
  const hasCoach = (analysis?.findings.length ?? 0) > 0;
  const lanes = useMemo(() => LANE_ORDER.filter((l) => l !== "coach" || hasCoach), [hasCoach]);
  const laneCount = lanes.length;

  const fitStage = useCallback(() => {
    const work = workRef.current;
    const wrap = wrapRef.current;
    const stage = stageRef.current;
    if (!work || !wrap || !stage || document.fullscreenElement) return;
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    const tablet = window.matchMedia("(max-width: 1180px)").matches;
    const cs = getComputedStyle(wrap);
    const aw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const tlH = tlRef.current?.offsetHeight ?? 0;
    const baseTl = tlH - laneCount * (laneH - LANE_BASE);
    const used = (transportRef.current?.offsetHeight ?? 0) + baseTl + parseFloat(cs.paddingTop);
    let ah = work.clientHeight - used;
    if (mobile) ah = (aw * 9) / 16;
    let W = aw;
    let H = (W * 9) / 16;
    if (H > ah) {
      H = Math.max(160, ah);
      W = (H * 16) / 9;
    }
    stage.style.width = `${Math.floor(W)}px`;
    stage.style.height = `${Math.floor(H)}px`;
    const spare = ah - H;
    const maxLane = mobile ? 30 : tablet ? 56 : 34;
    const next = spare > 0 ? Math.min(maxLane, LANE_BASE + spare / (laneCount + 1)) : LANE_BASE;
    setLaneH((cur) => (Math.abs(cur - next) < 0.5 ? cur : next));
  }, [laneCount, laneH]);

  useLayoutEffect(() => {
    fitStage();
  }, [fitStage, replay, panelOn]);

  useEffect(() => {
    const work = workRef.current;
    const stage = stageRef.current;
    if (!work || !stage) return;
    const ro = new ResizeObserver(() => fitStage());
    ro.observe(work);
    const so = new ResizeObserver(() =>
      setStageSize((cur) =>
        cur.w === stage.clientWidth && cur.h === stage.clientHeight
          ? cur
          : { w: stage.clientWidth, h: stage.clientHeight },
      ),
    );
    so.observe(stage);
    const onFs = () => fitStage();
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      ro.disconnect();
      so.disconnect();
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [fitStage]);

  // ---- Radar camera: round area by default, whole map on toggle; 320ms viewBox tween ----

  const radarSize = mapMeta?.radarSize ?? 1024;
  const aspect = stageSize.w / Math.max(stageSize.h, 1);
  const target = useMemo<Box>(() => {
    const area = whole ? null : roundBounds(tracks);
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
    let raf = 0;
    const t0 = performance.now();
    const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / 320);
      const k = ease(u);
      const b = {
        x: from.x + (target.x - from.x) * k,
        y: from.y + (target.y - from.y) * k,
        w: from.w + (target.w - from.w) * k,
        h: from.h + (target.h - from.h) * k,
      };
      vbRef.current = b;
      setViewBox(b);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const pxPerUnit = Math.min(stageSize.w / viewBox.w, stageSize.h / viewBox.h);

  // ---- Actions ----

  const selectRound = useCallback(
    (id: string) => {
      animateCam.current = true;
      setReview(null);
      setMomentId(null);
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
        animateCam.current = true;
        pendingSeek.current = m.t0;
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
      if (target.id === roundId && replay) {
        seekTo(f.t, f.id);
      } else {
        animateCam.current = true;
        pendingSeek.current = f.t;
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
    if (!clock.playing && clock.t >= clock.duration) clock.seek(0);
    clock.toggle();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.code === "Space") {
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
        if (!panelOn) setPanelOn(true);
        setCtxOpen(true);
        window.setTimeout(() => askRef.current?.focus(), 0);
      } else if (e.key === "Escape" && ctxOpen) {
        setCtxOpen(false);
      } else if (e.key === "n" || e.key === "N") {
        // Next moment; after the last one, the wrap-up (design plan item 3)
        if (review === "overview" && moments[0]) selectMoment(moments[0]);
        else if (nextMoment) selectMoment(nextMoment);
        else if (activeMoment) setReview("wrapup");
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

  const empty = !loadingMatch && Boolean(loadError) && !replay && rounds.length === 0;

  // ---- Panel content ----

  const headFinding =
    selectedFinding ??
    (activeMoment && !selectedEventId ? leadFinding(activeMoment, findingsById) : undefined);
  const headT = headFinding?.t ?? selected?.t;
  const panelLive = headT != null && clock.t >= headT && clock.t - headT < LIVE_SEC;
  const momentRank = activeMoment
    ? [...moments].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).findIndex((m) => m.id === activeMoment.id) + 1
    : 0;
  const momentFindings = activeMoment
    ? activeMoment.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => Boolean(f))
    : [];
  const nextMoment = activeMoment
    ? moments[moments.findIndex((m) => m.id === activeMoment.id) + 1]
    : moments.find((m) => roundNumber != null && m.round > roundNumber);
  const cited = (text: string) =>
    splitCitations(text).map((part, i) =>
      "cite" in part ? (
        findingsById.get(part.cite) ? (
          <button
            key={i}
            type="button"
            className="cite"
            title={`Jump to ${part.cite}`}
            onClick={() => seekFinding(findingsById.get(part.cite)!)}
          >
            {part.cite}
          </button>
        ) : (
          <span key={i}>{part.cite}</span>
        )
      ) : (
        <span key={i}>{part.text}</span>
      ),
    );
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
          `Does this happen in other rounds too?`,
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

  if (!loadingMatch && !match && isNotFound(loadError)) {
    return <NotFound title="This match isn't here" detail="It may have been deleted, or the link is wrong." />;
  }
  return (
    <main className={`studio${panelOn ? "" : " panel-off"}`}>
      {barSlot && match
        ? createPortal(
            <>
              <b>{mapLabel}</b>, {scorePhrase(match.score)}, {match.when}
            </>,
            barSlot,
          )
        : null}

      <aside className="rail" aria-label={moments.length ? "Moments and rounds" : "Rounds in this match"}>
        <div className="rail-h">
          <b>
            {loadingMatch
              ? "Loading…"
              : moments.length
                ? `${moments.length} ${moments.length === 1 ? "moment" : "moments"}`
                : `${rounds.length} rounds`}
          </b>
          {moments.length ? (
            <span>
              {seenMoments.size} of {moments.length} seen
            </span>
          ) : rounds.length ? (
            <span>
              {seen.size} of {rounds.length} seen
            </span>
          ) : null}
        </div>
        {loadingMatch ? null : rounds.length === 0 ? (
          <p className="rail-empty">
            {loadError ?? "No rounds yet. Upload a real demo; the fixture sample has no Radar replays."}
          </p>
        ) : (
          <div className="rail-scroll">
            {moments.length ? (
              <ol className="moments" aria-label={`Moments for ${analysedName}`}>
                <li>
                  <button
                    type="button"
                    className="mom mom-overview"
                    aria-current={review === "overview" ? "true" : "false"}
                    onClick={() => setReview("overview")}
                  >
                    {review === "overview" ? <span className="rail-ind" aria-hidden /> : null}
                    <i className="g g-round" aria-hidden />
                    <span className="mom-title">Match overview</span>
                    <span className="mom-meta">
                      <span className="when">Summary and rounds</span>
                    </span>
                  </button>
                </li>
                {moments.map((m) => {
                  const current = m.id === activeMoment?.id && !review;
                  const lead = leadFinding(m, findingsById);
                  const title = lead ? findingLabel(lead) : kindLabel(m.kind);
                  const reason = pickedBecause(m);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="mom"
                        aria-current={current ? "true" : "false"}
                        aria-label={`${kindLabel(m.kind)}: ${title}. Round ${m.round}, ${formatClock(lead?.t ?? m.t0)}. ${reason}`}
                        onClick={() => selectMoment(m)}
                        data-moment={m.id}
                      >
                        {current ? <span className="rail-ind" aria-hidden /> : null}
                        <i className={`g g-${kindGlyph(m.kind)}`} aria-hidden />
                        <span className="mom-title">{title}</span>
                        <span className="mom-meta">
                          <span className="when">
                            R{m.round} {formatClock(lead?.t ?? m.t0)}
                            {povReady.has(m.id) ? (
                              <span className="pov-tag" title="First-person clip ready">
                                POV
                              </span>
                            ) : null}
                          </span>
                          <span className="reason">{reason.charAt(0).toUpperCase() + reason.slice(1)}</span>
                          <span className="seen" title={seenMoments.has(m.id) && !current ? "Seen" : undefined}>
                            {seenMoments.has(m.id) && !current ? "✓" : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {moments.length ? (
              <div className="rail-sub">
                All rounds
                <span>
                  {seen.size} of {rounds.length} seen
                </span>
              </div>
            ) : null}
            <ol className={`moments${moments.length ? " secondary" : ""}`} aria-label="All rounds">
              {rounds.map((r) => {
                const current = r.id === roundId && !activeMoment;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="mom"
                      aria-current={current ? "true" : "false"}
                      aria-label={`Round ${r.number}. ${r.winner ?? "No"} win, ${reasonLabel(r.reason)}.`}
                      onClick={() => selectRound(r.id)}
                      data-round={r.id}
                    >
                      {current ? <span className="rail-ind" aria-hidden /> : null}
                      {/* Neutral mark: triangle and circle mean mistake and good play (decision 4) */}
                      <i className="g g-round" aria-hidden />
                      <span className="mom-title">Round {r.number}</span>
                      <span className="mom-meta">
                        <span className="when">
                          {r.winner ? `${r.winner} win` : "—"}, {Math.round(r.durationSec)} s
                        </span>
                        <span className="reason">{reasonLabel(r.reason)}</span>
                        <span className="seen" title={seen.has(r.id) && !current ? "Seen" : undefined}>
                          {seen.has(r.id) && !current ? "✓" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </aside>

      <section className="work" aria-label="Replay" ref={workRef}>
        {empty ? (
          <div className="studio-empty">
            <h2>Replay not available</h2>
            <p>
              {loadError} <Link href="/upload">Add a demo</Link> to parse rounds onto the Radar stage.
            </p>
          </div>
        ) : null}

        <div className="stage-wrap" ref={wrapRef} hidden={empty}>
          <div className="stage" ref={stageRef}>
            {replay ? (
              <>
                <div
                  className={`surface${stageMode === "gameplay" && !povSrc ? " is-main" : " is-hidden"}`}
                  data-mode="gameplay"
                  hidden={stageMode !== "gameplay" || Boolean(povSrc)}
                >
                  <GameplayView
                    src={gameplaySrc}
                    active={stageMode === "gameplay"}
                    disabledReason={gameplayDisabledReason}
                    onBind={clock.bindVideo}
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
                      />
                      <div className="legend" aria-hidden>
                        <span>
                          <i style={{ background: "#fff", boxShadow: "0 0 0 1.5px #8FA9FF" }} />
                          {focus?.name ?? "You"}
                        </span>
                        <span>
                          <i style={{ background: "#9AA4AE" }} />
                          Team
                        </span>
                        <span>
                          <i style={{ background: "#F28C4C" }} />
                          Enemy
                        </span>
                      </div>
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
                        Timeline playback still works. Overview metadata exists for Mirage and
                        Anubis.
                      </p>
                    </div>
                  )}
                </div>
                {povClip && (stageMode === "radar" || povMain) ? (
                  <PovClip
                    clip={povClip}
                    src={povSrc}
                    main={povMain}
                    playerName={analysedName}
                    t={clock.t}
                    playing={clock.playing}
                    rate={clock.rate}
                    onSeek={(t) => seekTo(t)}
                    onRetry={retryPov}
                    onEnlarge={() => setMode("gameplay")}
                    onEnd={clock.pause}
                  />
                ) : null}
              </>
            ) : (
              <div className="stage-msg">
                <p>{loadingReplay || loadingMatch ? "Loading radar…" : "No replay loaded."}</p>
              </div>
            )}
          </div>
        </div>

        <div className="transport" ref={transportRef} hidden={empty}>
          <button
            type="button"
            className="play"
            aria-label={clock.playing ? "Pause" : "Play"}
            aria-keyshortcuts="Space"
            onClick={togglePlay}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
              {clock.playing ? (
                <>
                  <rect x="3" y="2" width="3" height="10" fill="currentColor" />
                  <rect x="8" y="2" width="3" height="10" fill="currentColor" />
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
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 1.5v9M10 1.5L4.5 6 10 10.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="step"
            aria-label="Next event"
            title="Next event (.)"
            onClick={() => stepEvent(1)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M10 1.5v9M2 1.5L7.5 6 2 10.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="clock">
            <b>{formatClock(clock.t)}</b>
            <span>
              {activeRound ? `round ${activeRound.number}, ` : ""}of {formatClock(clock.duration)}
            </span>
          </div>
          <div className="now" aria-live="off">
            {nowEvent ? eventTitle(nowEvent, lookup) : ""}
          </div>
          <div
            className={`seg${stageMode === "radar" ? " is-radar" : ""}`}
            role="group"
            aria-label="View"
            title="Switch view (V)"
          >
            <span className="seg-pill" aria-hidden />
            <button
              type="button"
              data-mode="gameplay"
              aria-pressed={stageMode === "gameplay"}
              disabled={!gameplayReady}
              title={gameplayReady ? "Gameplay" : (gameplayDisabledReason ?? "Gameplay unavailable")}
              onClick={() => setMode("gameplay")}
            >
              Gameplay
            </button>
            <button
              type="button"
              data-mode="radar"
              aria-pressed={stageMode === "radar"}
              onClick={() => setMode("radar")}
            >
              Radar
            </button>
          </div>
          {clipManifest && clipManifest.total > 0 && clipManifest.done < clipManifest.total ? (
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
            onClick={toggleFullscreen}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="btn btn-line ctx-toggle"
            aria-expanded={ctxOpen}
            aria-controls="ctx"
            onClick={() => setCtxOpen((o) => !o)}
          >
            Analysis
          </button>
          {!panelOn ? (
            <button
              type="button"
              className="icon-btn panel-show"
              aria-label="Show the details panel"
              title="Show panel"
              onClick={() => setPanelOn(true)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.4" />
                <path d="M7.8 6.2L6 8l1.8 1.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>

        {replay && !empty ? (
          <div ref={tlRef}>
            <ReplayTimeline
              duration={replay.durationSec}
              t={clock.t}
              marks={marks}
              lanes={lanes}
              rounds={rounds}
              won={match?.won ?? []}
              momentRounds={momentRounds}
              roundId={roundId}
              selectedEventId={selectedEventId}
              laneH={laneH}
              onSelectRound={selectRound}
              onSeek={seekTo}
              onScrub={(active) => {
                if (active) {
                  wasPlaying.current = clock.playing;
                  clock.pause();
                } else if (wasPlaying.current) clock.play();
              }}
            />
          </div>
        ) : null}
      </section>

      <aside
        className={`ctx${ctxOpen ? " open" : ""}${asking ? " asking" : ""}`}
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
            e.currentTarget.setPointerCapture(e.pointerId);
            grabY.current = e.clientY;
            grabDragged.current = false;
          }}
          onPointerUp={(e) => {
            const dy = grabY.current == null ? 0 : e.clientY - grabY.current;
            grabY.current = null;
            if (Math.abs(dy) < 24) return;
            grabDragged.current = true;
            setCtxOpen(dy < 0);
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
          <div className="ctx-tabs" role="tablist" aria-label="Panel">
            <button
              type="button"
              role="tab"
              id="tab-insight"
              aria-selected={!asking}
              aria-controls="insight"
              onClick={() => setAsking(false)}
            >
              Analysis
            </button>
            <button
              type="button"
              role="tab"
              id="tab-ask"
              aria-selected={asking}
              aria-controls="coach"
              onClick={() => setAsking(true)}
            >
              Ask
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
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.4" />
              <path d="M6 6.2L7.8 8 6 9.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {ctxOpen ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Close details"
              onClick={() => setCtxOpen(false)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="insight" id="insight" role="tabpanel" aria-labelledby="tab-insight">
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
          <h2 className="ins-head">
            {headFinding
              ? headFinding.summary
              : selected
              ? eventTitle(selected, lookup)
              : activeRound
                ? `${activeRound.winner ?? "No"} win, ${reasonLabel(activeRound.reason).toLowerCase()}`
                : "Pick a round"}
          </h2>
          <p className="picked">
            {headFinding && activeMoment && activeMoment.findingIds[0] === headFinding.id
              ? cited(
                  activeMoment.source === "agent"
                    ? `${kindLabel(activeMoment.kind)}. Picked by the coach: ${activeMoment.pickedBecause}`
                    : `${kindLabel(activeMoment.kind)}, ${momentRank === 1 ? "the most important" : `the ${ordinal(momentRank)} most important`} of ${moments.length} ${moments.length === 1 ? "moment" : "moments"}. Evidence: ${activeMoment.findingIds
                        .map((id) => `[${id}]`)
                        .join(" ")}.`,
                )
              : headFinding
                ? cited(`${kindLabel(headFinding.kind)} for ${analysedName}, finding [${headFinding.id}].`)
                : selected
                  ? `${typeLabel(selected.type)} at ${formatClock(selected.t)}, tick ${selected.tick}.`
                  : replay
                    ? "Play, scrub the timeline or pick an event."
                    : "Pick a moment or a round."}
          </p>

          {analysis && activeRound ? (
            <CoachExplanation
              matchId={matchId}
              playerId={analysis.playerId}
              momentId={activeMoment?.id ?? null}
              round={activeRound.number}
              language={coachLang}
              onLanguage={setCoachLang}
              {...coachCites}
            />
          ) : null}

          {activeMoment && momentIdx >= 0 ? (
            <div className="moment-step">
              <span className="meta">
                Moment {momentIdx + 1} of {moments.length}
              </span>
              {nextMoment ? (
                <button
                  type="button"
                  className="btn btn-line btn-wrap"
                  title="Next moment (N)"
                  onClick={() => selectMoment(nextMoment)}
                >
                  Next: {momentTitle(nextMoment)}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-fill"
                  title="Finish the review (N)"
                  onClick={() => setReview("wrapup")}
                >
                  Finish the review
                </button>
              )}
            </div>
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
                  <dt>Kills</dt>
                  <dd>{roundStats.kills}</dd>
                </div>
                <div>
                  <dt>Deaths</dt>
                  <dd>{roundStats.deaths}</dd>
                </div>
                <div>
                  <dt>Assists</dt>
                  <dd>{roundStats.assists}</dd>
                </div>
                <div>
                  <dt>Damage</dt>
                  <dd>{roundStats.damage}</dd>
                </div>
                <div>
                  <dt>Utility thrown</dt>
                  <dd>{roundStats.utilityThrown}</dd>
                </div>
                <div>
                  <dt>Equipment</dt>
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
          </>
          )}
        </div>

        {activeRound ? (
          <CoachPanel
            key={activeRound.id}
            matchId={matchId}
            playerId={analysis?.playerId ?? null}
            contextId={activeRound.id}
            round={activeRound.number}
            momentId={activeMoment?.id ?? null}
            language={coachLang}
            t={clock.t}
            knows={knows}
            suggestions={suggestions}
            inputRef={askRef}
            placeholder={`Ask about round ${activeRound.number} at ${formatClock(clock.t)}`}
            onAsk={() => setAsking(true)}
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
