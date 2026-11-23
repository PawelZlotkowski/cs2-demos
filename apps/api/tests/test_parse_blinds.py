from pathlib import Path

import pandas as pd
import pytest

from app.processing.parse_demo import _blinds_from_flash_duration

FIXTURE_DEM = Path(__file__).resolve().parents[1] / "data" / "fixtures" / "test-mirage.dem"


class FlashTicks:
    """flash_duration per (tick, steamid); players not listed read 0."""

    def __init__(self, values: dict[tuple[int, int], float]):
        self.values = values

    def parse_ticks(self, props, ticks):
        return pd.DataFrame(
            [
                {"tick": t, "steamid": s, "flash_duration": self.values.get((t, s), 0.0)}
                for t in ticks
                for s in (1, 2, 3)
            ]
        )


def test_blinds_come_from_flash_duration_rising_on_the_detonation_tick():
    flashes = pd.DataFrame([{"tick": 100, "user_steamid": "1"}, {"tick": 200, "user_steamid": "2"}])
    parser = FlashTicks(
        {
            (100, 2): 2.4,  # blinded by flash at 100
            (199, 3): 1.0,  # still blind from earlier, untouched by flash at 200
            (200, 3): 1.0,
            (200, 1): 3.1,  # blinded by flash at 200
        }
    )
    rows = _blinds_from_flash_duration(parser, flashes).to_dict("records")
    assert rows == [
        {"tick": 100, "attacker_steamid": "1", "user_steamid": 2, "blind_duration": 2.4},
        {"tick": 200, "attacker_steamid": "2", "user_steamid": 1, "blind_duration": 3.1},
    ]


@pytest.mark.skipif(not FIXTURE_DEM.exists(), reason="decompressed fixture dem missing")
def test_derived_blinds_match_player_blind_events_on_fixture():
    from demoparser2 import DemoParser

    parser = DemoParser(str(FIXTURE_DEM))

    def key(df):
        return {
            (int(r.tick), str(r.attacker_steamid), str(r.user_steamid)): round(float(r.blind_duration), 3)
            for r in df.itertuples()
        }

    events = key(parser.parse_event("player_blind"))
    derived = key(_blinds_from_flash_duration(parser, parser.parse_event("flashbang_detonate")))
    assert events and derived == events
