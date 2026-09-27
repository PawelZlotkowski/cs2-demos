import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from eval import label_tool as lt  # noqa: E402
from app.analysis.run import detect_findings  # noqa: E402
from tests.analysis.builders import kill, match, round_, shot  # noqa: E402


def test_cohen_kappa_known_values():
    assert lt.cohen_kappa(["correct", "wrong"] * 5, ["correct", "wrong"] * 5) == 1.0
    # 70 % observed, 50 % expected -> 0.4
    a = ["correct"] * 5 + ["wrong"] * 5
    b = ["correct"] * 4 + ["wrong"] + ["correct"] * 2 + ["wrong"] * 3
    assert round(lt.cohen_kappa(a, b), 3) == 0.4
    assert lt.cohen_kappa([], []) is None


def _record(labeller, verdicts, missed=()):
    return {
        "matchId": "m", "playerId": "p", "round": 1, "labeller": labeller,
        "findings": [{"findingId": f"F{i}", "detector": d, "t": t, "verdict": v} for i, (d, t, v) in enumerate(verdicts, 1)],
        "missed": [{"detector": d, "t": t} for d, t in missed],
    }


def test_agreement_matches_events_by_time_not_id():
    a = [_record("a", [("dry_peek", 10.2, "correct"), ("team_flash", 20.0, "wrong")])]
    b = [_record("b", [("team_flash", 20.1, "wrong"), ("dry_peek", 10.1, "correct")])]
    out = lt.agreement(a, b)
    assert out["sharedFindings"] == 2 and out["rawAgreement"] == 1.0


def test_score_precision_recall():
    recs = [_record("a", [("dry_peek", 1, "correct"), ("dry_peek", 5, "wrong"), ("dry_peek", 9, "unsure")], missed=[("dry_peek", 30)])]
    s = lt.score(recs)["dry_peek"]
    assert (s["precision"], s["recall"], s["unsure"]) == (0.5, 0.5, 1)


def test_label_round_with_scripted_answers(tmp_path):
    m = match(round_(2, shots=[shot(10.0, "t1", 200)], kills=[kill(11.0, "ct1", "t1")]))
    findings = [f for f in detect_findings(m, "t1") if f.round == 2]
    assert len(findings) >= 2
    answers = iter(["x", "c", "", "w", "enemy pushed", "untraded_death 11 no one near", "oops", ""])
    rec = lt.label_round(m, "t1", 2, "tester", findings[:2], ask=lambda _p: next(answers))
    assert [r["verdict"] for r in rec["findings"]] == ["correct", "wrong"]
    assert rec["findings"][1]["note"] == "enemy pushed"
    assert rec["missed"] == [{"detector": "untraded_death", "t": 11.0, "note": "no one near"}]
    path = tmp_path / "l.jsonl"
    path.write_text(json.dumps(rec) + "\n")
    assert lt.read_labels([path])[0]["round"] == 2
