import type { Finding, ReplayEvent, ReplayPlayer, SelectedMoment } from "@/lib/contracts";
import type { RosterLookup } from "@/lib/replay/roster";

/** Short titles per detector template; summaries carry the numbers. */
const TITLES: Record<string, string> = {
  untraded_death: "Death not traded",
  dry_peek: "Dry peek",
  shot_while_moving: "Shot while moving",
  unused_utility: "Died with utility",
  team_flash: "Flashed a teammate",
  late_rotation: "Late rotation",
  economy_mismatch: "Buy out of step",
  "economy_mismatch.saved_on_buy": "Saved on a buy round",
  "economy_mismatch.forced_on_save": "Forced on a save round",
  "team_flash.self": "Flashed yourself",
  repeated_death_zone: "Same death spot",
  "opening_duel.won": "Won the opening duel",
  "opening_duel.lost": "Lost the opening duel",
  "good_plays.trade_kill": "Trade kill",
  "good_plays.multi_kill": "Multi-kill",
  "good_plays.clutch": "Clutch",
};

export function findingTitle(f: Pick<Finding, "template" | "detector">): string {
  const known = TITLES[f.template] ?? TITLES[f.detector];
  if (known) return known;
  const raw = (f.template.split(".").pop() ?? f.detector).replace(/_/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Rail and timeline glyph: orange triangle for a mistake, blue circle for a good play (decision 4). */
export function findingGlyph(kind: Finding["kind"] | SelectedMoment["kind"]): string {
  if (kind === "mistake") return "mistake";
  if (kind === "good") return "strength";
  return "note";
}

export const KIND_LABEL: Record<string, string> = {
  mistake: "Mistake",
  good: "Good play",
  context: "Context",
  pattern: "Pattern",
};

/** "[F2] Died to …" → the sentence without its citation prefix. */
export function stripCites(text: string): string {
  return text.replace(/\[(?:F\d+|m\d+|t:[\d.]+)\]\s*/g, "").trim();
}

export function momentTitle(m: SelectedMoment, byId: Map<string, Finding>): string {
  const lead = m.findingIds.map((id) => byId.get(id)).find(Boolean);
  return lead ? findingTitle(lead) : KIND_LABEL[m.kind];
}

/** Kills and deaths per player from the match's kill events. */
export function killDeaths(
  events: ReplayEvent[],
  roster: ReplayPlayer[],
  lookup: RosterLookup,
): Map<string, { k: number; d: number }> {
  const out = new Map(roster.map((p) => [p.id, { k: 0, d: 0 }]));
  for (const e of events) {
    if (e.type !== "kill") continue;
    const killer = lookup(e.actorId);
    const victim = lookup(e.victimId);
    if (killer && victim && killer.id !== victim.id && killer.team !== victim.team) {
      out.get(killer.id)!.k += 1;
    }
    if (victim) out.get(victim.id)!.d += 1;
  }
  return out;
}
