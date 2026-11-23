"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { CoachedPlayer } from "@/lib/contracts";

const PLAYER_KEY = "rr.coachPlayer";

/** The coached players and the one picked (shared by the Coach, Matches and Progress pages). */
export function useCoachedPlayer() {
  const [players, setPlayers] = useState<CoachedPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    // The API lists only the signed-in user's players; "me" is their linked Steam account or
    // the player they review most (A11), used until they pick another here
    Promise.all([api.getPlayers(), api.myPlayer().catch(() => null)])
      .then(([ps, me]) => {
        if (!live) return;
        setPlayers(ps);
        let saved: string | null = null;
        try {
          saved = window.localStorage.getItem(PLAYER_KEY);
        } catch {
          /* storage blocked */
        }
        const find = (id: string | null | undefined) => ps.find((p) => p.id === id)?.id;
        setPlayerId(find(saved) ?? find(me?.playerId) ?? ps[0]?.id ?? null);
      })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "The API did not answer."); });
    return () => { live = false; };
  }, [attempt]);

  function pick(id: string) {
    setPlayerId(id);
    try {
      window.localStorage.setItem(PLAYER_KEY, id);
    } catch {
      /* storage blocked */
    }
  }

  const player = players?.find((p) => p.id === playerId) ?? null;
  return { players, error, playerId, player, pick, retry: () => setAttempt((n) => n + 1) };
}
