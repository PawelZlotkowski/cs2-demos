"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ReplayPlayer } from "@/lib/contracts";

export type PickerPlayer = ReplayPlayer & { kills?: number; deaths?: number };
type Props = {
  players: PickerPlayer[];
  busyId: string | null;
  selectedId: string | null;
  onPick: (playerId: string) => void;
};

const LAST_KEY = "rr.player";

export function PlayerPicker({ players, busyId, selectedId, onPick }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => {
    let last: string | null = null;
    try { last = window.localStorage.getItem(LAST_KEY); } catch { /* Storage can be disabled. */ }
    setLastId(last);
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("[data-pid]") ?? []);
    const first = buttons.find((b) => b.dataset.pid === last) ?? buttons[0];
    if (document.activeElement === document.body) first?.focus({ preventScroll: true });
  }, []);

  function move(e: KeyboardEvent<HTMLDivElement>) {
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-pid]:enabled"));
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    let next = index;
    switch (e.key) {
      case "Home": next = 0; break;
      case "End": next = rows.length - 1; break;
      case "ArrowUp": next = Math.max(0, index - 1); break;
      case "ArrowDown": next = Math.min(rows.length - 1, index + 1); break;
      default: return;
    }
    e.preventDefault();
    rows[next].focus();
  }

  function pick(id: string) {
    try { window.localStorage.setItem(LAST_KEY, id); } catch { /* The choice still works for this review. */ }
    setLastId(id);
    onPick(id);
  }

  return <div className="setup-roster" ref={list} onKeyDown={move}>
    {(["T", "CT"] as const).map((side) => {
      const team = players.filter((p) => p.team === side).sort((a, b) =>
        (b.kills ?? 0) - (a.kills ?? 0) || (a.deaths ?? 0) - (b.deaths ?? 0));
      return <section key={side} className="setup-team" data-side={side} aria-labelledby={`setup-${side}`}>
        <h2 id={`setup-${side}`}><i className="team-dot" aria-hidden="true" />Started {side}</h2>
        {team.length ? <ul>{team.map((p) => (
          <li key={p.id}>
            <button type="button" className="player-choice" data-pid={p.id} disabled={busyId !== null}
              aria-busy={busyId === p.id} aria-pressed={selectedId === p.id}
              aria-label={`Select ${p.name}${p.kills !== undefined ? `, ${p.kills} kills, ${p.deaths} deaths` : ""}`}
              onClick={() => pick(p.id)} title={p.name}>
              <span className="player-bead" aria-hidden="true">{Array.from(p.name.trim())[0]?.toUpperCase()}</span>
              <strong>{p.name}</strong>
              {p.kills !== undefined && <span className="player-kd" title="Kills / deaths">{p.kills} / {p.deaths}</span>}
              {selectedId === p.id ? <span className="player-check" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 8.3l2.3 2.3 4.7-5.2" /></svg>
              </span> :
                !selectedId && lastId === p.id ? <small>Last picked</small> : null}
            </button>
          </li>
        ))}</ul> : <p className="meta">No players on this side.</p>}
      </section>;
    })}
  </div>;
}
