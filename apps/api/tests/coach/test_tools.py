"""T20: every coach tool on an analysed synthetic match (no demo, no model)."""

from __future__ import annotations

import json

from app.coach import tools
from app.coach.tools import TOOLS, to_json

# Results must stay small: the 14B model has a 32k context for the whole run
MAX_RESULT_BYTES = 4000


def call(name: str, **kwargs):
    result = TOOLS[name](**kwargs)
    assert len(to_json(result)) < MAX_RESULT_BYTES
    return result


def test_registry_has_the_plan_tools():
    assert set(TOOLS) == {
        "list_rounds",
        "get_round_stats",
        "get_match_totals",
        "list_findings",
        "get_finding",
        "get_round_timeline",
        "get_player_state",
        "get_player_history",
        "select_moments",
        "search_knowledge",
        "request_clip",
    }
    for fn in TOOLS.values():
        assert len((fn.__doc__ or "").strip()) > 40, "docstrings are what the model reads"


def test_list_rounds(analysed):
    mid, pid = analysed
    out = call("list_rounds", match_id=mid, player_id=pid)
    assert out["map"] == "de_mirage"
    assert [r["round"] for r in out["rounds"]] == [1, 2]
    assert out["rounds"][0] == {"round": 1, "side": "T", "won": False, "score": "0-1", "k": 0, "d": 1, "dmg": 0}
    assert out["rounds"][1]["score"] == "1-1"


def test_get_match_totals(analysed):
    mid, pid = analysed
    totals = call("get_match_totals", match_id=mid, player_id=pid)["matchTotals"]
    rounds = call("list_rounds", match_id=mid, player_id=pid)["rounds"]
    assert totals["rounds"] == len(rounds)
    assert totals["kills"] == sum(r["k"] for r in rounds)
    assert totals["deaths"] == sum(r["d"] for r in rounds)
    assert totals["roundsWon"] == sum(1 for r in rounds if r["won"])


def test_get_round_stats(analysed):
    mid, pid = analysed
    out = call("get_round_stats", match_id=mid, player_id=pid, round=2)
    assert out["kills"] == 1 and out["openingKill"] is True
    assert "error" in call("get_round_stats", match_id=mid, player_id=pid, round=9)


def test_list_findings_filters(analysed):
    mid, pid = analysed
    everything = call("list_findings", match_id=mid, player_id=pid)
    assert everything["count"] == len(everything["findings"]) > 0
    row = everything["findings"][0]
    assert set(row) == {"id", "kind", "detector", "round", "t", "zone", "severity", "summary"}
    good = call("list_findings", match_id=mid, player_id=pid, kind="good")
    assert good["findings"] and all(f["kind"] == "good" for f in good["findings"])
    r1 = call("list_findings", match_id=mid, player_id=pid, round=1)
    assert all(f["round"] == 1 for f in r1["findings"])
    assert "Known:" in call("list_findings", match_id=mid, player_id=pid, detector="nope")["error"]


def test_get_finding_has_evidence(analysed):
    mid, pid = analysed
    first = call("list_findings", match_id=mid, player_id=pid, detector="shot_while_moving")["findings"][0]
    out = call("get_finding", match_id=mid, player_id=pid, finding_id=first["id"])
    assert out["evidence"]["speedUps"] == 206
    assert "error" in call("get_finding", match_id=mid, player_id=pid, finding_id="F999")


def test_round_timeline_uses_names_and_callouts(analysed):
    mid, _ = analysed
    out = call("get_round_timeline", match_id=mid, round=1)
    kinds = [e["e"] for e in out["events"]]
    assert kinds == ["flash", "kill", "kill"]
    kill = out["events"][1]
    assert kill["on"] == "P0" and kill["at"] == "Mid" and kill["hs"] is True
    assert all(isinstance(e["t"], float) for e in out["events"])
    assert "No round 7" in call("get_round_timeline", match_id=mid, round=7)["error"]


def test_player_state_gives_zones_not_coordinates(analysed):
    mid, _ = analysed
    out = call("get_player_state", match_id=mid, round=1, t=10.0)
    assert len(out["players"]) == 10
    assert {"name", "side", "zone", "hp", "alive"} == set(out["players"][0])
    later = call("get_player_state", match_id=mid, round=1, t=40.0)
    dead = [p for p in later["players"] if not p["alive"]]
    assert any(p["name"] == "P0" for p in dead)


def test_player_history(analysed):
    mid, pid = analysed
    out = call("get_player_history", player_id=pid)
    assert out["matches"] == 1 and out["rounds"] == 2
    assert out["detectors"]["good_plays"]["perMatch"] == [1]
    assert call("get_player_history", player_id=pid, match_id=mid)["matches"] == 0
    only = call("get_player_history", player_id=pid, detector="dry_peek")
    assert list(only["detectors"]) == ["dry_peek"]


def test_unknown_match(analysed):
    assert "Unknown match_id" in call("list_rounds", match_id="nope", player_id="1")["error"]


def test_select_moments_validates_and_stores(analysed):
    mid, pid = analysed
    from app.repositories.matches import repo

    ids = {f.detector: f for f in repo.analysis.findings(mid, pid)}
    mistake, good = ids["shot_while_moving"], ids["good_plays"]
    picks = [
        {"round": 1, "t0": 10.0, "t1": 18.0, "findingIds": [mistake.id], "kind": "mistake",
         "pickedBecause": f"[{mistake.id}] Shot while moving."},
        {"round": 2, "t0": 11.0, "t1": 19.0, "findingIds": [good.id], "kind": "good",
         "pickedBecause": f"[{good.id}] Entry kill."},
    ]
    bad = call("select_moments", match_id=mid, player_id=pid, moments=[{**picks[0], "findingIds": ["F99"]}, picks[1]])
    assert bad["ok"] is False and any("F99" in e for e in bad["errors"])
    assert all(m.source == "ranker" for m in repo.analysis.moments(mid, pid))

    ok = call("select_moments", match_id=mid, player_id=pid, moments=picks)
    assert ok == {"ok": True, "moments": ["m1", "m2"]}
    stored = repo.analysis.moments(mid, pid)
    assert [m.source for m in stored] == ["agent", "agent"]
    assert stored[1].finding_ids == [good.id]


def test_match_overview(analysed):
    mid, pid = analysed
    out = tools.match_overview(mid)
    assert out["selectedPlayerId"] == pid and len(out["players"]) == 10
    json.dumps(out)


def test_search_knowledge(analysed):
    out = call("search_knowledge", query="died alone and nobody traded", k=2)
    ids = [p["id"] for p in out["passages"]]
    assert len(ids) == 2 and all(i.startswith("K") for i in ids)
    assert out["passages"][0]["title"] in {"Untraded deaths", "Trading"}
    mirage = call("search_knowledge", query="B apartments molotov", map="de_mirage")
    assert mirage["passages"][0]["map"] == "de_mirage"
    assert all(p["map"] in ("all", "de_mirage") for p in mirage["passages"])


def test_request_clip_queues_once(analysed):
    mid, pid = analysed
    first = call("request_clip", match_id=mid, player_id=pid, round=1, t0=10.0, t1=18.0)
    again = call("request_clip", match_id=mid, player_id=pid, round=1, t0=10.0, t1=18.0)
    assert first["status"] == "queued" and first["clipJobId"] == again["clipJobId"]
    assert "not connected" in first["note"]
    assert "at most 60" in call("request_clip", match_id=mid, player_id=pid, round=1, t0=0, t1=90)["error"]
    assert "No round 9" in call("request_clip", match_id=mid, player_id=pid, round=9, t0=0, t1=5)["error"]
