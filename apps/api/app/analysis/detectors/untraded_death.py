"""D1: no personal trade after a teammate dies within 5 m.

Keep the detector identifier for saved clients. The subject is now the living
selected player, not the victim. Proximity cannot establish a clear shot, so
these are context findings (fixed review priority 0.4), never proven mistakes.
Successful personal trades are emitted once by good_plays.
"""
from app.analysis.detectors.common import FindingDraft, zone_of
from app.analysis.match_data import MatchData
from app.analysis.trades import TRADE_RADIUS_M, TRADE_WINDOW_S, nearby_deaths


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    out = []
    for event in nearby_deaths(rd, player_id):
        if event.outcome == "traded":
            continue
        death = event.death
        damage = sum(h.damage for h in rd.hurts if h.attacker == player_id
                     and h.victim == death.attacker
                     and death.t < h.t <= death.t + event.observed_s)
        out.append(FindingDraft(
            detector="untraded_death", kind="context", round=round_no,
            t=death.t, tick=death.tick, player_id=player_id,
            template=f"untraded_death.{event.outcome}", severity=0.4,
            evidence={
                "teammateName": match.name(death.victim),
                "killerName": match.name(death.attacker),
                "teammateDistanceM": round(event.distance_m, 2),
                "tradeRadiusM": TRADE_RADIUS_M, "tradeWindowS": TRADE_WINDOW_S,
                "observedWindowS": round(event.observed_s, 3),
                "tradeOutcome": event.outcome, "damageToKiller": damage,
                "opportunityStatus": "proximity_only", "visibility": "unknown",
            },
            other_ids=[death.victim, death.attacker],
            zone=zone_of(match, rd.position_at(player_id, death.t)),
        ))
    return out
