"use client";

import { useMemo, useRef } from "react";
import type { AliveStep, LaneMark } from "@/lib/replay/roster";
import { formatClock } from "@/lib/replay/time";

type Props = {
  duration: number;
  t: number;
  marks: LaneMark[];
  alive: AliveStep[];
  band?: { t0: number; t1: number; label: string; glyph: string } | null;
  selectedEventId: string | null;
  onSeek: (t: number, eventId?: string) => void;
  onScrub: (active: boolean) => void;
};

function AliveGraph({ steps, duration }: { steps: AliveStep[]; duration: number }) {
  if (!steps.length || !duration) return null;
  const peak = Math.max(1, ...steps.map((s) => Math.max(s.T,s.CT)));
  const area = (side: "T" | "CT") => {
    const sign = side === "T" ? -1 : 1;
    return `M${steps[0].t} 0 ${steps.map((s) => `H${s.t} V${sign*s[side]}`).join(" ")} H${duration} V0 Z`;
  };
  return <svg className="alive-graph" role="img" aria-label="Players alive by side, terrorists above and counter-terrorists below"
    viewBox={`0 ${-peak} ${duration} ${peak*2}`} preserveAspectRatio="none">
    <path d={area("T")} fill="var(--side-t)" /><path d={area("CT")} fill="var(--side-ct)" />
  </svg>;
}

export function ReplayTimeline({ duration, t, marks, alive, band, selectedEventId, onSeek, onScrub }: Props) {
  const scrub = useRef<HTMLDivElement>(null);
  const max = Math.max(.001, duration);
  const pct = (v: number) => `${100*Math.min(1,Math.max(0,v/max))}%`;
  const seekAt = (x: number) => {
    if (!scrub.current) return;
    const r = scrub.current.getBoundingClientRect();
    onSeek(Math.max(0,Math.min(1,(x-r.left)/r.width))*duration);
  };
  const ticks = useMemo(() => {
    const result = [0];
    for (let n=30;n < duration-6;n+=30) result.push(n);
    if (duration > 0) result.push(duration);
    return result;
  }, [duration]);

  function markButton(m: LaneMark) {
    return <button key={m.key} type="button" className="time-mark" data-selected={selectedEventId === m.eventId}
      style={{ left:pct(m.t) }} aria-label={`${m.label}, ${formatClock(m.t)}`} title={`${m.label}, ${formatClock(m.t)}`}
      onClick={() => onSeek(m.t,m.eventId)}>
      <i className={m.lane === "coach" ? `g g-${m.glyph}` : "bomb-mark"} aria-hidden="true"/>
    </button>;
  }
  return <div className="replay-timeline">
    <div className="time-tracks">
      <div ref={scrub} className="time-scrub" role="slider" tabIndex={0} aria-label="Round position"
        aria-valuemin={0} aria-valuemax={duration} aria-valuenow={t} aria-valuetext={`${formatClock(t)} of ${formatClock(duration)}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onScrub(true); seekAt(e.clientX); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e.clientX); }}
        onLostPointerCapture={() => onScrub(false)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? .1 : 1;
          if (e.key === "Home") onSeek(0);
          else if (e.key === "End") onSeek(duration);
          else if (["ArrowRight","ArrowUp"].includes(e.key)) onSeek(Math.min(duration,t+step));
          else if (["ArrowLeft","ArrowDown"].includes(e.key)) onSeek(Math.max(0,t-step));
          else return;
          e.preventDefault(); e.stopPropagation();
        }} />
      <div className="coach-lane">
        {band && <span className="moment-window" data-kind={band.glyph} style={{ left:pct(band.t0),right:pct(max-band.t1) }} />}
        {marks.filter((m) => m.lane === "coach").map(markButton)}
      </div>
      <div className="alive-lane"><AliveGraph steps={alive} duration={duration}/>
        {marks.filter((m) => m.lane === "bomb").map(markButton)}
      </div>
      <span className="time-head" style={{left:pct(t)}} />
    </div>
    <div className="time-axis" aria-hidden="true">{ticks.map((sec) =>
      <span key={sec} style={{left:pct(sec)}}>{formatClock(sec).split(".")[0]}</span>)}</div>
  </div>;
}
