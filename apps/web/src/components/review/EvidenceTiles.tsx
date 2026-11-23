import type { Finding } from "@/lib/contracts";

const metrics: Record<string, [label: string, unit?: string]> = {
  speedUps: ["Speed while firing", "u/s"],
  movingShots: ["Shots while moving"],
  shots: ["Shots fired"],
  accurateSpeedUps: ["Accurate speed threshold", "u/s"],
  grenadesUnused: ["Grenades unused"],
  timeAliveS: ["Time alive", "s"],
  diedWithinS: ["Death window", "s"],
  tradeWindowS: ["Trade window", "s"],
  nearestTeammateM: ["Nearest teammate", "m"],
  distanceM: ["Duel distance", "m"],
  longestBlindS: ["Longest flash", "s"],
  spanS: ["Time between kills", "s"],
  tradeTimeS: ["Time to trade", "s"],
  killsInClutch: ["Clutch kills"],
  victimName: ["Victim"],
  killerName: ["Killed by"],
  opponentName: ["Opponent"],
  teammateName: ["Teammate"],
  tradedName: ["Teammate traded"],
};

/** Detector bookkeeping, or a repeat of the moment's title ("play"), not evidence for a player. */
const HIDDEN = new Set(["play", "thresholdPolicy", "opportunityStatus", "assessment", "visibility"]);

/** "entry_kill" → "Entry kill", "lost" → "Lost"; player names (keys ending in Name) stay as written. */
function show(key: string, value: string | number) {
  if (typeof value !== "string" || key.endsWith("Name")) return value;
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function evidenceRows(finding: Finding) {
  const keys = [...new Set([...Object.keys(metrics), ...Object.keys(finding.evidence)])];
  return keys.flatMap((key) => {
    const value = finding.evidence[key];
    if (value == null || value === "" || HIDDEN.has(key)) return [];
    const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase();
    const [label, unit] = metrics[key] ?? [words.charAt(0).toUpperCase() + words.slice(1)];
    return [{ finding, key, value: show(key, value), label, unit }];
  });
}

type Props = {
  finding: Finding;
  related: Finding[];
  highlightedId: string | null;
  onSeek: (finding: Finding) => void;
};

export function EvidenceTiles({ finding, related, highlightedId, onSeek }: Props) {
  const all = [...evidenceRows(finding), ...related.filter((f) => f.id !== finding.id).flatMap(evidenceRows)];
  // One tile per value (the victim and the duel opponent are often the same player), and the
  // measured numbers first: they are the evidence, names and outcomes fill in after them
  const rows = all
    .filter((row, i) => typeof row.value === "number" || all.findIndex((r) => r.value === row.value) === i)
    .sort((a, b) => Number(typeof a.value !== "number") - Number(typeof b.value !== "number"))
    .slice(0, 4);
  if (!rows.length) return null;
  return <div className="evidence-tiles" aria-label="Moment evidence">
    {rows.map((row) => (
      <button key={row.finding.id + row.key} type="button" data-highlighted={highlightedId === row.finding.id}
        onClick={() => onSeek(row.finding)} title={`Seek to ${row.finding.id}`}>
        <strong className="num" data-text={typeof row.value === "string"}>{row.value}{row.unit && <small> {row.unit}</small>}</strong>
        <span>{row.label}</span>
      </button>
    ))}
  </div>;
}
