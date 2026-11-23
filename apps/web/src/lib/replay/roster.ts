import type { ReplayEvent, ReplayPlayer, ReplaySample, RoundStats } from "@/lib/contracts";

/** Competitive rounds in the selected player's review exclude warm-up and knife rounds. */
export function playerRoundScore(stats: RoundStats[]): [number, number] | null {
  if (!stats.length || stats.some((r) => r.won == null)) return null;
  const wins = stats.filter((r) => r.won).length;
  return [wins, stats.length - wins];
}

export type MatchRating = { rating: number; kpr: number; dpr: number; adr: number; kast: number };

/**
 * One overall number for the coached player's match: the community approximation of
 * HLTV Rating 2.0 (1.00 is an average performance), computed from the per-round stats.
 */
export function matchRating(stats: RoundStats[]): MatchRating | null {
  const n = stats.length;
  if (!n) return null;
  const per = (f: (r: RoundStats) => number) => stats.reduce((a, r) => a + f(r), 0) / n;
  const kpr = per((r) => r.kills);
  const dpr = per((r) => r.deaths);
  const apr = per((r) => r.assists);
  const adr = per((r) => r.damage);
  const kast = 100 * per((r) => Number(r.kills > 0 || r.assists > 0 || r.survived || r.deathTraded === true));
  const impact = 2.13 * kpr + 0.42 * apr - 0.41;
  const rating = 0.0073 * kast + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587;
  return { rating, kpr, dpr, adr, kast };
}

export type RosterLookup = (id: string | null | undefined) => ReplayPlayer | undefined;

/**
 * Resolve a player by SteamID64. Event actor/victim IDs currently arrive
 * float-rounded from the parser (…447 → …440), so fall back to comparing the
 * nearest double, which both spellings collapse to.
 */
export function makeRosterLookup(roster: ReplayPlayer[]): RosterLookup {
  const exact = new Map(roster.map((p) => [p.id, p]));
  // Numeric ids only: a non-numeric id ("p3" on a shared link) would collapse to "NaN"
  const approx = new Map(roster.filter((p) => /^\d+$/.test(p.id)).map((p) => [String(Number(p.id)), p]));
  return (id) => {
    if (!id) return undefined;
    return exact.get(id) ?? approx.get(String(Number(id)));
  };
}

/**
 * Lanes (28 Visual direction): coach findings, the fight (players alive per side, kills as ticks),
 * the bomb and utility. Kills live on one lane so the round reads as a sequence of trades.
 */
export type Lane = "coach" | "fight" | "bomb" | "util";

export const LANE_NAMES: Record<Lane, string> = {
  coach: "Coach",
  fight: "Fight",
  bomb: "Bomb",
  util: "Utility",
};

export const LANE_ORDER: Lane[] = ["coach", "fight", "bomb", "util"];

export function roleOf(
  player: ReplayPlayer | undefined,
  focus: ReplayPlayer | undefined,
): "you" | "team" | "enemy" | null {
  if (!player) return null;
  if (focus && player.id === focus.id) return "you";
  if (!focus) return player.team === "CT" ? "team" : "enemy";
  return player.team === focus.team ? "team" : "enemy";
}

export type LaneMark = {
  key: string;
  eventId: string;
  lane: Lane;
  t: number;
  /** Timeline glyph: d-kill, d-death, d-smoke, …; on the Coach lane g-mistake or g-strength */
  glyph: string;
  label: string;
  /** Coach lane: the finding's one-line summary for the tooltip. */
  detail?: string;
  /** Coach lane: which marker leads when several share a spot (higher first). */
  priority?: number;
  /** Fight lane: whose player died ("us" = the followed player's team), and whether the followed player took part. */
  side?: "us" | "them";
  you?: boolean;
};

/** Step changes measured in this round's replay samples, grouped by the side played. */
export type AliveStep = { t: number; T: number; CT: number };

export function aliveSteps(samples: ReplaySample[], lookup: RosterLookup): AliveStep[] {
  const out: AliveStep[] = [];
  for (const sample of samples) {
    if (!sample.players.length) continue;
    const step = { t: sample.t, T: 0, CT: 0 };
    for (const p of sample.players) {
      const side = lookup(p.id)?.team;
      if (side && p.alive) step[side]++;
    }
    const last = out[out.length - 1];
    if (!last || step.T !== last.T || step.CT !== last.CT) out.push(step);
  }
  return out;
}

const UTIL_TYPES = new Set(["smoke", "flash", "he", "molotov", "incendiary", "decoy"]);

/** Turn replay events into lane markers. A kill marks the killer's lane and the victim's. */
export function laneMarks(
  events: ReplayEvent[],
  lookup: RosterLookup,
  focus: ReplayPlayer | undefined,
): LaneMark[] {
  const out: LaneMark[] = [];
  for (const e of events) {
    if (e.type === "round_start" || e.type === "round_end") continue;
    if (e.type === "kill") {
      const killer = roleOf(lookup(e.actorId), focus);
      const victim = roleOf(lookup(e.victimId), focus);
      out.push({
        key: e.id,
        eventId: e.id,
        lane: "fight",
        t: e.t,
        glyph: victim === "enemy" ? "kill" : "death",
        label: e.label,
        side: victim === "enemy" ? "them" : "us",
        you: killer === "you" || victim === "you",
      });
      continue;
    }
    if (e.type === "plant" || e.type === "defuse" || e.type.startsWith("bomb")) {
      out.push({ key: e.id, eventId: e.id, lane: "bomb", t: e.t, glyph: e.type === "defuse" ? "defuse" : "plant", label: eventTitle(e, lookup) });
      continue;
    }
    if (UTIL_TYPES.has(e.type)) {
      const glyph = e.type === "incendiary" ? "molotov" : e.type === "decoy" ? "move" : e.type;
      out.push({ key: e.id, eventId: e.id, lane: "util", t: e.t, glyph, label: eventTitle(e, lookup) });
      continue;
    }
    out.push({ key: e.id, eventId: e.id, lane: "util", t: e.t, glyph: "move", label: e.label });
  }
  return out;
}

export function glyphForEvent(type: string): string {
  if (type === "kill") return "kill";
  if (type === "defuse") return "defuse";
  if (type === "plant" || type.startsWith("bomb")) return "plant";
  if (type === "incendiary") return "molotov";
  if (["smoke", "flash", "he", "molotov"].includes(type)) return type;
  return "move";
}

const TYPE_LABELS: Record<string, string> = {
  kill: "Kill",
  plant: "Plant",
  defuse: "Defuse",
  smoke: "Smoke",
  flash: "Flash",
  he: "HE grenade",
  molotov: "Molotov",
  incendiary: "Incendiary",
  decoy: "Decoy",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

const REASONS: Record<string, string> = {
  ct_killed: "CTs eliminated",
  t_killed: "Ts eliminated",
  bomb_defused: "Bomb defused",
  bomb_exploded: "Bomb exploded",
  target_saved: "Time ran out",
  target_bombed: "Bomb exploded",
};

export function reasonLabel(reason?: string | null): string {
  if (!reason) return "Result unknown";
  return REASONS[reason] ?? reason.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Kill labels already name both players; everything else gets its thrower or planter. */
export function eventTitle(e: ReplayEvent, lookup: RosterLookup): string {
  if (e.type === "kill") return e.label;
  const actor = lookup(e.actorId);
  return actor ? `${e.label} by ${actor.name}` : e.label;
}
