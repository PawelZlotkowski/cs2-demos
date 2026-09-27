"use client";

import type { Finding, ReplayEvent, RoundStats } from "@/lib/contracts";
import type { RosterLookup } from "@/lib/replay/roster";
import { typeLabel } from "@/lib/replay/roster";
import { formatClock } from "@/lib/replay/time";

const UTILITY = new Set(["smoke", "flash", "he", "molotov", "incendiary", "decoy"]);

type Props = {
  roundNumber: number;
  events: ReplayEvent[];
  stats?: RoundStats;
  findings: Finding[];
  focusId: string | null;
  focusName: string;
  lookup: RosterLookup;
  /** Seek the shared clock and select the event, so the radar shows it. */
  onSeek: (t: number, eventId?: string) => void;
};

/** Studio Round tab: the facts of the round from the parse and RoundStats, no model (doc 29 §3.1, R04). */
export function RoundPanel({ roundNumber, events, stats, findings, focusId, focusName, lookup, onSeek }: Props) {
  const duels = events.filter((e) => e.type === "kill" && focusId && (e.actorId === focusId || e.victimId === focusId));
  const thrown = events.filter((e) => UTILITY.has(e.type) && focusId && e.actorId === focusId);
  const economy = findings.filter((f) => f.detector === "economy_mismatch");

  const facts: [string, string][] = stats
    ? [
        ["Result", stats.won == null ? "Unknown" : stats.won ? "Won" : "Lost"],
        ["Side", stats.side ?? "Unknown"],
        ["K / D / A", `${stats.kills} / ${stats.deaths} / ${stats.assists}`],
        ["Damage", String(stats.damage)],
        ["Utility damage", String(stats.utilityDamage)],
        ["Enemies flashed", String(stats.enemiesFlashed)],
        ["Teammates flashed", String(stats.teammatesFlashed)],
        ["Opening duel", stats.openingKill ? "Won it" : stats.openingDeath ? "Lost it" : "Not in it"],
        ["Trade kills", String(stats.tradeKills)],
        [
          "Survived",
          stats.survived
            ? "Yes"
            : `No${stats.timeAliveS != null ? `, after ${formatClock(stats.timeAliveS)}` : ""}${stats.deathTraded ? ", traded" : stats.deathTraded === false ? ", not traded" : ""}`,
        ],
        ["Money at start", stats.moneyStart != null ? `$${stats.moneyStart}` : "Unknown"],
        ["Equipment value", stats.equipValue != null ? `$${stats.equipValue}` : "Unknown"],
      ]
    : [];

  return (
    <div className="round-tab" role="tabpanel" id="round-tab" aria-labelledby="tab-round">
      <h2 className="ins-head">Round {roundNumber} for {focusName}</h2>
      {facts.length ? (
        <dl className="round-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="num">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="meta">Pick a player to analyse and this tab fills with their numbers for the round.</p>
      )}

      <h3 className="round-h">Duels</h3>
      {duels.length ? (
        <ul className="round-list">
          {duels.map((e) => {
            const won = e.actorId === focusId;
            const other = lookup(won ? e.victimId : e.actorId);
            return (
              <li key={e.id}>
                <button type="button" onClick={() => onSeek(e.t, e.id)}>
                  <span className="num t">{formatClock(e.t)}</span>
                  <span className={won ? "duel-won" : "duel-lost"}>{won ? "Won" : "Lost"}</span>
                  <span className="round-what">
                    {won ? "Killed" : "Killed by"} {other?.name ?? "unknown"}
                  </span>
                  <span className="meta">{e.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="meta">No kills or deaths for {focusName} this round.</p>
      )}

      <h3 className="round-h">Utility thrown</h3>
      {thrown.length ? (
        <ul className="round-list">
          {thrown.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onSeek(e.t, e.id)}>
                <span className="num t">{formatClock(e.t)}</span>
                <span className="round-what">{typeLabel(e.type)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">No grenades thrown this round.</p>
      )}

      {economy.length ? (
        <>
          <h3 className="round-h">Buy</h3>
          {economy.map((f) => (
            <p key={f.id} className="round-note">
              {f.summary}
            </p>
          ))}
        </>
      ) : null}
    </div>
  );
}
