import type { Finding, FindingKind, SelectedMoment } from "@/lib/contracts";

/**
 * Short shared label per finding template: the rail title, the Coach-lane
 * marker and the panel header all use it (08 Timeline, linked state).
 */
const LABELS: Record<string, string> = {
  untraded_death: "Untraded death",
  shot_while_moving: "Shot while moving",
  unused_utility: "Unused utility",
  dry_peek: "Dry peek",
  team_flash: "Team flash",
  "team_flash.self": "Flashed self",
  "opening_duel.won": "Opening duel won",
  "opening_duel.lost": "Opening duel lost",
  "economy_mismatch.saved_on_buy": "Saved on a buy round",
  "economy_mismatch.forced_on_save": "Forced on a save round",
  late_rotation: "Late rotation",
  repeated_death_zone: "Same death spot",
  "good_plays.trade_kill": "Trade kill",
  "good_plays.entry_kill": "Entry kill",
  "good_plays.multi_kill": "Multi-kill",
  "good_plays.clutch": "Clutch",
  "good_plays.flash_assist": "Flash assist",
  "good_plays.utility_damage": "Utility damage",
};

export function findingLabel(f: Pick<Finding, "template" | "detector">): string {
  const key = f.template || f.detector;
  return (
    LABELS[key] ??
    LABELS[key.split(".")[0]] ??
    LABELS[f.detector] ??
    f.detector.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

/** Rail and lane glyph: orange triangle for a mistake, blue circle for a good play (decision 4). */
export function kindGlyph(kind: FindingKind | SelectedMoment["kind"]): "mistake" | "strength" | "note" {
  if (kind === "mistake") return "mistake";
  if (kind === "good") return "strength";
  return "note";
}

export function kindLabel(kind: FindingKind | SelectedMoment["kind"]): string {
  if (kind === "mistake") return "Mistake";
  if (kind === "good") return "Good play";
  if (kind === "pattern") return "Pattern";
  return "Context";
}

/** The finding a moment is about: the first id is the lead (ranker contract). */
export function leadFinding(
  m: SelectedMoment,
  byId: ReadonlyMap<string, Finding>,
): Finding | undefined {
  return m.findingIds.map((id) => byId.get(id)).find(Boolean);
}

export type CitedPart = { text: string } | { cite: string };

/** Split "[F12] Died to …" into text and citation tokens, which the panel turns into seek links. */
export function splitCitations(text: string): CitedPart[] {
  const out: CitedPart[] = [];
  const re = /\[(F\d+)\]/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ cite: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** "Picked because" without the leading citation, sentence-cased for the prose line. */
export function pickedBecause(m: SelectedMoment): string {
  const text = m.pickedBecause.replace(/^\s*\[F\d+\]\s*/, "").trim();
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}
