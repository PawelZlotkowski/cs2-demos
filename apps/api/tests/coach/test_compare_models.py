"""eval/compare_models.py end to end with the mock model (no GPU)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.coach.jobs import CoachJobs, SelectionOutcome
from app.coach.llm_client import MockLLMClient
from app.models.contracts import MomentExplanation
from app.repositories.matches import repo

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))
from eval import compare_models  # noqa: E402


class FakeModel(MockLLMClient):
    base_url = "http://llm/v1"
    sampling = "gemma"
    sampling_overrides: dict = {}


def test_run_keeps_moments_and_report_compares(analysed, tmp_path):
    mid, pid = analysed
    before = repo.analysis.moments(mid, pid)
    outs = []
    for label in ("qwen", "gemma"):
        args = argparse.Namespace(
            match_id=mid, player=None, label=label, langs="en,pl", repeat=1,
            base_url=None, model=None, sampling=None, out=str(tmp_path / f"{label}.json"),
        )
        outs.append(compare_models.run(args, llm=FakeModel(["no"] * 200, model=label)))

    assert repo.analysis.moments(mid, pid) == before
    result = json.loads(outs[0].read_text(encoding="utf-8"))
    assert result["selection"]["verified"] is False
    assert {a["lang"] for a in result["answers"]} == {"en", "pl"}
    explains = [a for a in result["answers"] if a["kind"] == "explain"]
    assert len(explains) == 2 * len(before) and not any(a["verified"] for a in explains)
    assert result["summary"]["explanationsVerified"] == f"0/{len(explains)}"

    text = compare_models.report(argparse.Namespace(results=[str(p) for p in outs], out=str(tmp_path / "cmp.md")))
    assert "| | qwen | gemma |" in text and "Explanations verified" in text


def _args(mid, tmp_path, label="m"):
    return argparse.Namespace(
        match_id=mid, player=None, label=label, langs="en", repeat=1,
        base_url=None, model=None, sampling=None, out=str(tmp_path / f"{label}.json"),
    )


def test_run_restores_stored_texts_and_removes_picks_when_there_were_none(analysed, tmp_path, monkeypatch):
    mid, pid = analysed
    before = repo.analysis.moments(mid, pid)
    stored = MomentExplanation(target=before[0].id, lang="en", text="Stored text.", source="template")
    repo.analysis.save_explanation(mid, pid, stored)
    assert len(before) > 1
    picked = [before[-1].model_copy(update={"id": "m1", "source": "agent"})]

    async def model_picks(self, match_id, player_id):  # what the select_moments tool stores
        repo.analysis.replace_moments(match_id, player_id, picked)
        return SelectionOutcome(picked, "agent")

    monkeypatch.setattr(CoachJobs, "select_moments", model_picks)
    compare_models.run(_args(mid, tmp_path), llm=FakeModel(["no"] * 200, model="m"))
    assert repo.analysis.moments(mid, pid) == before
    assert repo.analysis.explanation(mid, pid, stored.target, "en") == stored

    repo.analysis.replace_moments(mid, pid, [])
    compare_models.run(_args(mid, tmp_path), llm=FakeModel(["no"] * 200, model="m"))
    assert repo.analysis.moments(mid, pid) == []


def test_report_lists_every_repeat_and_true_median(tmp_path):
    def answer(text, verified, latency):
        return {"kind": "explain", "target": "m1", "lang": "pl", "text": text, "verified": verified, "repaired": False,
                "autocited": False, "errors": [] if verified else ["language"], "latencyS": latency,
                "maxStepsHit": False, "toolCalls": 0, "toolErrors": 0}

    rows = [answer("Pierwszy.", True, 1.0), answer("Второй.", False, 2.0), answer("Trzeci.", True, 3.0), answer("Czwarty.", True, 4.0)]
    selection = {"verified": True, "latencyS": 1.0}
    assert compare_models.summarise(selection, rows)["explainMedianS"] == 2.5
    result = {"label": "qwen", "matchId": "m", "playerId": "p", "sampling": "qwen3", "answers": rows,
              "summary": compare_models.summarise(selection, rows)}
    path = tmp_path / "qwen.json"
    path.write_text(json.dumps(result), encoding="utf-8")
    text = compare_models.report(argparse.Namespace(results=[str(path)], out=str(tmp_path / "cmp.md")))
    assert "Второй." in text and "(repeat 2) (fallback: language)" in text and "Czwarty." in text
