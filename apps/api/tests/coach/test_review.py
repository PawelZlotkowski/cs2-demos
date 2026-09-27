"""Design plan items 2 and 3: the overview summary, the wrap-up and its drills."""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.coach.agent import TraceWriter
from app.coach.jobs import CoachJobs
from app.coach.llm_client import ChatResult, call
from app.coach.review import fallback_summary, fallback_wrapup, practice_drills, review_numbers
from app.main import app
from app.repositories.matches import repo
from tests.coach.test_jobs import ids, jobs_with


def _state(mid, pid):
    a = repo.analysis
    return a.moments(mid, pid), a.findings(mid, pid)


def test_summary_without_model_counts_moments_in_every_language(analysed, tmp_path):
    mid, pid = analysed
    moments, findings = _state(mid, pid)
    jobs = CoachJobs(repo, traces=TraceWriter(tmp_path / "traces"))
    en = asyncio.run(jobs.review(mid, pid, "summary", "en"))
    assert en.source == "template" and en.target == "summary" and en.citations
    assert en.text.startswith(f"The coach picked {len(moments)} moments")
    assert "momenty" in fallback_summary(moments, findings, "pl") or "momentów" in fallback_summary(moments, findings, "pl")
    assert "momenten" in fallback_summary(moments, findings, "nl")
    assert repo.analysis.explanation(mid, pid, "summary", "en") == en


def test_wrapup_fallback_says_what_went_well_and_what_to_fix(analysed):
    mid, pid = analysed
    moments, findings = _state(mid, pid)
    text = fallback_wrapup(moments, findings, "en")
    assert text.startswith("Went well: ") and "Fix first: " in text
    assert "[F" in text


def test_drills_come_from_the_practice_notes(analysed):
    mid, pid = analysed
    moments, findings = _state(mid, pid)
    drills = practice_drills(moments, findings)
    mistakes = {f.detector for f in findings if f.kind == "mistake" and any(f.id in m.finding_ids for m in moments)}
    assert drills and {d.detector for d in drills} <= mistakes
    assert all(d.passage_id.startswith("K") and d.title.startswith("Practise") for d in drills)
    assert not any(d.text.startswith("Detectors:") for d in drills)


def test_summary_may_quote_counts_but_not_made_up_numbers(analysed, tmp_path):
    mid, pid = analysed
    moments, findings = _state(mid, pid)
    i = ids(mid, pid)
    assert float(len(moments)) in review_numbers(moments, findings)
    good = f"Two of your {len(moments)} moments are fights in Mid without support [{i['dry_peek']}][{i['shot_while_moving']}]."
    jobs, _ = jobs_with([good], tmp_path)
    expl = asyncio.run(jobs.review(mid, pid, "summary", "en"))
    assert expl.source == "agent", expl.verifier_errors
    assert expl.prompt_version == "match_summary.v1"

    bad = f"You lost 7 duels in Mid [{i['dry_peek']}]."
    jobs, _ = jobs_with([bad, bad], tmp_path)
    expl = asyncio.run(jobs.review(mid, pid, "summary", "en", store=False))
    assert expl.source == "template" and any("7" in e for e in expl.verifier_errors)


def test_wrapup_can_cite_a_drill_it_looked_up(analysed, tmp_path):
    mid, pid = analysed
    moments, findings = _state(mid, pid)
    drill = practice_drills(moments, findings)[0]
    i = ids(mid, pid)
    text = (
        f"Opening round 2 in Mid went well [{i['good_plays']}]. "
        f"Fix the dry peek in Mid first [{i['dry_peek']}]. "
        f"Practise it with a pop flash for each angle you take first [{drill.passage_id}]."
    )
    jobs, _ = jobs_with(
        [ChatResult(content="", tool_calls=[call("search_knowledge", {"query": f"practice drill {drill.detector}", "k": 6})]), text],
        tmp_path,
    )
    expl = asyncio.run(jobs.review(mid, pid, "wrapup", "en"))
    assert expl.prompt_version == "review_wrapup.v1"
    assert expl.source == "agent", expl.verifier_errors
    assert drill.passage_id in expl.citations


def test_review_endpoints(analysed):
    mid, pid = analysed
    client = TestClient(app)
    s = client.get(f"/matches/{mid}/players/{pid}/review/summary?lang=nl")
    assert s.status_code == 200 and s.json()["target"] == "summary" and s.json()["lang"] == "nl"
    w = client.get(f"/matches/{mid}/players/{pid}/review/wrapup")
    body = w.json()
    assert w.status_code == 200 and body["explanation"]["target"] == "wrapup"
    assert body["drills"] and {"detector", "passageId", "title", "text"} <= set(body["drills"][0])
    assert client.get(f"/matches/{mid}/players/nobody/review/summary").status_code == 404
