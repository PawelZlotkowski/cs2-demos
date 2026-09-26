import type { ReplaySample, SamplePlayerState } from "@/lib/contracts";
import { getMapMeta, worldToRadar } from "./maps";

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

/** Shortest-path yaw interpolation in degrees (−180…180). */
export function lerpYaw(a: number, b: number, u: number): number {
  let delta = ((b - a + 540) % 360) - 180;
  return a + delta * u;
}

export type InterpolatedPlayer = SamplePlayerState & {
  rx: number;
  ry: number;
};

function resolveRadar(
  p: SamplePlayerState,
  mapName?: string | null,
): { rx: number; ry: number } | null {
  if (p.rx != null && p.ry != null) return { rx: p.rx, ry: p.ry };
  if (!mapName) return null;
  const meta = getMapMeta(mapName);
  if (!meta) return null;
  return worldToRadar(p.x, p.y, meta);
}

export function samplesHaveRadarCoords(
  samples: ReplaySample[],
  mapName?: string | null,
): boolean {
  if (!samples.length) return false;
  if (getMapMeta(mapName ?? "")) return true;
  const first = samples[0]?.players[0];
  return first?.rx != null && first?.ry != null;
}

/**
 * Interpolate player states between samples at time t (seconds from round start).
 * Uses rx/ry when present; otherwise applies world→radar when map metadata exists.
 */
export function interpolateAt(
  samples: ReplaySample[],
  t: number,
  mapName?: string | null,
): InterpolatedPlayer[] {
  if (!samples.length) return [];

  const mapPlayer = (p: SamplePlayerState): InterpolatedPlayer | null => {
    const radar = resolveRadar(p, mapName);
    if (!radar) return null;
    return { ...p, rx: radar.rx, ry: radar.ry };
  };

  if (t <= samples[0].t) {
    return samples[0].players.map(mapPlayer).filter((p): p is InterpolatedPlayer => p != null);
  }
  const last = samples[samples.length - 1];
  if (t >= last.t) {
    return last.players.map(mapPlayer).filter((p): p is InterpolatedPlayer => p != null);
  }

  let i = 0;
  while (i < samples.length - 1 && samples[i + 1].t < t) i += 1;
  const a = samples[i];
  const b = samples[i + 1];
  const span = b.t - a.t || 1;
  const u = (t - a.t) / span;

  const byId = new Map(b.players.map((p) => [p.id, p]));
  const out: InterpolatedPlayer[] = [];
  for (const pa of a.players) {
    const pb = byId.get(pa.id) ?? pa;
    const ra = resolveRadar(pa, mapName);
    const rb = resolveRadar(pb, mapName);
    if (!ra || !rb) continue;
    out.push({
      id: pa.id,
      x: lerp(pa.x, pb.x, u),
      y: lerp(pa.y, pb.y, u),
      z: lerp(pa.z, pb.z, u),
      yaw: lerpYaw(pa.yaw, pb.yaw, u),
      health: Math.round(lerp(pa.health, pb.health, u)),
      alive: u < 0.5 ? pa.alive : pb.alive,
      rx: lerp(ra.rx, rb.rx, u),
      ry: lerp(ra.ry, rb.ry, u),
    });
  }
  return out;
}
