"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LANE_NAMES, LANE_ORDER, type AliveStep, type Lane, type LaneMark } from "@/lib/replay/roster";
import { formatClock } from "@/lib/replay/time";

type Props = {
  duration: number;
  t: number;
  marks: LaneMark[];
  /** Lanes to draw, in order; fixed for the match so rows don't move between rounds. */
  lanes?: readonly Lane[];
  /** Players alive per side over the round, for the Fight lane's step graph. */
  alive: AliveStep[];
  /** The picked moment in view: a tinted band across every lane with its number and label. */
  band?: { t0: number; t1: number; label: string; glyph: "mistake" | "strength" | "note"; n: number } | null;
  selectedEventId: string | null;
  laneH: number;
  onSeek: (t: number, eventId?: string) => void;
  onScrub: (active: boolean) => void;
};

type Tip = { x: number; y: number; label: string; detail?: string };

const CLUSTER_GAP = 20;
/** Coach markers closer than this keep only their glyph; the label moves to the tooltip. */
const LABEL_GAP = 120;
/** Coach findings closer than this share one marker, led by the highest priority. */
const STACK_GAP = 14;

type CoachStack = { lead: LaneMark; rest: LaneMark[] };

export function ReplayTimeline({
  duration,
  t,
  marks,
  lanes = LANE_ORDER,
  alive,
  band,
  selectedEventId,
  laneH,
  onSeek,
  onScrub,
}: Props) {
  const max = Math.max(duration, 0.001);
  const hitRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(600);
  const [tip, setTip] = useState<Tip | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const hit = hitRef.current;
    if (!hit) return;
    const ro = new ResizeObserver(() => setTrackW(hit.clientWidth || 1));
    ro.observe(hit);
    return () => ro.disconnect();
  }, []);

  // The lane set is fixed for the match (U13); a lane with nothing this round stays as an empty row.

  // Markers closer than CLUSTER_GAP px collapse into a count.
  const items = useMemo(() => {
    const out: Array<
      | { kind: "mark"; lane: Lane; mark: LaneMark }
      | { kind: "cluster"; lane: Lane; group: LaneMark[] }
      | { kind: "coach"; lane: Lane; stack: CoachStack }
    > = [];
    for (const lane of lanes) {
      const ms = marks.filter((m) => m.lane === lane).sort((a, b) => a.t - b.t);
      if (lane === "coach") {
        // Primary events: never collapsed into a count (08 Timeline). Findings at the
        // same moment share one marker so their glyphs do not pile up.
        let group: LaneMark[] = [];
        const flushCoach = () => {
          if (!group.length) return;
          const sorted = [...group].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
          out.push({ kind: "coach", lane, stack: { lead: sorted[0], rest: sorted.slice(1) } });
          group = [];
        };
        for (const m of ms) {
          if (group.length && ((m.t - group[0].t) / max) * trackW >= STACK_GAP) flushCoach();
          group.push(m);
        }
        flushCoach();
        continue;
      }
      // Fight ticks cluster per side, so a trade stays two ticks, one above the axis and one below.
      const runs = lane === "fight" ? [ms.filter((m) => m.side === "us"), ms.filter((m) => m.side !== "us")] : [ms];
      for (const run of runs) {
        let group: LaneMark[] = [];
        const flush = () => {
          if (group.length === 1) out.push({ kind: "mark", lane, mark: group[0] });
          else if (group.length > 1) out.push({ kind: "cluster", lane, group });
          group = [];
        };
        for (const m of run) {
          const prev = group[group.length - 1];
          if (prev && ((m.t - prev.t) / max) * trackW < CLUSTER_GAP) group.push(m);
          else {
            flush();
            group = [m];
          }
        }
        flush();
      }
    }
    return out;
  }, [lanes, marks, max, trackW]);

  // A label runs to the right of its glyph, so it needs room before the next marker.
  const crowded = useMemo(() => {
    const out = new Set<string>();
    const coach = items.flatMap((it) => (it.kind === "coach" ? [it.stack.lead] : []));
    coach.forEach((m, i) => {
      const next = coach[i + 1];
      if (next && ((next.t - m.t) / max) * trackW < LABEL_GAP) out.add(m.key);
    });
    return out;
  }, [items, max, trackW]);

  const ticks = useMemo(() => {
    const step = duration > 90 ? 15 : duration > 40 ? 10 : 5;
    const out: number[] = [];
    for (let s = 0; s <= duration + 0.001; s += step) out.push(s);
    return out;
  }, [duration]);

  function tAt(clientX: number): number {
    const r = hitRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * max;
  }

  function showTip(el: HTMLElement, label: string, detail?: string) {
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, label, detail });
  }

  const hideTip = () => setTip(null);
  const pct = (sec: number) => `${(sec / max) * 100}%`;
  const now = (m: LaneMark) => t >= m.t && t - m.t < 2.5;

  return (
    <div className="tl" style={{ "--lane-h": `${laneH}px` } as CSSProperties}>
      <div className="lanes">
        {lanes.map((lane) => (
          <LaneRow key={lane} lane={lane} extra={lane === "fight" ? <FightGraph alive={alive} max={max} /> : null}>
            {items
              .filter((it) => it.lane === lane)
              .map((it) =>
                it.kind === "coach" ? (
                  <CoachMarker
                    key={it.stack.lead.key}
                    stack={it.stack}
                    left={pct(it.stack.lead.t)}
                    live={[it.stack.lead, ...it.stack.rest].some(now)}
                    selected={[it.stack.lead, ...it.stack.rest].some((m) => m.eventId === selectedEventId)}
                    showLabel={!crowded.has(it.stack.lead.key)}
                    onSeek={onSeek}
                    showTip={showTip}
                    hideTip={hideTip}
                  />
                ) : it.kind === "mark" ? (
                  <button
                    key={it.mark.key}
                    type="button"
                    className={`mk${now(it.mark) ? " now" : ""}${
                      it.mark.eventId === selectedEventId ? " sel" : ""
                    }${it.mark.side ? ` k-${it.mark.side}` : ""}${it.mark.you ? " k-you" : ""}`}
                    style={{ left: pct(it.mark.t) }}
                    aria-label={`${it.mark.label}, ${formatClock(it.mark.t)}`}
                    onClick={() => onSeek(it.mark.t, it.mark.eventId)}
                    onMouseEnter={(e) => showTip(e.currentTarget, it.mark.label, formatClock(it.mark.t))}
                    onMouseLeave={hideTip}
                    onFocus={(e) => showTip(e.currentTarget, it.mark.label, formatClock(it.mark.t))}
                    onBlur={hideTip}
                  >
                    {it.mark.side ? <i className="k" aria-hidden /> : <i className={`d d-${it.mark.glyph}`} aria-hidden />}
                  </button>
                ) : (
                  <button
                    key={it.group[0].key}
                    type="button"
                    className={`cluster${it.lane === "fight" ? ` k-${it.group[0].side ?? "them"}` : ""}`}
                    style={{
                      left: pct(it.group.reduce((s, m) => s + m.t, 0) / it.group.length),
                    }}
                    aria-label={`${it.group.length} events: ${it.group.map((m) => m.label).join(", ")}`}
                    onClick={() => onSeek(it.group[0].t, it.group[0].eventId)}
                    onMouseEnter={(e) =>
                      showTip(
                        e.currentTarget,
                        it.group.map((m) => m.label).join(", "),
                        "Click to jump to the first",
                      )
                    }
                    onMouseLeave={hideTip}
                  >
                    {it.group.length}
                  </button>
                ),
              )}
          </LaneRow>
        ))}
        {lanes.length === 0 ? (
          <>
            <div className="lane-n">Events</div>
            <div className="lane-t" />
          </>
        ) : null}

        {band ? (
          <div
            className={`band band-${band.glyph}`}
            style={{ "--b0": Math.max(0, band.t0) / max, "--b1": Math.min(max, band.t1) / max } as CSSProperties}
            aria-hidden
          >
            <span>
              <b>{String(band.n).padStart(2, "0")}</b> {band.label}
            </span>
          </div>
        ) : null}

        <div
          ref={hitRef}
          className="hit"
          role="slider"
          tabIndex={0}
          aria-label="Round position"
          aria-valuemin={0}
          aria-valuemax={Number(duration.toFixed(1))}
          aria-valuenow={Number(t.toFixed(1))}
          aria-valuetext={`${formatClock(t)} of ${formatClock(duration)}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragging.current = true;
            onScrub(true);
            onSeek(tAt(e.clientX));
          }}
          onPointerMove={(e) => {
            const g = ghostRef.current;
            const r = e.currentTarget.getBoundingClientRect();
            if (g) {
              g.style.opacity = "1";
              g.style.transform = `translateX(${e.clientX - r.left}px)`;
            }
            if (dragging.current) onSeek(tAt(e.clientX));
          }}
          onPointerLeave={() => {
            if (ghostRef.current) ghostRef.current.style.opacity = "0";
          }}
          onPointerUp={() => {
            if (!dragging.current) return;
            dragging.current = false;
            onScrub(false);
          }}
          onPointerCancel={() => {
            dragging.current = false;
            onScrub(false);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 1;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") onSeek(t + step);
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onSeek(t - step);
            else if (e.key === "Home") onSeek(0);
            else if (e.key === "End") onSeek(duration);
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        <div className="playhead" style={{ "--p": t / max } as CSSProperties} />
        <div className="ghost" ref={ghostRef} />
      </div>

      <div className="row">
        <span />
        <div className="scale-t" aria-hidden>
          {ticks.map((sec) => (
            <span key={sec} style={{ left: pct(sec) }}>
              {Math.round(sec)} s
            </span>
          ))}
        </div>
      </div>

      <div
        className={`tip${tip ? " on" : ""}`}
        role="tooltip"
        style={tip ? { left: tip.x, top: tip.y } : undefined}
      >
        {tip ? (
          <>
            <b>{tip.label}</b>
            {tip.detail ? <span>{tip.detail}</span> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function CoachMarker({
  stack,
  left,
  live,
  selected,
  showLabel,
  onSeek,
  showTip,
  hideTip,
}: {
  stack: CoachStack;
  left: string;
  live: boolean;
  selected: boolean;
  showLabel: boolean;
  onSeek: (t: number, eventId?: string) => void;
  showTip: (el: HTMLElement, label: string, detail?: string) => void;
  hideTip: () => void;
}) {
  const { lead, rest } = stack;
  const all = [lead, ...rest];
  const label = rest.length ? `${lead.label} and ${rest.length} more` : lead.label;
  const tipLabel = all.map((m) => m.label).join(", ");
  const tipDetail = `${formatClock(lead.t)}, ${all.length > 1 ? "findings" : "finding"} ${all.map((m) => m.eventId).join(", ")}`;
  return (
    <button
      type="button"
      className={`mk mk-ins${live ? " live" : ""}${selected ? " sel" : ""}`}
      style={{ left }}
      aria-label={`${tipLabel}, ${formatClock(lead.t)}${lead.detail ? `. ${lead.detail}` : ""}`}
      onClick={() => onSeek(lead.t, lead.eventId)}
      onMouseEnter={(e) => showTip(e.currentTarget, tipLabel, tipDetail)}
      onMouseLeave={hideTip}
      onFocus={(e) => showTip(e.currentTarget, tipLabel, tipDetail)}
      onBlur={hideTip}
    >
      <i className={`g g-${lead.glyph}`} aria-hidden />
      {showLabel ? <span className="lbl">{label}</span> : null}
    </button>
  );
}

function LaneRow({ lane, extra, children }: { lane: Lane; extra?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className={`lane-n l-${lane}`}>{LANE_NAMES[lane]}</div>
      <div className={`lane-t l-${lane}`} data-lane={lane}>
        {extra}
        {children}
      </div>
    </>
  );
}

/**
 * Players alive per side as a mirrored step graph: the followed player's team above the axis,
 * the other team below. Each kill is a step, so trades and man advantage read at a glance.
 */
function FightGraph({ alive, max }: { alive: AliveStep[]; max: number }) {
  if (!alive.length) return null;
  const top = Math.max(5, ...alive.map((a) => Math.max(a.us, a.them)));
  const H = 10;
  const mid = H / 2;
  const k = (mid - 0.4) / top;
  const path = (sign: 1 | -1, key: "us" | "them") => {
    let d = `M0 ${mid}`;
    let prev = alive[0][key];
    d += ` L0 ${mid - sign * prev * k}`;
    for (const a of alive.slice(1)) {
      d += ` L${a.t} ${mid - sign * prev * k} L${a.t} ${mid - sign * a[key] * k}`;
      prev = a[key];
    }
    d += ` L${max} ${mid - sign * prev * k} L${max} ${mid} Z`;
    return d;
  };
  return (
    <svg className="fight" viewBox={`0 0 ${max} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path className="fight-us" d={path(1, "us")} vectorEffect="non-scaling-stroke" />
      <path className="fight-them" d={path(-1, "them")} vectorEffect="non-scaling-stroke" />
      <line x1={0} x2={max} y1={mid} y2={mid} className="fight-axis" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
