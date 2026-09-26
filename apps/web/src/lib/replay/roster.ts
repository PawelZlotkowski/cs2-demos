import type { ReplayEvent, ReplayPlayer } from "@/lib/contracts";

export type RosterLookup = (id: string | null | undefined) => ReplayPlayer | undefined;

/**
 * Resolve a player by SteamID64. Event actor/victim IDs currently arrive
 * float-rounded from the parser (…447 → …440), so fall back to comparing the
 * nearest double, which both spellings collapse to.
 */
export function makeRosterLookup(roster: ReplayPlayer[]): RosterLookup {
  const exact = new Map(roster.map((p) => [p.id, p]));
  const approx = new Map(roster.map((p) => [String(Number(p.id)), p]));
  return (id) => {
    if (!id) return undefined;
    return exact.get(id) ?? approx.get(String(Number(id)));
  };
}

/** Lanes follow the prototype: the followed player, their team, the other team. */
export type Lane = "you" | "team" | "enemy" | "bomb" | "util";

export const LANE_NAMES: Record<Lane, string> = {
  you: "You",
  team: "Team",
  enemy: "Enemy",
  bomb: "Bomb",
  util: "Utility",
};

export const LANE_ORDER: Lane[] = ["you", "team", "enemy", "bomb", "util"];

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
  /** Timeline glyph: d-kill, d-death, d-smoke, … */
  glyph: string;
  label: string;
};

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
      if (killer) out.push({ key: `${e.id}:k`, eventId: e.id, lane: killer, t: e.t, glyph: "kill", label: e.label });
      if (victim) out.push({ key: `${e.id}:d`, eventId: e.id, lane: victim, t: e.t, glyph: "death", label: e.label });
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
