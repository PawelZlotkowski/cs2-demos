import { tickToSeconds, secondsToTick } from "./time";
import { lerpYaw, interpolateAt } from "./interpolate";
import type { ReplaySample } from "@/lib/contracts";

/** Callable checks for seek / interpolation / tick conversion. */
export function runReplayUnitChecks(): { ok: true } {
  if (tickToSeconds(128, 0, 64) !== 2) throw new Error("tickToSeconds");
  if (secondsToTick(2, 0, 64) !== 128) throw new Error("secondsToTick");

  const yaw = lerpYaw(0, 90, 0.5);
  if (Math.abs(yaw - 45) > 1e-6) throw new Error(`lerpYaw got ${yaw}`);

  const samples: ReplaySample[] = [
    {
      tick: 0,
      t: 0,
      players: [
        { id: "1", x: 0, y: 0, z: 0, yaw: 0, health: 100, alive: true, rx: 10, ry: 20 },
      ],
    },
    {
      tick: 8,
      t: 1,
      players: [
        { id: "1", x: 100, y: 100, z: 0, yaw: 90, health: 100, alive: true, rx: 30, ry: 40 },
      ],
    },
  ];
  const mid = interpolateAt(samples, 0.5);
  if (mid.length !== 1) throw new Error("interp length");
  if (mid[0].rx !== 20 || mid[0].ry !== 30) throw new Error("interp pos");
  if (mid[0].yaw !== 45) throw new Error("interp yaw");

  // Without rx/ry and without map meta, coords are unavailable (do not invent transforms).
  const bare: ReplaySample[] = [
    {
      tick: 0,
      t: 0,
      players: [{ id: "1", x: 0, y: 0, z: 0, yaw: 0, health: 100, alive: true }],
    },
  ];
  if (interpolateAt(bare, 0, "de_inferno").length !== 0) {
    throw new Error("expected no radar without metadata");
  }

  // Anubis overview meta must place world coords into radar space.
  const anubis: ReplaySample[] = [
    {
      tick: 0,
      t: 0,
      players: [
        {
          id: "1",
          x: -476,
          y: 2216,
          z: 0,
          yaw: 0,
          health: 100,
          alive: true,
        },
      ],
    },
  ];
  const anubisDots = interpolateAt(anubis, 0, "de_anubis");
  if (anubisDots.length !== 1) throw new Error("anubis interp length");
  if (!(anubisDots[0].rx > 0 && anubisDots[0].rx < 1024)) {
    throw new Error(`anubis rx out of range: ${anubisDots[0].rx}`);
  }
  if (!(anubisDots[0].ry > 0 && anubisDots[0].ry < 1024)) {
    throw new Error(`anubis ry out of range: ${anubisDots[0].ry}`);
  }

  return { ok: true };
}
