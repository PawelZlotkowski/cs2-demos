"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import type { ReplayPlayer } from "@/lib/contracts";

export type PickerPlayer = ReplayPlayer & { kills: number; deaths: number };

type Props = {
  players: PickerPlayer[];
  /** Player whose analysis is being started, if any. */
  busyId: string | null;
  onPick: (playerId: string) => void;
};

/** Last analysed player, so the viewer's own name is focused on the next demo. */
const LAST_KEY = "rr.player";

function lastPicked(): string | null {
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/**
 * Ten players in two teams, each a plain row: name and K/D. Arrow keys move
 * between rows, Enter or Space picks. No avatars or ranks: the demo has neither.
 */
export function PlayerPicker({ players, busyId, onPick }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Teams by side at mid-match; a team keeps its players across the half, so the grouping holds.
  const teams = useMemo(() => {
    const sides = (["CT", "T"] as const).map((side) =>
      players.filter((p) => p.team === side).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths),
    );
    return sides.filter((ps) => ps.length).map((ps, i) => ({ name: i === 0 ? "Team A" : "Team B", players: ps }));
  }, [players]);

  useEffect(() => {
    const last = lastPicked();
    const root = listRef.current;
    if (!root) return;
    const target =
      (last && root.querySelector<HTMLButtonElement>(`button[data-pid="${CSS.escape(last)}"]`)) ||
      root.querySelector<HTMLButtonElement>("button[data-pid]");
    target?.focus();
  }, [teams]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-pid]") ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : Math.max(0, Math.min(buttons.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
    buttons[next]?.focus();
    e.preventDefault();
  }

  function pick(id: string) {
    try {
      window.localStorage.setItem(LAST_KEY, id);
    } catch {
      /* per-viewer convenience only */
    }
    onPick(id);
  }

  const last = typeof window === "undefined" ? null : lastPicked();

  return (
    <div className="picker" ref={listRef} onKeyDown={onKeyDown}>
      {teams.map((team) => (
        <section key={team.name} className="pick-team" aria-label={team.name}>
          <h2>
            {team.name}
            <span>K / D</span>
          </h2>
          <ul>
            {team.players.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="pick-row"
                  data-pid={p.id}
                  disabled={busyId !== null}
                  aria-busy={busyId === p.id}
                  aria-label={`Analyse ${p.name}, ${p.kills} kills, ${p.deaths} deaths`}
                  onClick={() => pick(p.id)}
                >
                  <span className="pick-name">{p.name}</span>
                  {busyId === p.id ? (
                    <span className="pick-note">Starting…</span>
                  ) : p.id === last ? (
                    <span className="pick-note">Last picked</span>
                  ) : null}
                  <span className="pick-kd">
                    {p.kills} / {p.deaths}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
