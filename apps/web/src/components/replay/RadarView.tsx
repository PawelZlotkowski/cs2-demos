"use client";

import { useId, useLayoutEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import type { InterpolatedPlayer } from "@/lib/replay/interpolate";
import type { ReplayPlayer } from "@/lib/contracts";
import { getMapMeta } from "@/lib/replay/maps";
import { type RosterLookup } from "@/lib/replay/roster";
import { trailPoints, type Box, type Track, type UtilityMark } from "@/lib/replay/camera";
import { reducedMotion } from "@/lib/motion";

const TRAIL_SEC = 4;

type Props = {
  mapName: string;
  t: number;
  players: InterpolatedPlayer[];
  lookup: RosterLookup;
  focus?: ReplayPlayer;
  tracks: Map<string, Track>;
  utility: UtilityMark[];
  viewBox: Box;
  /** Screen pixels per radar unit, so marks stay the same size at any zoom. */
  pxPerUnit: number;
  /** The picked moment's window: the followed player's whole path through it is drawn faintly. */
  moment?: { id: string; t0: number; t1: number } | null;
  /** True while a keyboard shortcut is handled: the path then appears at once (keyboard actions never animate). */
  participants?: string[];
  opponentId?: string | null;
  lens?: boolean;
  highlighted?: boolean;
  shot?: boolean;
  selectedId?: string;
  instantRef?: RefObject<boolean>;
};

/** Radar points of one track between t0 and t1, while alive. */
function windowPoints(tr: Track, t0: number, t1: number): string {
  const pts: string[] = [];
  for (let i = 0; i < tr.t.length; i += 1) {
    const t = tr.t[i];
    if (t < t0) continue;
    if (t > t1 || !tr.alive[i]) break;
    pts.push(`${tr.rx[i].toFixed(1)},${tr.ry[i].toFixed(1)}`);
  }
  return pts.length > 1 ? `M${pts.join(" L")}` : "";
}

export function RadarView({
  mapName,
  t,
  players,
  lookup,
  focus,
  tracks,
  utility,
  viewBox,
  pxPerUnit,
  moment,
  participants = [],
  opponentId,
  lens = false,
  highlighted = false,
  shot = false,
  selectedId,
  instantRef,
}: Props) {
  const clipId = useId();
  const meta = getMapMeta(mapName);
  const size = meta?.radarSize ?? 1024;
  const u = (px: number) => px / Math.max(pxPerUnit, 0.01);
  const vb = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;
  const pathRef = useRef<SVGPathElement>(null);

  // Draw the followed player's path through the moment once, when the moment opens (GSAP, space).
  const focusTrack = focus ? tracks.get(focus.id) : undefined;
  const momentPath = moment && focusTrack ? windowPoints(focusTrack, moment.t0, moment.t1) : "";
  useLayoutEffect(() => {
    const el = pathRef.current;
    if (!el || reducedMotion() || instantRef?.current) return;
    const tween = gsap.fromTo(
      el,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 0.42, ease: "power2.out", clearProps: "strokeDashoffset" },
    );
    return () => {
      tween.kill();
    };
  }, [moment?.id]);

  const subject = players.find((p) => p.id === focus?.id);
  const opponent = players.find((p) => p.id === opponentId);
  const colour = (id: string) => {
    const side = lookup(id)?.team;
    return side === "T" ? "var(--side-t)" : side === "CT" ? "var(--side-ct)" : "var(--stage-text-2)";
  };
  const ordered = [...players].sort((a,b) => Number(a.id === selectedId) - Number(b.id === selectedId));
  const radius = u(6.5);
  // 168px across on desktop; on a phone-sized stage a fifth of the view, or it covers half the map
  const glassRadius = Math.min(u(84), viewBox.w / 5, viewBox.h / 5);
  // Keep the followed player inside the magnifier throughout the approach.
  const fitsPair = subject && opponent && Math.hypot(subject.rx - opponent.rx, subject.ry - opponent.ry) * 0.9 < glassRadius - u(18);
  const cx = fitsPair ? (subject.rx + opponent.rx) / 2 : subject?.rx;
  const cy = fitsPair ? (subject.ry + opponent.ry) / 2 : subject?.ry;
  const showLens = lens && moment && t >= moment.t0 && t <= moment.t1 && cx != null && cy != null;
  const map = meta?.radarImage && <image className="radar-map" href={meta.radarImage} width={size} height={size} />;
  const trail = subject?.alive && focusTrack && <polyline points={trailPoints(focusTrack, t - TRAIL_SEC, t, subject)}
    fill="none" stroke={colour(subject.id)} strokeWidth={u(1.6)} strokeDasharray={`${u(2)} ${u(6)}`} strokeLinecap="round" />;

  function marker(p: InterpolatedPlayer, inLens = false) {
    const you = p.id === selectedId;
    const label = you ? "You" : participants.includes(p.id) ? lookup(p.id)?.name : undefined;
    return <g key={p.id} transform={`translate(${p.rx} ${p.ry}) scale(${inLens ? 0.72 : 1})`}>
      {p.alive ? <>
        <g transform={`rotate(${-p.yaw})`} fill={colour(p.id)} stroke="var(--stage-halo)" strokeWidth={u(1.5)}>
          <path d={`M${radius*.55},${-radius*.65} L${radius+u(5)},0 L${radius*.55},${radius*.65}Z`} />
          <circle r={radius} />
        </g>
        {you && <circle r={radius+u(3)} fill="none" stroke="var(--stage-you)" strokeWidth={u(2)} />}
      </> : <path d={`M${-radius},${-radius}l${2*radius},${2*radius} M${radius},${-radius}l${-2*radius},${2*radius}`}
        stroke={colour(p.id)} strokeWidth={u(2)} opacity={.8} />}
      {label && <text className="radar-name" y={you ? radius+u(15) : -radius-u(4)} textAnchor="middle"
        fontSize={u(12)} fill="var(--stage-text)" stroke="var(--stage-halo)" strokeWidth={u(3)} paintOrder="stroke">{label}</text>}
    </g>;
  }

  return <svg className="radar" viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Radar replay on ${meta?.displayName ?? mapName}`}>
    {map}
    {momentPath && focus && <path ref={pathRef} d={momentPath} pathLength={1} fill="none" stroke={colour(focus.id)} strokeOpacity={.2}
      strokeWidth={1.4} strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />}
    {utility.map((m) => <circle key={m.id} cx={m.rx} cy={m.ry} r={m.r}
      fill={m.kind === "smoke" ? "var(--stage-smoke)" : m.kind === "molotov" ? "var(--stage-fire)" : "none"}
      stroke="var(--stage-text-2)" strokeWidth={u(1)} opacity={1 - Math.max(0,(m.u-.9)*10)} />)}
    {trail}
    {ordered.map((p) => marker(p))}
    {showLens && <g className="radar-lens" data-highlighted={highlighted} pointerEvents="none">
      <defs><clipPath id={clipId}><circle cx={cx} cy={cy} r={glassRadius} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        <circle cx={cx} cy={cy} r={glassRadius} fill="var(--stage)" />
        <g transform={`translate(${cx} ${cy}) scale(1.8) translate(${-cx} ${-cy})`}>
          {map}{trail}
          {shot && subject && opponent && <line x1={subject.rx} y1={subject.ry} x2={opponent.rx} y2={opponent.ry}
            stroke="var(--stage-text)" strokeWidth={u(1)} strokeDasharray={`${u(3)} ${u(4)}`} />}
          {ordered.filter((p) => p.id === focus?.id || participants.includes(p.id)).map((p) => marker(p, true))}
        </g>
      </g>
      <circle cx={cx} cy={cy} r={glassRadius} fill="none" stroke="var(--stage-text)" strokeWidth={u(2)} />
    </g>}
  </svg>;
}
