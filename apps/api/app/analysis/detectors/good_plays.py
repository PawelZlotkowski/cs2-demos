"""D10 Good plays.

One finding per play, ``evidence["play"]`` names it:
- ``trade_kill``: killed an enemy within ``TRADE_WINDOW_S`` of that enemy
  killing a teammate. Severity 0.45.
- ``entry_kill``: first kill of the round, on the T side. Severity 0.5.
- ``multi_kill``: 3+ kills in the round. Severity 0.5 + 0.1 per kill over 3.
- ``clutch``: last player alive on the team against 1+ enemies and the round
  was won. Severity 0.6 + 0.1 per enemy, capped at 0.95.
- ``flash_assist``: a teammate's kill credited as flash-assisted by the player.
  Severity 0.4.
- ``utility_damage``: HE/fire damage to enemies >= ``MIN_UTILITY_DAMAGE`` in the
  round. Severity 0.3 + damage / 250, capped at 0.7.

Severity here means how much the play is worth showing, not a mistake cost.
"""

from __future__ import annotations

from app.analysis.detectors.common import (
    TRADE_WINDOW_S,
    FindingDraft,
    clamp,
    first_kill,
    is_team_kill,
    weapon_key,
    zone_of,
)
from app.analysis.match_data import MatchData

MIN_UTILITY_DAMAGE = 40
UTILITY_WEAPONS = {"hegrenade", "inferno", "molotov", "incgrenade"}


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    out: list[FindingDraft] = []
    mates = set(rd.teammates(player_id))
    kills = sorted(rd.kills, key=lambda k: k.tick)
    my_kills = [
        k for k in kills if k.attacker == player_id and k.victim != player_id and not is_team_kill(rd, player_id, k.victim)
    ]

    def add(play: str, k_t: float, tick: int, severity: float, evidence: dict, others: list[str], pos) -> None:
        out.append(
            FindingDraft(
                detector="good_plays",
                kind="good",
                round=round_no,
                t=k_t,
                tick=tick,
                player_id=player_id,
                template=f"good_plays.{play}",
                severity=round(clamp(severity), 3),
                evidence={"play": play, **evidence},
                other_ids=[o for o in others if o],
                zone=zone_of(match, pos or rd.position_at(player_id, k_t)),
            )
        )

    for k in my_kills:
        traded = next(
            (
                prev
                for prev in kills
                if prev.attacker == k.victim and prev.victim in mates and 0 < k.t - prev.t <= TRADE_WINDOW_S
            ),
            None,
        )
        if traded:
            add(
                "trade_kill",
                k.t,
                k.tick,
                0.45,
                {"tradeTimeS": round(k.t - traded.t, 1), "tradedName": match.name(traded.victim), "victimName": match.name(k.victim)},
                [k.victim, traded.victim],
                k.attacker_pos,
            )

    fk = first_kill(rd)
    if fk and fk.attacker == player_id and rd.sides.get(player_id) == "T":
        add("entry_kill", fk.t, fk.tick, 0.5, {"victimName": match.name(fk.victim), "weapon": fk.weapon}, [fk.victim], fk.attacker_pos)

    if len(my_kills) >= 3:
        last = my_kills[-1]
        add(
            "multi_kill",
            last.t,
            last.tick,
            0.5 + 0.1 * (len(my_kills) - 3),
            {"kills": len(my_kills), "spanS": round(last.t - my_kills[0].t, 1)},
            [k.victim for k in my_kills],
            last.attacker_pos,
        )

    # Clutch: the moment the last teammate died with the player still alive
    my_side = rd.sides.get(player_id)
    if my_side and rd.winner == my_side:
        my_death = rd.death_of(player_id)
        for k in kills:
            if k.victim not in mates:
                continue
            if my_death and my_death.t <= k.t:
                break
            alive = rd.alive_at(k.t + 1e-6)
            if player_id in alive and not (alive & mates):
                enemies_alive = [p for p in rd.enemies(player_id) if p in alive]
                if enemies_alive:
                    later = [x for x in my_kills if x.t > k.t]
                    add(
                        "clutch",
                        k.t,
                        k.tick,
                        min(0.95, 0.6 + 0.1 * len(enemies_alive)),
                        {"enemiesAlive": len(enemies_alive), "killsInClutch": len(later)},
                        enemies_alive,
                        None,
                    )
                break

    for k in kills:
        if k.assister == player_id and k.flash_assist and k.attacker in mates:
            add("flash_assist", k.t, k.tick, 0.4, {"victimName": match.name(k.victim), "killerName": match.name(k.attacker)}, [k.attacker, k.victim], k.victim_pos)

    enemies = set(rd.enemies(player_id))
    util = [h for h in rd.hurts if h.attacker == player_id and h.victim in enemies and weapon_key(h.weapon) in UTILITY_WEAPONS]
    dmg = sum(h.damage for h in util)
    if dmg >= MIN_UTILITY_DAMAGE:
        add(
            "utility_damage",
            util[0].t,
            util[0].tick,
            min(0.7, 0.3 + dmg / 250),
            {"utilityDamage": dmg, "enemiesHit": len({h.victim for h in util})},
            sorted({h.victim for h in util}),
            None,
        )
    return sorted(out, key=lambda d: d.t)
