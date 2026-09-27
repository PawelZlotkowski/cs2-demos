"""Doc 29 R05: cross-match tools, [M2:F3] citations and the Coach page Ask."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.coach import tools
from app.coach.agent import TraceWriter
from app.coach.backends import InProcessTools
from app.coach.jobs import CoachJobs, summary_numbers_in
from app.coach.llm_client import ChatResult, MockLLMClient, call
from app.coach.verify import VerifyContext, verify_text
from app.main import app
from app.processing import pipeline as pipe_mod
from app.repositories.matches import repo

client = TestClient(app)


def sse(text: str) -> list[tuple[str, dict]]:
    return [
        (lines["event"], json.loads(lines["data"]))
        for lines in (dict(line.split(": ", 1) for line in block.splitlines()) for block in text.strip().split("\n\n"))
    ]


def test_list_matches_and_find_moments(analysed):
    mid, pid = analysed
    assert tools.player_match_refs(pid) == {"M1": mid}
    listed = tools.TOOLS["list_matches"](player_id=pid)["playerMatches"]
    assert listed[0]["ref"] == "M1" and listed[0]["rounds"] > 0
    assert listed[0]["mistakes"] + listed[0]["goodPlays"] > 0
    assert tools.TOOLS["list_matches"](player_id="nobody") == {"error": "This player has no analysed matches yet."}

    found = tools.TOOLS["find_moments"](player_id=pid, kind="good", limit=3)
    assert 0 < len(found["moments"]) <= 3 and found["total"] >= len(found["moments"])
    first = found["moments"][0]
    assert first["id"].startswith("M1:F") and first["match"] == "M1" and first["kind"] == "good"
    assert "error" in tools.TOOLS["find_moments"](player_id=pid, detector="nope")
    own = tools._map_key(repo.get(mid)["match"]["map"])
    other = "de_anubis" if own == "mirage" else "de_mirage"
    assert tools.TOOLS["find_moments"](player_id=pid, map=other)["total"] == 0
    assert tools.TOOLS["list_matches"](player_id=pid, map=other)["playerMatches"] == []


def test_cross_match_citations_are_verified(analysed):
    mid, pid = analysed
    found = [f for _r, _rec, f in tools.cross_match_findings(pid)]
    ctx = VerifyContext.build(found)
    fid = found[0].id
    assert verify_text(f"This happened in round {found[0].round} [{fid}].", ctx, "en").ok
    bad = verify_text("This happened [M9:F1].", ctx, "en")
    assert not bad.ok and "M9:F1" in bad.errors[0]


def test_list_matches_numbers_may_be_quoted():
    msgs = [{"role": "tool", "content": json.dumps({"playerMatches": [{"ref": "M1", "rounds": 24, "mistakes": 7}]})}]
    assert {24.0, 7.0} <= summary_numbers_in(msgs)


def test_coach_page_ask_streams_a_verified_cross_match_answer(analysed, tmp_path, monkeypatch):
    mid, pid = analysed
    good = next(f for _r, _rec, f in tools.cross_match_findings(pid, kind="good"))
    llm = MockLLMClient(
        [
            ChatResult(content="", tool_calls=[call("find_moments", {"kind": "good"})]),
            f"Your best example is from round {good.round} [{good.id}].",
        ]
    )
    jobs = CoachJobs(repo, llm=llm, tools_factory=InProcessTools, traces=TraceWriter(tmp_path))
    monkeypatch.setattr(pipe_mod, "coach_jobs", lambda _repo: jobs)
    r = client.post(f"/players/{pid}/ask", json={"question": "What do I do well?"})
    events = sse(r.text)
    assert [e for e, _ in events] == ["step", "answer"]
    assert events[0][1]["tool"] == "find_moments"
    answer = events[1][1]
    assert answer["verified"] is True and answer["citations"] == [good.id] and answer["matches"] == {"M1": mid}


def test_coach_page_ask_without_model_and_unknown_player(analysed):
    mid, pid = analysed
    events = sse(client.post(f"/players/{pid}/ask", json={"question": "What should I practise?"}).text)
    assert events[-1][1]["source"] == "template" and events[-1][1]["matches"] == {"M1": mid}
    assert client.post("/players/nobody/ask", json={"question": "Hi there"}).status_code == 404
