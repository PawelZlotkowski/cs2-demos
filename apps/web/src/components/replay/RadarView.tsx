"use client";

import type { InterpolatedPlayer } from "@/lib/replay/interpolate";
import type { ReplayPlayer } from "@/lib/contracts";
import { getMapMeta } from "@/lib/replay/maps";
import { roleOf, type RosterLookup } from "@/lib/replay/roster";
import { trailPoints, type Box, type Track, type UtilityMark } from "@/lib/replay/camera";

const POS = "#8FA9FF";
const NEG = "#F28C4C";
const TEAM = "#9AA4AE";
const STX = "#EEF1F3";
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
};

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
}: Props) {
  const meta = getMapMeta(mapName);
  const size = meta?.radarSize ?? 1024;
  const u = (px: number) => px / Math.max(pxPerUnit, 0.01);
  const vb = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

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
        <image href={meta.radarImage} width={size} height={size} opacity={0.82} />
      ) : (
        <rect width={size} height={size} fill="#20272d" />
      )}

      <g>
        {utility.map((m) =>
          m.kind === "smoke" ? (
            <circle
              key={m.id}
              cx={m.rx}
              cy={m.ry}
              r={m.r}
              fill="rgba(210,214,218,.42)"
              stroke="rgba(238,241,243,.85)"
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
          const col = role === "you" ? POS : role === "team" ? TEAM : NEG;
          const track = tracks.get(p.id);
          const a = (-p.yaw * Math.PI) / 180;
          const L = u(role === "you" ? 26 : 11);
          const w = 0.42;
          return (
            <g key={p.id} opacity={p.alive ? 1 : 0.5}>
              {track && p.alive ? (
                <polyline
                  points={trailPoints(track, t - TRAIL_SEC, t, p)}
                  fill="none"
                  stroke={col}
                  strokeOpacity={role === "you" ? 0.95 : 0.5}
                  strokeWidth={role === "you" ? 2 : 1.2}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {p.alive && role === "you" ? (
                <path
                  d={`M${p.rx} ${p.ry}L${p.rx + Math.cos(a - w) * L} ${p.ry + Math.sin(a - w) * L}A${L} ${L} 0 0 1 ${p.rx + Math.cos(a + w) * L} ${p.ry + Math.sin(a + w) * L}Z`}
                  fill="rgba(143,169,255,.22)"
                />
              ) : null}
              {p.alive && role !== "you" ? (
                <line
                  x1={p.rx}
                  y1={p.ry}
                  x2={p.rx + Math.cos(a) * L}
                  y2={p.ry + Math.sin(a) * L}
                  stroke={col}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {p.alive ? (
                <circle
                  cx={p.rx}
                  cy={p.ry}
                  r={u(role === "you" ? 5 : 4)}
                  fill={role === "you" ? "#FFFFFF" : col}
                  stroke={role === "you" ? POS : "none"}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <path
                  d="M-1 -1L1 1M1 -1L-1 1"
                  transform={`translate(${p.rx} ${p.ry}) scale(${u(4.5)})`}
                  stroke={role === "enemy" ? NEG : STX}
                  strokeWidth={1.8}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <text
                x={p.rx + u(8)}
                y={p.ry - u(6)}
                fill={role === "enemy" ? "#F4A274" : "#C3CAD1"}
                fontSize={u(11)}
                fontFamily="Hanken Grotesk, sans-serif"
                fontWeight={600}
                paintOrder="stroke"
                stroke="rgba(10,12,14,.7)"
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
