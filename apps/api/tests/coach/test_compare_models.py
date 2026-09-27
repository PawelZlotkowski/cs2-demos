"""eval/compare_models.py end to end with the mock model (no GPU)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.coach.llm_client import MockLLMClient
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
