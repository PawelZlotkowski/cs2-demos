"""Per-round numbers for the coached player (``RoundStats``), all from code."""

from __future__ import annotations

from app.analysis.detectors.common import (
    TRADE_WINDOW_S,
    first_kill,
    is_team_kill,
    was_traded,
    weapon_key,
)
from app.analysis.detectors.good_plays import UTILITY_WEAPONS
from app.analysis.match_data import MatchData, RoundData
from app.models.contracts import RoundStats


def round_stats(match: MatchData, rd: RoundData, player_id: str) -> RoundStats:
    side = rd.sides.get(player_id)
    mates = set(rd.teammates(player_id))
    enemies = set(rd.enemies(player_id))
    my_kills = [k for k in rd.kills if k.attacker == player_id and k.victim in enemies]
    death = rd.death_of(player_id)
    fk = first_kill(rd)
    my_hurts = [h for h in rd.hurts if h.attacker == player_id and h.victim in enemies]
    blinds = [b for b in rd.blinds if b.attacker == player_id and b.duration > 1.0]
    eco = rd.economy.get(player_id)
    trade_kills = sum(
        1
        for k in my_kills
        if any(
            p.attacker == k.victim and p.victim in mates and 0 < k.t - p.t <= TRADE_WINDOW_S
            for p in rd.kills
        )
    )
    return RoundStats(
        round=rd.number,
        player_id=player_id,
        side=side,
        won=(rd.winner == side) if rd.winner and side else None,
        kills=len(my_kills),
        deaths=1 if death else 0,
        assists=sum(1 for k in rd.kills if k.assister == player_id and k.attacker in mates),
        flash_assists=sum(1 for k in rd.kills if k.assister == player_id and k.flash_assist),
        headshot_kills=sum(1 for k in my_kills if k.headshot),
        damage=sum(h.damage for h in my_hurts),
        utility_damage=sum(h.damage for h in my_hurts if weapon_key(h.weapon) in UTILITY_WEAPONS),
        utility_thrown=sum(1 for g in rd.grenades if g.thrower == player_id),
        enemies_flashed=len({(b.tick, b.victim) for b in blinds if b.victim in enemies}),
        teammates_flashed=len({(b.tick, b.victim) for b in blinds if b.victim in mates}),
        money_start=(eco.balance + eco.equip_value) if eco else None,
        equip_value=eco.equip_value if eco else None,
        survived=death is None,
        opening_kill=bool(fk and fk.attacker == player_id),
        opening_death=bool(fk and fk.victim == player_id),
        trade_kills=trade_kills,
        death_traded=(
            was_traded(rd, player_id, death.attacker, death.t)
            if death and death.attacker and not is_team_kill(rd, death.attacker, player_id)
            else None
        ),
        time_alive_s=round(death.t, 1) if death else None,
    )


def match_round_stats(match: MatchData, player_id: str) -> list[RoundStats]:
    return [round_stats(match, rd, player_id) for rd in match.rounds if player_id in rd.sides]
