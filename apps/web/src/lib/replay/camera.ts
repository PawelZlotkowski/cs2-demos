import type { ReplayEvent, ReplaySample } from "@/lib/contracts";
import { getMapMeta, worldToRadar } from "./maps";

export type Box = { x: number; y: number; w: number; h: number };

/** Radar-space positions per player, for trails. Arrays are parallel and sorted by t. */
export type Track = { t: number[]; rx: number[]; ry: number[]; alive: boolean[] };

export function buildTracks(samples: ReplaySample[], mapName: string): Map<string, Track> {
  const meta = getMapMeta(mapName);
  const tracks = new Map<string, Track>();
  for (const s of samples) {
    for (const p of s.players) {
      const r =
        p.rx != null && p.ry != null
          ? { rx: p.rx, ry: p.ry }
          : meta
            ? worldToRadar(p.x, p.y, meta)
            : null;
      if (!r) continue;
      let tr = tracks.get(p.id);
      if (!tr) {
        tr = { t: [], rx: [], ry: [], alive: [] };
        tracks.set(p.id, tr);
      }
      tr.t.push(s.t);
      tr.rx.push(r.rx);
      tr.ry.push(r.ry);
      tr.alive.push(p.alive);
    }
  }
  return tracks;
}

/** Points travelled in [t0, t1] while alive, ending at the current position. */
export function trailPoints(
  tr: Track,
  t0: number,
  t1: number,
  now: { rx: number; ry: number },
): string {
  const pts: string[] = [];
  for (let i = 0; i < tr.t.length; i += 1) {
    const t = tr.t[i];
    if (t < t0) continue;
    if (t >= t1) break;
    if (!tr.alive[i]) break;
    pts.push(`${tr.rx[i].toFixed(1)},${tr.ry[i].toFixed(1)}`);
  }
  pts.push(`${now.rx.toFixed(1)},${now.ry.toFixed(1)}`);
  return pts.join(" ");
}

/** Where the round happened: every live position, padded. */
export function roundBounds(tracks: Map<string, Track>, pad = 48): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const tr of tracks.values()) {
    for (let i = 0; i < tr.t.length; i += 1) {
      if (!tr.alive[i]) continue;
      x0 = Math.min(x0, tr.rx[i]);
      x1 = Math.max(x1, tr.rx[i]);
      y0 = Math.min(y0, tr.ry[i]);
      y1 = Math.max(y1, tr.ry[i]);
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/** Expand a box to the stage's aspect ratio (prototype aspectBox). */
export function aspectBox(b: Box, aspect: number, minW = 240): Box {
  let { x, y, w, h } = b;
  w = Math.max(w, minW);
  h = Math.max(h, minW / aspect);
  if (w / h < aspect) {
    const nw = h * aspect;
    x -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = w / aspect;
    y -= (nh - h) / 2;
    h = nh;
  }
  return { x, y, w, h };
}

export type UtilityMark = {
  id: string;
  kind: "smoke" | "molotov" | "burst";
  rx: number;
  ry: number;
  /** Radius in radar units. */
  r: number;
  /** 0…1 through its lifetime, for fading. */
  u: number;
};

const LIFETIME: Record<string, number> = { smoke: 18, molotov: 7, incendiary: 7, he: 0.8, flash: 0.8 };
const RADIUS_WORLD: Record<string, number> = { smoke: 144, molotov: 120, incendiary: 120, he: 90, flash: 60 };

/** Utility that is on the map at time t. */
export function activeUtility(events: ReplayEvent[], t: number, mapName: string): UtilityMark[] {
  const meta = getMapMeta(mapName);
  if (!meta) return [];
  const out: UtilityMark[] = [];
  for (const e of events) {
    const life = LIFETIME[e.type];
    if (!life || !e.pos || t < e.t || t > e.t + life) continue;
    const { rx, ry } = worldToRadar(e.pos.x, e.pos.y, meta);
    const kind = e.type === "smoke" ? "smoke" : e.type === "molotov" || e.type === "incendiary" ? "molotov" : "burst";
    out.push({ id: e.id, kind, rx, ry, r: RADIUS_WORLD[e.type] / meta.scale, u: (t - e.t) / life });
  }
  return out;
}
