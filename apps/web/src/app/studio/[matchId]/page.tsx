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
  type Finding,
  type Match,
  type ReplayPlayer,
  type RoundReplay,
  type RoundStats,
  type RoundSummary,
  type SelectedMoment,
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
  eventTitle,
  glyphForEvent,
  laneMarks,
  makeRosterLookup,
  reasonLabel,
  typeLabel,
} from "@/lib/replay/roster";
import { RadarView } from "@/components/replay/RadarView";
import { ReplayTimeline, type CoachMark } from "@/components/replay/ReplayTimeline";
import { CoachPanel } from "@/components/coach/CoachPanel";
import {
  KIND_LABEL,
  findingGlyph,
  findingTitle,
  momentTitle,
  stripCites,
} from "@/lib/coach/findings";

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
  const [whole, setWhole] = useState(false);
  const [asking, setAsking] = useState(false);
  const askRef = useRef<HTMLInputElement>(null);
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
  const clock = usePlaybackClock(0);
  const wasPlaying = useRef(false);

  // Coach analysis for the chosen player (empty until a player is analysed).
  const [findings, setFindings] = useState<Finding[]>([]);
  const [roundStats, setRoundStats] = useState<RoundStats[]>([]);
  const [picks, setPicks] = useState<SelectedMoment[]>([]);
  const [momentId, setMomentId] = useState<string | null>(null);
  const [findingId, setFindingId] = useState<string | null>(null);
  const [railTab, setRailTab] = useState<"moments" | "rounds">("moments");
  const pendingSeek = useRef<number | null>(null);

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
    setFindings([]);
    setRoundStats([]);
    setPicks([]);
    setMomentId(null);
    setFindingId(null);
    try {
      setFocusId(window.localStorage.getItem(focusKey(matchId)));
    } catch {
      setFocusId(null);
    }
    (async () => {
      try {
        const [m, rs] = await Promise.all([api.getMatch(matchId), api.getRounds(matchId)]);
        if (cancelled) return;
        setMatch(m);
        setRounds(rs);
        const pid = m.selectedPlayerId;
        let firstPick: SelectedMoment | undefined;
        if (pid && m.status === "complete") {
          try {
            const [fs, st, ms] = await Promise.all([
              api.getFindings(matchId, pid),
              api.getRoundStats(matchId, pid),
              api.getPlayerMoments(matchId, pid),
            ]);
            if (cancelled) return;
            setFindings(fs);
            setRoundStats(st);
            setPicks(ms);
            firstPick = ms[0];
          } catch {
            /* analysis missing: the radar still works on its own */
          }
        }
        const firstRound = firstPick && rs.find((r) => r.number === firstPick!.round);
        if (firstPick && firstRound) {
          setMomentId(firstPick.id);
          pendingSeek.current = firstPick.t0;
          setRoundId(firstRound.id);
        } else if (rs.length) {
          setRailTab("rounds");
          setRoundId(rs[0].id);
        } else if (!REPLAY_READY_STATUSES.has(m.status)) setLoadError("Match is still processing.");
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

  // ---- Derived replay state ----

  const roster = useMemo<ReplayPlayer[]>(
    () => replay?.players ?? match?.players ?? [],
    [replay, match],
  );
  const lookup = useMemo(() => makeRosterLookup(roster), [roster]);
  const coached = lookup(match?.selectedPlayerId);
  const focus = useMemo(
    () => lookup(focusId) ?? coached ?? roster.find((p) => p.team === "CT") ?? roster[0],
    [lookup, focusId, coached, roster],
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
  const marks = useMemo(() => laneMarks(events, lookup, focus), [events, lookup, focus]);

  const liveEvent = useMemo(() => {
    let last = null;
    for (const e of events) if (e.t <= clock.t + 0.05) last = e;
    return last;
  }, [events, clock.t]);
  const nowEvent = liveEvent && clock.t - liveEvent.t < LIVE_SEC ? liveEvent : null;
  const selected = (selectedEventId && events.find((e) => e.id === selectedEventId)) || liveEvent;

  const roundIdx = rounds.findIndex((r) => r.id === roundId);
  const activeRound = roundIdx >= 0 ? rounds[roundIdx] : undefined;

  const findingById = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);
  const roundFindings = useMemo(
    () => (activeRound ? findings.filter((f) => f.round === activeRound.number) : []),
    [findings, activeRound],
  );
  const findingCount = useMemo(() => {
    const out = new Map<number, { mistake: number; good: number }>();
    for (const f of findings) {
      const c = out.get(f.round) ?? { mistake: 0, good: 0 };
      if (f.kind === "mistake") c.mistake += 1;
      else if (f.kind === "good") c.good += 1;
      out.set(f.round, c);
    }
    return out;
  }, [findings]);
  const moment = picks.find((m) => m.id === momentId && m.round === activeRound?.number);
  const momentIdx = moment ? picks.indexOf(moment) : -1;
  const nextMoment = momentIdx >= 0 ? picks[momentIdx + 1] : undefined;
  const stats = activeRound
    ? roundStats.find((r) => r.round === activeRound.number)
    : undefined;
  const activeFinding = findingId ? findingById.get(findingId) : undefined;
  /** What the Analysis tab leads with: a clicked finding, else the active moment. */
  const focusItem: { kind: Finding["kind"]; t: number } | undefined = activeFinding
    ? { kind: activeFinding.kind, t: activeFinding.t }
    : moment
      ? { kind: moment.kind, t: moment.t0 }
      : undefined;
  const nextRound = roundIdx >= 0 ? rounds[roundIdx + 1] : undefined;
  const mapMeta = getMapMeta(replay?.map ?? match?.map ?? "");
  const mapLabel = mapMeta?.displayName ?? match?.map?.replace(/^de_/, "") ?? "—";

  // ---- Stage fitting (prototype fitStage): 16:9 stage, spare height to the lanes ----

  const workRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const transportRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const [laneH, setLaneH] = useState(LANE_BASE);
  const [stageSize, setStageSize] = useState({ w: 640, h: 360 });
  const coachMarks = useMemo<CoachMark[]>(
    () =>
      roundFindings.map((f) => ({
        id: f.id,
        t: f.t,
        glyph: findingGlyph(f.kind),
        title: findingTitle(f),
        summary: f.summary,
      })),
    [roundFindings],
  );
  const laneCount = useMemo(
    () => (new Set(marks.map((m) => m.lane)).size || 1) + (coachMarks.length ? 1 : 0),
    [marks, coachMarks],
  );

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
      setMomentId(null);
      setFindingId(null);
      setRoundId(id);
    },
    [],
  );

  const selectMoment = useCallback(
    (m: SelectedMoment) => {
      const r = rounds.find((x) => x.number === m.round);
      if (!r) return;
      clock.pause();
      setMomentId(m.id);
      setFindingId(null);
      setSelectedEventId(null);
      if (r.id === roundId) {
        clock.seek(m.t0);
      } else {
        animateCam.current = true;
        pendingSeek.current = m.t0;
        setRoundId(r.id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rounds, roundId, clock.pause, clock.seek],
  );

  const seekFinding = useCallback(
    (f: Finding) => {
      clock.pause();
      clock.seek(Math.max(0, f.t - 2));
      setSelectedEventId(null);
      setFindingId(f.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clock.pause, clock.seek],
  );

  const seekTo = useCallback(
    (t: number, eventId?: string) => {
      clock.seek(t);
      setSelectedEventId(eventId ?? null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clock.seek],
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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!roundId) return;
    document
      .querySelector(`.mom[data-round="${roundId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [roundId, loadingMatch]);

  useEffect(() => {
    document.title = activeRound
      ? `Round ${activeRound.number}, ${mapLabel}, Round Reviewer`
      : "Round Reviewer";
  }, [activeRound, mapLabel]);

  const empty = !loadingMatch && Boolean(loadError) && !replay && rounds.length === 0;

  // ---- Panel content ----

  const panelLive = Boolean(selected && clock.t >= selected.t && clock.t - selected.t < LIVE_SEC);
  const killsThisRound = events.filter((e) => e.type === "kill").length;
  const hpById = new Map(players.map((p) => [p.id, p]));
  // What the coach will be given as context; shown so the viewer knows what it can see.
  const knows = activeRound
    ? `Knows round ${activeRound.number} at ${formatClock(clock.t)}, the radar view${
        selected ? `, the ${typeLabel(selected.type).toLowerCase()} at ${formatClock(selected.t)}` : ""
      }${focus ? ` and that you are following ${focus.name}` : ""}.`
    : "";
  const suggestions = activeRound
    ? [
        `Why did ${activeRound.winner ?? "this side"} win round ${activeRound.number}?`,
        selected?.type === "kill" && lookup(selected.victimId)
          ? `Could ${lookup(selected.victimId)!.name} have avoided that death?`
          : `What should ${focus?.name ?? "I"} have done differently here?`,
        `Where was ${focus ? `${focus.name}'s` : "my"} team out of position?`,
      ]
    : [];
  const teams = (["CT", "T"] as const).map((side) => ({
    side,
    players: roster.filter((p) => p.team === side),
  }));

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

      <aside className="rail" aria-label={picks.length ? "Moments in this match" : "Rounds in this match"}>
        {picks.length ? (
          <div className="rail-tabs" role="tablist" aria-label="Rail">
            <button
              type="button"
              role="tab"
              aria-selected={railTab === "moments"}
              onClick={() => setRailTab("moments")}
            >
              Moments <span>{picks.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={railTab === "rounds"}
              onClick={() => setRailTab("rounds")}
            >
              All rounds <span>{rounds.length}</span>
            </button>
          </div>
        ) : null}
        <div className="rail-h">
          <b>
            {loadingMatch
              ? "Loading…"
              : railTab === "moments" && picks.length
                ? coached
                  ? `Picked for ${coached.name}`
                  : "Picked moments"
                : `${rounds.length} rounds`}
          </b>
          {rounds.length && !(railTab === "moments" && picks.length) ? (
            <span>
              {seen.size} of {rounds.length} seen
            </span>
          ) : null}
        </div>
        {loadingMatch ? null : railTab === "moments" && picks.length ? (
          <ol className="moments">
            {picks.map((m) => {
              const current = m.id === moment?.id;
              const title = momentTitle(m, findingById);
              const why = stripCites(m.pickedBecause);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className="mom"
                    aria-current={current ? "true" : "false"}
                    aria-label={`${KIND_LABEL[m.kind]}: ${title}. Round ${m.round}. ${why}`}
                    onClick={() => selectMoment(m)}
                    data-moment={m.id}
                  >
                    {current ? <span className="rail-ind" aria-hidden /> : null}
                    <i className={`g g-${findingGlyph(m.kind)}`} aria-hidden />
                    <span className="mom-title">{title}</span>
                    <span className="mom-meta">
                      <span className="when">
                        R{m.round} {formatClock(m.t0)}
                      </span>
                      <span className="reason">{why}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : rounds.length === 0 ? (
          <p className="rail-empty">
            {loadError ?? "No rounds yet. Upload a real demo; the fixture sample has no Radar replays."}
          </p>
        ) : (
          <ol className="moments">
            {rounds.map((r) => {
              const current = r.id === roundId;
              const c = findingCount.get(r.number);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className="mom"
                    aria-current={current ? "true" : "false"}
                    aria-label={`Round ${r.number}. ${r.winner ?? "No"} win, ${reasonLabel(r.reason)}.${
                      c ? ` ${c.mistake} mistakes, ${c.good} good plays.` : ""
                    }`}
                    onClick={() => selectRound(r.id)}
                    data-round={r.id}
                  >
                    {current ? <span className="rail-ind" aria-hidden /> : null}
                    <i
                      className={`g ${r.winner === "T" ? "g-t" : r.winner === "CT" ? "g-ct" : "g-none"}`}
                      aria-hidden
                    />
                    <span className="mom-title">Round {r.number}</span>
                    <span className="mom-meta">
                      <span className="when">
                        {r.winner ? `${r.winner} win` : "—"}, {Math.round(r.durationSec)} s
                      </span>
                      <span className="reason">{reasonLabel(r.reason)}</span>
                      <span className="seen" title={seen.has(r.id) && !current ? "Seen" : undefined}>
                        {c ? (
                          <span className="counts" aria-hidden>
                            {c.mistake ? <span className="c-neg">{c.mistake}</span> : null}
                            {c.good ? <span className="c-pos">{c.good}</span> : null}
                          </span>
                        ) : seen.has(r.id) && !current ? (
                          "✓"
                        ) : (
                          ""
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {!loadingMatch && !picks.length && rounds.length && match ? (
          <p className="rail-note">
            {match.status === "awaiting_player" || !match.selectedPlayerId ? (
              <>
                No player analysed yet.{" "}
                <Link className="link" href={`/processing/${matchId}?pick=1`}>
                  Choose a player
                </Link>
              </>
            ) : match.status !== "complete" ? (
              "Analysis is still running."
            ) : null}
          </p>
        ) : null}
        {picks.length && coached ? (
          <p className="rail-note">
            <Link className="link" href={`/processing/${matchId}?pick=1`}>
              Coach another player
            </Link>
          </p>
        ) : null}
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
            {replay && hasRadar ? (
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
                {replay && !hasRadar ? (
                  <p>
                    Radar positions are not available for <strong>{mapLabel}</strong> yet. Timeline
                    playback still works. Overview metadata exists for Mirage and Anubis.
                  </p>
                ) : (
                  <p>{loadingReplay || loadingMatch ? "Loading radar…" : "No replay loaded."}</p>
                )}
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
              rounds={rounds}
              won={match?.won ?? []}
              roundId={roundId}
              selectedEventId={selectedEventId}
              laneH={laneH}
              onSelectRound={selectRound}
              onSeek={seekTo}
              coach={coachMarks}
              selectedFindingId={findingId}
              window={moment ? [moment.t0, moment.t1] : null}
              onFinding={(id) => {
                const f = findingById.get(id);
                if (f) seekFinding(f);
              }}
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
        <div className={`p-head${panelLive ? " live" : ""}`}>
          {focusItem ? (
            <i className={`g g-${findingGlyph(focusItem.kind)}`} aria-hidden />
          ) : selected ? (
            <i className={`d d-${glyphForEvent(selected.type)}`} aria-hidden />
          ) : null}
          <span className="lab">
            {focusItem
              ? KIND_LABEL[focusItem.kind]
              : selected
                ? typeLabel(selected.type)
                : activeRound
                  ? `Round ${activeRound.number}`
                  : "Round"}
          </span>
          <span>
            {activeRound ? `R${activeRound.number} ` : ""}
            {formatClock(focusItem ? focusItem.t : selected ? selected.t : clock.t)}
          </span>
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
          {moment || activeFinding ? (
            <>
              <h2 className="ins-head">
                {activeFinding ? findingTitle(activeFinding) : momentTitle(moment!, findingById)}
              </h2>
              <p className="picked">
                {activeFinding ? (
                  <>
                    {KIND_LABEL[activeFinding.kind]}. {activeFinding.summary}
                  </>
                ) : (
                  <>
                    {KIND_LABEL[moment!.kind]}. Picked because:{" "}
                    {lowerFirst(stripCites(moment!.pickedBecause))}
                  </>
                )}
              </p>
              {moment && !activeFinding ? (
                <section className="layer">
                  <h3>What happened</h3>
                  <FindingList
                    items={moment.findingIds.map((id) => findingById.get(id)).filter(isFinding)}
                    activeId={findingId}
                    onPick={seekFinding}
                  />
                  <p className="coach-note">
                    The coach will add why it matters and what to try next once it is connected.
                  </p>
                </section>
              ) : null}
            </>
          ) : (
            <>
            <h2 className="ins-head">
              {selected
                ? eventTitle(selected, lookup)
                : activeRound
                  ? `${activeRound.winner ?? "No"} win, ${reasonLabel(activeRound.reason).toLowerCase()}`
                  : "Pick a round"}
            </h2>
            <p className="picked">
              {selected
                ? `${typeLabel(selected.type)} at ${formatClock(selected.t)}, tick ${selected.tick}.`
                : replay
                  ? "Play, scrub the timeline or pick an event."
                  : "Pick a round to load its replay."}
            </p>
            </>
          )}

          {roundFindings.length && (activeFinding || !moment) ? (
            <section className="layer">
              <h3>
                {coached ? `${coached.name} in round ${activeRound?.number}` : "Findings"}
              </h3>
              <FindingList items={roundFindings} activeId={findingId} onPick={seekFinding} />
            </section>
          ) : null}

          {stats ? (
            <section className="layer">
              <h3>{coached ? `${coached.name}, round ${stats.round}` : `Round ${stats.round}`}</h3>
              <dl className="facts">
                <dt>Side</dt>
                <dd>
                  {stats.side ?? "—"}
                  {stats.won == null ? "" : stats.won ? ", won" : ", lost"}
                </dd>
                <dt>K / D / A</dt>
                <dd>
                  {stats.kills} / {stats.deaths} / {stats.assists}
                </dd>
                <dt>Damage</dt>
                <dd>{stats.damage}</dd>
                <dt>Utility</dt>
                <dd>
                  {stats.utilityThrown} thrown
                  {stats.utilityDamage ? `, ${stats.utilityDamage} damage` : ""}
                  {stats.enemiesFlashed ? `, ${stats.enemiesFlashed} enemies flashed` : ""}
                </dd>
                {stats.equipValue != null ? (
                  <>
                    <dt>Equipment</dt>
                    <dd>
                      ${stats.equipValue.toLocaleString("en-GB")}
                      {stats.moneyStart != null
                        ? ` of $${stats.moneyStart.toLocaleString("en-GB")}`
                        : ""}
                    </dd>
                  </>
                ) : null}
                <dt>Alive</dt>
                <dd>
                  {stats.survived
                    ? "Survived"
                    : stats.timeAliveS != null
                      ? `${formatClock(stats.timeAliveS)}${
                          stats.deathTraded == null ? "" : stats.deathTraded ? ", traded" : ", not traded"
                        }`
                      : "Died"}
                </dd>
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
              <details className="ev" open>
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

          <div className="next-row">
            {moment ? (
              nextMoment ? (
                <button type="button" className="link" onClick={() => selectMoment(nextMoment)}>
                  Next moment: {momentTitle(nextMoment, findingById)}
                </button>
              ) : (
                <span style={{ color: "var(--text-3)", fontSize: 13 }}>
                  That was the last of the {picks.length} moments.
                </span>
              )
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
        </div>

        {activeRound ? (
          <CoachPanel
            key={activeRound.id}
            matchId={matchId}
            contextId={activeRound.id}
            t={clock.t}
            knows={knows}
            suggestions={suggestions}
            inputRef={askRef}
            placeholder={`Ask about round ${activeRound.number} at ${formatClock(clock.t)}`}
            onAsk={() => setAsking(true)}
            onSeek={(t) => {
              clock.pause();
              seekTo(t);
            }}
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

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function isFinding(f: Finding | undefined): f is Finding {
  return Boolean(f);
}

/** Findings with seek links; each row jumps the shared clock to just before it. */
function FindingList({
  items,
  activeId,
  onPick,
}: {
  items: Finding[];
  activeId: string | null;
  onPick: (f: Finding) => void;
}) {
  return (
    <ul className="findings">
      {items.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            className={`fd-row${f.id === activeId ? " linked" : ""}`}
            onClick={() => onPick(f)}
          >
            <i className={`g g-${findingGlyph(f.kind)}`} aria-hidden />
            <span className="fd-t">{findingTitle(f)}</span>
            <span className="fd-v">
              {f.id}, {formatClock(f.t)}
            </span>
            <span className="fd-s">{f.summary}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
