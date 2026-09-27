"""D5 Team flash / self flash.

Signal: a flash thrown by the player blinded a teammate or the player for more
than ``MIN_BLIND_S``. One finding per flash (blinds on the same tick).

Severity = 0.3 + 0.15 per teammate blinded + 0.2 * min(1, longest blind / 3 s),
minus 0.15 when the same flash blinded at least as many enemies.

Known false positives: planned "pop" flashes where the teammate turns away late.
"""

from __future__ import annotations

from collections import defaultdict

from app.analysis.detectors.common import FindingDraft, clamp, zone_of
from app.analysis.match_data import Blind, MatchData

MIN_BLIND_S = 1.0


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    by_tick: dict[int, list[Blind]] = defaultdict(list)
    for b in rd.blinds:
        if b.attacker == player_id:
            by_tick[b.tick].append(b)
    mates = set(rd.teammates(player_id))
    enemies = set(rd.enemies(player_id))
    drafts: list[FindingDraft] = []
    for tick, blinds in sorted(by_tick.items()):
        friendly = [b for b in blinds if (b.victim in mates or b.victim == player_id) and b.duration > MIN_BLIND_S]
        if not friendly:
            continue
        mates_hit = [b for b in friendly if b.victim in mates]
        self_hit = any(b.victim == player_id for b in friendly)
        enemies_hit = [b for b in blinds if b.victim in enemies and b.duration > MIN_BLIND_S]
        longest = max(b.duration for b in friendly)
        severity = 0.3 + 0.15 * len(mates_hit) + 0.2 * min(1.0, longest / 3.0)
        if len(enemies_hit) >= len(friendly):
            severity -= 0.15
        # The flash's detonation is the nearest own flash at or before the blind
        flash = max(
            (g for g in rd.grenades if g.type == "flash" and g.thrower == player_id and g.tick <= tick),
            key=lambda g: g.tick,
            default=None,
        )
        drafts.append(
            FindingDraft(
                detector="team_flash",
                kind="mistake",
                round=round_no,
                t=friendly[0].t,
                tick=tick,
                player_id=player_id,
                template="team_flash.self" if self_hit and not mates_hit else "team_flash",
                severity=round(clamp(severity), 3),
                evidence={
                    "teammatesBlinded": len(mates_hit),
                    "selfBlinded": 1 if self_hit else 0,
                    "enemiesBlinded": len(enemies_hit),
                    "longestBlindS": round(longest, 1),
                },
                other_ids=[b.victim for b in mates_hit],
                zone=zone_of(match, flash.pos if flash else rd.position_at(player_id, friendly[0].t)),
            )
        )
    return drafts
