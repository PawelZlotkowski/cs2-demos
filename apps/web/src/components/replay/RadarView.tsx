"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import type { InterpolatedPlayer } from "@/lib/replay/interpolate";
import type { ReplayPlayer } from "@/lib/contracts";
import { getMapMeta } from "@/lib/replay/maps";
import { roleOf, type RosterLookup } from "@/lib/replay/roster";
import { trailPoints, type Box, type Track, type UtilityMark } from "@/lib/replay/camera";
import { reducedMotion } from "@/lib/motion";

/* Radar language (28 Visual direction): you white, team slate, enemy red, as on the in-game radar.
   Orange and blue stay reserved for mistake and good play. */
const YOU = "#FFFFFF";
const ENEMY = "#FF5F73";
const TEAM = "#B9C4CE";
const STX = "#EEF1F3";
const HALO = "rgba(8,10,12,.82)";
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
}: Props) {
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
    if (!el || reducedMotion()) return;
    const tween = gsap.fromTo(
      el,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 0.42, ease: "power2.out", clearProps: "strokeDashoffset" },
    );
    return () => {
      tween.kill();
    };
  }, [moment?.id]);

  // Draw the followed player last so they sit on top.
  const ordered = [...players].sort(
    (a, b) => Number(a.id === focus?.id) - Number(b.id === focus?.id),
  );

  return (
    <svg
      className="radar"
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Radar replay on ${meta?.displayName ?? mapName}`}
    >
      {meta?.radarImage ? (
        <image className="radar-map" href={meta.radarImage} width={size} height={size} />
      ) : (
        <rect width={size} height={size} fill="#1a1f24" />
      )}

      {momentPath ? (
        <path
          ref={pathRef}
          d={momentPath}
          pathLength={1}
          fill="none"
          stroke={YOU}
          strokeOpacity={0.34}
          strokeWidth={1.5}
          strokeDasharray="1 1"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      <g>
        {utility.map((m) =>
          m.kind === "smoke" ? (
            <circle
              key={m.id}
              cx={m.rx}
              cy={m.ry}
              r={m.r}
              fill="rgba(210,214,218,.38)"
              stroke="rgba(238,241,243,.8)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              opacity={m.u > 0.9 ? (1 - m.u) * 10 : 1}
            />
          ) : m.kind === "molotov" ? (
            <circle
              key={m.id}
              cx={m.rx}
              cy={m.ry}
              r={m.r}
              fill="rgba(238,241,243,.08)"
              stroke="rgba(238,241,243,.7)"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <circle
              key={m.id}
              cx={m.rx}
              cy={m.ry}
              r={m.r * (0.4 + m.u * 0.6)}
              fill="none"
              stroke={STX}
              strokeWidth={1.4}
              vectorEffect="non-scaling-stroke"
              opacity={1 - m.u}
            />
          ),
        )}
      </g>

      <g>
        {ordered.map((p) => {
          const info = lookup(p.id);
          const role = roleOf(info, focus) ?? "team";
          const you = role === "you";
          const col = you ? YOU : role === "team" ? TEAM : ENEMY;
          const track = tracks.get(p.id);
          const a = (-p.yaw * Math.PI) / 180;
          const L = u(you ? 30 : 12);
          const w = 0.4;
          return (
            <g key={p.id} opacity={p.alive ? 1 : 0.55}>
              {track && p.alive ? (
                <polyline
                  points={trailPoints(track, t - TRAIL_SEC, t, p)}
                  fill="none"
                  stroke={col}
                  strokeOpacity={you ? 0.9 : 0.45}
                  strokeWidth={you ? 2 : 1.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {p.alive && you ? (
                <path
                  d={`M${p.rx} ${p.ry}L${p.rx + Math.cos(a - w) * L} ${p.ry + Math.sin(a - w) * L}A${L} ${L} 0 0 1 ${p.rx + Math.cos(a + w) * L} ${p.ry + Math.sin(a + w) * L}Z`}
                  fill="rgba(255,255,255,.16)"
                  stroke="rgba(255,255,255,.35)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {p.alive && !you ? (
                <line
                  x1={p.rx}
                  y1={p.ry}
                  x2={p.rx + Math.cos(a) * L}
                  y2={p.ry + Math.sin(a) * L}
                  stroke={col}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {p.alive ? (
                <circle
                  cx={p.rx}
                  cy={p.ry}
                  r={u(you ? 5.5 : 4.2)}
                  fill={col}
                  stroke={HALO}
                  strokeWidth={you ? 2.5 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <path
                  d="M-1 -1L1 1M1 -1L-1 1"
                  transform={`translate(${p.rx} ${p.ry}) scale(${u(4.5)})`}
                  stroke={col}
                  strokeWidth={2}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <text
                className="radar-name"
                x={p.rx + u(9)}
                y={p.ry - u(7)}
                fill={you ? YOU : role === "enemy" ? "#FF9AA8" : "#C9D2DA"}
                fontSize={u(11)}
                paintOrder="stroke"
                stroke={HALO}
                strokeWidth={u(3)}
              >
                {info?.name ?? p.id.slice(-4)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
