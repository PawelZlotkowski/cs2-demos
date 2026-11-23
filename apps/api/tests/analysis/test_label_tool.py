import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from eval import label_tool as lt  # noqa: E402
from app.analysis.run import detect_findings  # noqa: E402
from app.core.config import settings  # noqa: E402
from tests.analysis.builders import kill, match, round_, shot  # noqa: E402


def test_cohen_kappa_known_values():
    assert lt.cohen_kappa(["correct", "wrong"] * 5, ["correct", "wrong"] * 5) == 1.0
    # 70 % observed, 50 % expected -> 0.4
    a = ["correct"] * 5 + ["wrong"] * 5
    b = ["correct"] * 4 + ["wrong"] + ["correct"] * 2 + ["wrong"] * 3
    assert round(lt.cohen_kappa(a, b), 3) == 0.4
    assert lt.cohen_kappa([], []) is None
    assert lt.cohen_kappa(["correct"] * 5, ["correct"] * 5) is None  # expected agreement 1: undefined


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


def test_agreement_pairs_within_one_second_one_to_one():
    a = [_record("a", [("dry_peek", 41.4, "correct"), ("shot_while_moving", 12.2, "correct"), ("shot_while_moving", 12.4, "wrong")])]
    b = [_record("b", [("dry_peek", 41.6, "correct"), ("shot_while_moving", 12.2, "correct"), ("shot_while_moving", 12.4, "wrong")])]
    out = lt.agreement(a, b)
    assert out["sharedFindings"] == 3 and out["rawAgreement"] == 1.0
    assert lt.agreement([_record("a", [("dry_peek", 40.0, "correct")])], [_record("b", [("dry_peek", 41.1, "correct")])])["sharedFindings"] == 0


def test_relabelled_round_counts_once(tmp_path):
    path = tmp_path / "m-p-a.jsonl"
    old = {**_record("a", [("untraded_death", 42.3, "wrong")]), "labelledAt": "2026-11-20T10:00:00+00:00"}
    new = {**_record("a", [("untraded_death", 42.3, "correct")]), "labelledAt": "2026-11-21T10:00:00+00:00"}
    path.write_text(json.dumps(old) + "\n" + json.dumps(new) + "\n")
    s = lt.score(lt.read_labels([path]))["untraded_death"]
    assert (s["correct"], s["wrong"]) == (1, 0)


def _clip(finding_id, detector, verdict, saved, members=1, reviews=None, status="complete"):
    finding = {"id": finding_id, "detector": detector, "round": 3, "t": 20.0}
    others = [{"id": f"F{90 + i}", "detector": "unused_utility", "round": 3, "t": 21.0} for i in range(members - 1)]
    label = {
        "status": status, "verdict": verdict, "matchId": "demo-" + "a" * 64, "playerId": "7", "snapshotId": "s",
        "round": 3, "labeller": "ana", "finding": finding,
        "footage": {"findings": [finding, *others], "reviewKey": "+".join(sorted([finding_id, *(o["id"] for o in others)]))},
        **({"signalReviews": reviews} if reviews else {}),
    }
    return {"kind": "clip", "revision": 1, "savedAt": saved, "label": label}


def _export(path, exported, clips):
    path.write_text(json.dumps({"format": "round-reviewer-notes-v1", "labeller": "ana", "exportedAt": exported,
                                "demos": {}, "labels": clips}, indent=1))


def test_score_reads_overlapping_exports_by_glob(tmp_path, monkeypatch, capsys):
    _export(tmp_path / "ana-notes.json", "2026-11-18", [_clip("F1", "dry_peek", "wrong", "2026-11-18T01:00")])
    _export(tmp_path / "ana-all-notes.json", "2026-11-20", [
        _clip("F1", "dry_peek", "correct", "2026-11-19T01:00"),  # newer save of the same clip
        _clip("F2", "dry_peek", "wrong", "2026-11-19T02:00"),
        _clip("F3", "dry_peek", None, "2026-11-19T03:00"),  # no verdict yet
        _clip("F4", "dry_peek", "unsure", "2026-11-19T04:00"),
        _clip("F5", "untraded_death", "correct", "2026-11-19T05:00", members=2),  # one verdict for two findings
        _clip("F6", "untraded_death", None, "2026-11-19T06:00", members=2,
              reviews=[{"findingId": "F6", "verdict": "wrong"}, {"findingId": "F90", "verdict": "correct"}]),
    ])
    monkeypatch.setattr(settings, "corpus_manifest", None)
    lt.main(["score", str(tmp_path / "*.json")])
    out = json.loads(capsys.readouterr().out)["bySplit"]["split unknown"]
    assert {k: out["dry_peek"][k] for k in ("correct", "wrong", "unsure", "precision", "recall")} == {
        "correct": 1, "wrong": 1, "unsure": 1, "precision": 0.5, "recall": None}
    assert (out["untraded_death"]["wrong"], out["unused_utility"]["correct"]) == (1, 1)
    assert out["untraded_death"]["correct"] == 0


def test_score_separates_test_split_demos(tmp_path, monkeypatch, capsys):
    other = _clip("F2", "dry_peek", "wrong", "2026-11-19T02:00")
    other["label"]["matchId"] = "demo-" + "b" * 64
    _export(tmp_path / "ana-notes.json", "2026-11-20", [_clip("F1", "dry_peek", "correct", "2026-11-19T01:00"), other])
    manifest = tmp_path / "manifest.csv"
    manifest.write_text("demoSha256,split\n" + "a" * 64 + ",test\n" + "b" * 64 + ",train\n", encoding="utf-8")
    monkeypatch.setattr(settings, "corpus_manifest", manifest)
    lt.main(["score", str(tmp_path / "*.json")])
    captured = capsys.readouterr()
    out = json.loads(captured.out)
    assert out["bySplit"]["test"]["dry_peek"]["correct"] == 1 and out["bySplit"]["train+validation"]["dry_peek"]["wrong"] == 1
    assert out["testSplitVerdicts"] == 1 and "test-split" in captured.err


def test_score_precision_recall():
    recs = [_record("a", [("dry_peek", 1, "correct"), ("dry_peek", 5, "wrong"), ("dry_peek", 9, "unsure")], missed=[("dry_peek", 30)])]
    s = lt.score(recs)["dry_peek"]
    assert (s["precision"], s["recall"], s["unsure"]) == (0.5, 0.5, 1)


def test_label_round_with_scripted_answers(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "analysis_profile", "all")
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
