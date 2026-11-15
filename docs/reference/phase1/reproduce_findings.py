"""Reproduce audit findings with synthetic inputs in a temporary data directory.

Run from the repository root in an environment with the API dependencies:
    python review/reproduce_findings.py

This is an audit probe, not the application's acceptance test suite. True values
below confirm the reported flaw remains present. No game or model is launched.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import types
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
# Avoid an unrelated installed package named tests shadowing repository fixtures.
test_package = types.ModuleType("tests")
test_package.__path__ = [str(ROOT / "apps" / "api" / "tests")]
sys.modules["tests"] = test_package


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="cs2-audit-") as scratch:
        os.environ["RR_DATA_DIR"] = scratch
        os.environ["RR_LLM_ENABLED"] = "false"
        os.environ["RR_CSDM_ENABLED"] = "false"

        from fastapi.testclient import TestClient

        from app.coach.verify import VerifyContext, verify_text
        from app.core.config import settings
        from app.main import app
        from app.models.contracts import Finding
        from app.processing import pipeline as pipeline_module
        from app.processing import video_clips
        from app.processing.normalize import normalize_parsed
        from app.repositories.matches import MatchRepository, repo
        from tests.analysis.synthetic_demo import build

        results = {}
        with patch.object(pipeline_module.pipeline, "enqueue", return_value=None):
            owner = TestClient(app)
            stranger = TestClient(app)
            upload = owner.post("/matches/upload", files={"file": ("probe.dem", b"PBDEMS2\x00")})
            mid = upload.json()["id"]
            response = stranger.get(f"/matches/{mid}")
            results["unauthenticated_upload_and_read"] = upload.status_code == response.status_code == 200

        restarted = MatchRepository()
        results["unparsed_upload_missing_after_restart"] = restarted.get(mid) is None

        record = repo.create_upload("timeout.dem", b"PBDEMS2\x00")
        delay, deadline = 0.20, 0.02

        def slow_parser(*_args, **_kwargs):
            time.sleep(delay)
            return None

        began = time.perf_counter()
        with patch.object(settings, "parse_timeout_seconds", deadline), patch.object(
            pipeline_module, "parse_demo_file", side_effect=slow_parser
        ):
            pipeline_module.ProcessingPipeline(repo).process(record["id"])
        elapsed = time.perf_counter() - began
        results["timeout_waits_for_parser_thread"] = elapsed >= delay * 0.9
        results["timeout_probe_seconds"] = {"deadline": deadline, "elapsed": round(elapsed, 3)}

        clips = Path(scratch) / "clip-output"
        clips.mkdir()
        previous = clips / "r1.mp4"
        expected = clips / "r2.mp4"
        previous.write_bytes(b"old-round-recording")
        with patch.object(video_clips, "run_csdm", return_value=None), patch.object(
            video_clips, "resolve_csdm_bin", return_value="csdm"
        ):
            video_clips.csdm_record(Path(scratch) / "unused.dem", 100, 200, None, expected)
        results["old_mp4_moved_to_new_clip"] = expected.read_bytes() == b"old-round-recording" and not previous.exists()

        finding = Finding(
            id="F1", detector="untraded_death", kind="mistake", round=1,
            t=10, tick=640, playerId="p1", severity=0.5, evidence={},
            summary="Your death was not traded.", template="untraded_death",
        )
        check = verify_text("You won the duel through smoke [F1].", VerifyContext.build([finding]), "en")
        results["unsupported_claim_passes_verifier"] = check.ok
        results["verifier_errors"] = check.errors

        parsed = build()
        # Team A wins as CT in round 1, then as T in round 2 after switching sides.
        later = parsed.ticks["tick"] >= 9000
        parsed.ticks.loc[later, "team_num"] = parsed.ticks.loc[later, "team_num"].map({2: 3, 3: 2})
        normalized = normalize_parsed("audit-halftime", parsed)
        results["halftime_team_score_wrong"] = normalized["match"]["score"] == "1–1"
        results["halftime_score"] = {"actual": normalized["match"]["score"], "expected_team_A": "2–0"}

        print(json.dumps(results, indent=2, ensure_ascii=False))
        flaws = [value for value in results.values() if isinstance(value, bool)]
        if not all(flaws):
            raise SystemExit("One audit finding no longer reproduced; recheck its report entry.")


if __name__ == "__main__":
    main()
