/** Tick ↔ seconds — must match apps/api/app/processing/time_utils.py */

export const DEFAULT_TICK_RATE = 64;

export function tickToSeconds(
  tick: number,
  originTick: number,
  tickRate: number = DEFAULT_TICK_RATE,
): number {
  return (tick - originTick) / tickRate;
}

export function secondsToTick(
  tSec: number,
  originTick: number,
  tickRate: number = DEFAULT_TICK_RATE,
): number {
  return Math.round(originTick + tSec * tickRate);
}

/** Seconds into the round as m:ss.d (the replay clock). */
export function formatClock(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const tenth = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, "0")}.${tenth}`;
}
