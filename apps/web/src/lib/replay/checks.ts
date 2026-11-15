import { tickToSeconds, secondsToTick } from "./time";
import { lerpYaw, interpolateAt } from "./interpolate";
import type { ReplaySample } from "@/lib/contracts";
import type { RoundStats } from "@/lib/contracts";

/** A neutral score uses the match's initial CT/T lineup; selected stats use the player's side. */
export function scorePerspectivePhrase(
  score: string,
  rounds?: readonly Pick<RoundStats, "won">[],
): string {
  if (rounds) {
    const wins = rounds.filter((round) => round.won === true).length;
    const losses = rounds.filter((round) => round.won === false).length;
    const unknown = rounds.length - wins - losses;
    const result = wins + losses === 0
      ? "Result unavailable"
      : wins === losses
        ? `Drew ${wins} to ${losses}`
        : wins > losses
          ? `Won ${wins} to ${losses}`
          : `Lost ${wins} to ${losses}`;
    return unknown ? `${result}, ${unknown} round${unknown === 1 ? "" : "s"} unknown` : result;
  }

  const match = score.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!match) return score && score !== "–" ? `Initial CT lineup: ${score}` : "Initial CT lineup score unavailable";
  return `Initial CT lineup: CT ${Number(match[1])} — T ${Number(match[2])}`;
}

/** Callable checks for seek / interpolation / tick conversion. */
export function runReplayUnitChecks(): { ok: true } {
  if (tickToSeconds(128, 0, 64) !== 2) throw new Error("tickToSeconds");
  if (secondsToTick(2, 0, 64) !== 128) throw new Error("secondsToTick");
  if (scorePerspectivePhrase("11–13") !== "Initial CT lineup: CT 11 — T 13") {
    throw new Error("neutral score must name initial CT/T lineup");
  }
  if (
    scorePerspectivePhrase("11–13", [{ won: true }, { won: false }, { won: null }]) !==
    "Drew 1 to 1, 1 round unknown"
  ) {
    throw new Error("selected-player score must count unknown rounds explicitly");
  }

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

  const discrete: ReplaySample[] = [
    {
      tick: 0,
      t: 0,
      players: [{ id: "1", x: 0, y: 0, z: 0, yaw: 0, health: 100, alive: true, rx: 0, ry: 0 }],
    },
    {
      tick: 8,
      t: 1,
      players: [{ id: "1", x: 8, y: 8, z: 0, yaw: 0, health: 0, alive: false, rx: 8, ry: 8 }],
    },
  ];
  const beforeDeath = interpolateAt(discrete, 0.5);
  if (beforeDeath[0].health !== 100 || !beforeDeath[0].alive) {
    throw new Error("HP/alive should hold the prior sample between ticks");
  }
  const deathEvent = {
    id: "kill-6",
    type: "kill",
    tick: 6,
    t: 0.75,
    label: "Player killed",
    victimId: "1",
  };
  const beforeEvent = interpolateAt(discrete, 0.75 - 1e-4, undefined, [deathEvent]);
  if (!beforeEvent[0].alive || beforeEvent[0].health !== 100) {
    throw new Error("player should remain alive before the kill tick");
  }
  const atEvent = interpolateAt(discrete, 0.75, undefined, [deathEvent]);
  if (atEvent[0].alive || atEvent[0].health !== 0) {
    throw new Error("kill event should change discrete state at its exact time");
  }
  const atSample = interpolateAt(discrete, 1);
  if (atSample[0].alive || atSample[0].health !== 0) {
    throw new Error("sampled discrete state should take effect at the sample time");
  }

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
