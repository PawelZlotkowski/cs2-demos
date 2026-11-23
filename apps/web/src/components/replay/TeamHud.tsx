import type { ReplayPlayer, RoundStats, RoundSummary, Side } from "@/lib/contracts";
import { playerRoundScore } from "@/lib/replay/roster";
import type { InterpolatedPlayer } from "@/lib/replay/interpolate";

type Props = {
  roster: ReplayPlayer[];
  players: InterpolatedPlayer[];
  rounds: RoundSummary[];
  stats?: RoundStats[];
  round: number;
  selectedId?: string;
};

export function TeamHud({ roster, players, rounds, round, stats, selectedId }: Props) {
  const earlier = rounds.filter((r) => r.number < round);
  const currentSide = stats?.find((s) => s.round === round)?.side;
  const priorStats = stats?.filter((s) => s.round < round) ?? [];
  const score = playerRoundScore(priorStats);
  function tally(side: Side) {
    if (currentSide && !priorStats.length) return 0;
    if (currentSide && score) return score[currentSide === side ? 0 : 1];
    return earlier.every((r) => r.winner) ? earlier.filter((r) => r.winner === side).length : "–";
  }
  function slots(side: Side) {
    return <div className="hud-team" role="group" data-side={side} aria-label={side === "T" ? "Terrorists" : "Counter-terrorists"}>
      {roster.filter((p) => p.team === side).map((p) => {
        const sample = players.find((s) => s.id === p.id);
        const health = sample?.health;
        const label = `${p.name}, ${sample?.alive === false ? "eliminated" : health != null ? `${health} health` : "health unavailable"}`;
        return <div key={p.id} className="hud-slot" role="img" data-selected={p.id === selectedId} data-dead={sample?.alive === false} aria-label={label} title={label}>
          <span className="hud-name" aria-hidden="true">{p.name}</span>
          <span className="hud-hp" aria-hidden="true">{sample?.alive === false
            ? <svg width="12" height="12" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            : health ?? "–"}</span>
          {sample?.alive && health != null && <i aria-hidden="true"><b style={{ width: `${Math.max(0,Math.min(100,health))}%` }} /></i>}
        </div>;
      })}
    </div>;
  }
  return <div className="team-hud">
    {slots("T")}
    <div className="hud-score" aria-label={`Round ${round}, prior round wins by side`}>
      <b className="num" data-side="T">{tally("T")}</b>
      <span>Round<strong className="num">{round}</strong></span>
      <b className="num" data-side="CT">{tally("CT")}</b>
    </div>
    {slots("CT")}
  </div>;
}
