"""Shared tick ↔ seconds conversion (must match apps/web)."""

from __future__ import annotations

DEFAULT_TICK_RATE = 64
SAMPLE_HZ = 8


def tick_stride(tick_rate: int = DEFAULT_TICK_RATE, sample_hz: int = SAMPLE_HZ) -> int:
    return max(1, int(tick_rate // sample_hz))


def tick_to_seconds(tick: int, origin_tick: int, tick_rate: int = DEFAULT_TICK_RATE) -> float:
    return (tick - origin_tick) / float(tick_rate)


def seconds_to_tick(t_sec: float, origin_tick: int, tick_rate: int = DEFAULT_TICK_RATE) -> int:
    return int(round(origin_tick + t_sec * tick_rate))
