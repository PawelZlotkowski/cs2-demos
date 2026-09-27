"""Doc 29 R07–R17: notes, plan, knowledge, labels, evaluation, dataset, matches, progress."""

from __future__ import annotations

import json
import shutil

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.rag.ingest import KNOWLEDGE_DIR
from app.repositories.matches import repo

client = TestClient(app)


def lab_on(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "lab_enabled", True)
    monkeypatch.setattr(settings, "labels_dir", tmp_path / "labels")
    monkeypatch.setattr(settings, "dataset_dir", tmp_path / "dataset")


# --- R08 Notes ---


def test_bookmarks_and_ask_about_this(analysed):
    mid, pid = analysed
    assert client.get(f"/matches/{mid}/bookmarks").json() == []
    r = client.post(f"/matches/{mid}/bookmarks", json={"round": 2, "t": 30.5, "note": "Why did I push here?"})
    assert r.status_code == 200
    mark = r.json()
    assert mark["id"].startswith("b") and mark["round"] == 2 and mark["t"] == 30.5
    assert client.post(f"/matches/{mid}/bookmarks", json={"round": 99, "t": 1, "note": "x"}).status_code == 404

    expl = client.post(f"/matches/{mid}/players/{pid}/bookmarks/{mark['id']}/explain", json={"language": "en"})
    assert expl.status_code == 200
    body = expl.json()
    assert body["target"] == "w2:24.5-34.5" and body["source"] == "template"
    in_window = {f.id for f in repo.analysis.findings(mid, pid, round_no=2) if 24.5 <= f.t <= 34.5}
    assert set(body["findingIds"]) == in_window
    # Its clip is queued for the window
    assert any(c["round"] == 2 and c["t0"] == 24.5 and c["t1"] == 34.5 for c in repo.analysis.clip_jobs(mid, pid))

    assert client.delete(f"/matches/{mid}/bookmarks/{mark['id']}").status_code == 204
    assert client.delete(f"/matches/{mid}/bookmarks/{mark['id']}").status_code == 404


# --- R15 done well ---


def test_done_well_finds_good_plays_in_the_same_zone(analysed):
    mid, pid = analysed
    findings = repo.analysis.findings(mid, pid)
    good_zones = {f.zone for f in findings if f.kind == "good" and f.zone}
    mistake = next(
        (f for f in findings if f.kind == "mistake" and f.zone in good_zones and any(
            g.kind == "good" and g.zone == f.zone and g.round != f.round for g in findings)),
        None,
    )
    assert mistake is not None, "synthetic match should have a good play and a mistake in one zone"
    body = client.get(f"/matches/{mid}/players/{pid}/findings/{mistake.id}/done-well").json()
    assert body["zone"] == mistake.zone and body["items"]
    for item in body["items"]:
        assert item["zone"] == mistake.zone and item["sameMatch"] and item["id"] == f"M1:{item['findingId']}"
        assert item["round"] != mistake.round
    assert client.get(f"/matches/{mid}/players/{pid}/findings/F999/done-well").status_code == 404


# --- R16 clip download ---


def test_clip_download_name_says_what_happened(analysed):
    from app.api.routes import clip_download_name
    from app.models.contracts import MomentClip

    mid, pid = analysed
    moment = repo.analysis.moments(mid, pid)[0]
    clip = MomentClip(id="c1", playerId=pid, round=moment.round, t0=62.4, t1=70, momentId=moment.id, status="ready")
    name = clip_download_name(mid, pid, clip)
    assert name.endswith("-1-02.mp4") and f"round-{moment.round}" in name
    assert name == name.lower() and " " not in name


# --- R09 Plan ---


def test_practice_plan_template_and_ticks(analysed):
    _mid, pid = analysed
    plan = client.get(f"/players/{pid}/plan?lang=en").json()
    assert plan["source"] == "template" and 1 <= len(plan["items"]) <= 3
    first = plan["items"][0]
    assert first["matchesWith"] == 1 and first["matchesTotal"] == 1 and first["per10Recent"] is None
    assert first["example"].startswith("M1:F") and plan["matches"] == {"M1": _mid}
    assert f"[{first['example']}]" in plan["text"]
    if first["drillId"]:
        assert f"[{first['drillId']}]" in plan["text"]

    ticked = client.put(f"/players/{pid}/plan/{first['detector']}?lang=en", json={"done": True}).json()
    assert ticked["items"][0]["done"] and ticked["items"][0]["doneAt"]
    again = client.get(f"/players/{pid}/plan?lang=en").json()
    assert again["items"][0]["done"] and again["createdAt"] == plan["createdAt"]
    fresh = client.post(f"/players/{pid}/plan?lang=pl").json()
    assert fresh["lang"] == "pl" and fresh["items"][0]["done"]
    assert client.put(f"/players/{pid}/plan/nope", json={"done": True}).status_code == 404
    assert client.get("/players/nobody/plan").status_code == 404


def test_practice_plan_by_the_model_is_verified(analysed, tmp_path):
    from app.coach.agent import TraceWriter
    from app.coach.backends import InProcessTools
    from app.coach.jobs import CoachJobs, run_sync
    from app.coach.llm_client import MockLLMClient
    from app.coach.plan import plan_items

    _mid, pid = analysed
    items = plan_items(pid)
    lead = items[0]
    text = f"Work on {lead.label.lower()} first: it happened in {lead.matches_with} of your {lead.matches_total} matches [{lead.example}]."
    jobs = CoachJobs(repo, llm=MockLLMClient([text]), tools_factory=InProcessTools, traces=TraceWriter(tmp_path / "t"))
    plan = run_sync(jobs.practice_plan(pid, "en"))
    assert plan.source == "agent" and lead.example in plan.citations

    made_up = CoachJobs(
        repo, llm=MockLLMClient(["You died 17 times on A [M1:F1].", "Still 17 [M1:F1]."]),
        tools_factory=InProcessTools, traces=TraceWriter(tmp_path / "t"),
    )
    assert run_sync(made_up.practice_plan(pid, "en")).source == "template"


# --- R12 Knowledge ---


def test_knowledge_browse_zones_flag_and_notes(analysed, tmp_path, monkeypatch):
    from app.rag.index import KnowledgeIndex, use_index

    kdir = tmp_path / "knowledge"
    shutil.copytree(KNOWLEDGE_DIR, kdir, ignore=shutil.ignore_patterns("__pycache__", "*.py"))
    monkeypatch.setattr(settings, "knowledge_dir", kdir)
    use_index(KnowledgeIndex(tmp_path / "k.db", kdir))

    zones = client.get("/maps/mirage/zones").json()
    assert zones and all(z["polygons"] for z in zones)
    assert client.get("/maps/dust2/zones").status_code == 404

    rows = client.get("/knowledge?map=de_mirage").json()
    assert rows and all(r["map"] in ("de_mirage", "all") for r in rows)
    zoned = next(r for r in rows if r["zones"])
    by_zone = client.get(f"/knowledge?map=de_mirage&zone={zoned['zones'][0]}").json()
    assert zoned["id"] in {r["id"] for r in by_zone}
    assert all(zoned["zones"][0].lower() in {z.lower() for z in r["zones"]} for r in by_zone)

    assert client.post(f"/knowledge/{zoned['id']}/flag", json={"note": "Smoke line is outdated"}).status_code == 204
    again = next(r for r in client.get("/knowledge?map=de_mirage").json() if r["id"] == zoned["id"])
    assert again["flags"] == ["Smoke line is outdated"]

    before = {r["id"]: r["title"] for r in client.get("/knowledge").json()}
    note = {"map": "de_mirage", "title": "Window from short", "zones": ["Window"], "text": "Clear short before you peek window, then trade."}
    assert client.post("/knowledge/notes", json=note).status_code == 404  # admin only
    monkeypatch.setattr(settings, "lab_enabled", True)
    added = client.post("/knowledge/notes", json=note).json()
    assert added["title"] == "Window from short" and added["zones"] == ["Window"] and added["source"] == "own notes"
    after = {r["id"]: r["title"] for r in client.get("/knowledge").json()}
    # Existing ids keep their passages, so stored [K..] citations still point at the same text
    assert all(after[k] == v for k, v in before.items())


# --- R13, R17 Matches and Progress ---


def test_matches_rerun_keeps_the_old_review(analysed):
    mid, pid = analysed
    row = next(r for r in client.get("/matches").json() if r["id"] == mid)
    assert row["playerId"] == pid and row["moments"] > 0 and row["versions"] == 0 and row["model"] is None

    client.get(f"/matches/{mid}/players/{pid}/review/summary?lang=en")
    r = client.post(f"/matches/{mid}/rerun", json={"language": "en"})
    assert r.status_code == 200
    versions = client.get(f"/matches/{mid}/versions").json()
    assert len(versions) == 1 and versions[0]["model"] == "templates"
    assert versions[0]["moments"] and any(e["target"] == "summary" for e in versions[0]["explanations"])
    assert next(r for r in client.get("/matches").json() if r["id"] == mid)["versions"] == 1


def test_progress_lists_detectors_and_death_zones(analysed):
    mid, pid = analysed
    body = client.get(f"/players/{pid}/progress").json()
    assert body["matches"][0]["ref"] == "M1" and body["matches"][0]["matchId"] == mid
    kinds = [d["kind"] for d in body["detectors"]]
    assert kinds == sorted(kinds, key=lambda k: k == "good")  # mistakes first
    assert all(len(d["counts"]) == 1 for d in body["detectors"])
    for z in body["zones"]:
        assert z["deaths"] > 0 and all(e.startswith("M1:F") for e in z["examples"])
    assert client.get("/players/nobody/progress").status_code == 404


# --- R07 Labels ---


def test_labels_are_t17_lines_and_picks_are_scored_blind(analysed, tmp_path, monkeypatch):
    mid, pid = analysed
    assert client.get("/lab/labels/summary").status_code == 404
    lab_on(monkeypatch, tmp_path)
    f = repo.analysis.findings(mid, pid)[0]
    line = {
        "matchId": mid, "map": "de_mirage", "playerId": pid, "round": f.round, "labeller": "pawel",
        "findings": [{"findingId": f.id, "detector": f.detector, "t": f.t, "verdict": "correct"}],
        "missed": [{"detector": "dry_peek", "t": 12.0}],
    }
    assert client.put("/lab/labels", json=line).status_code == 200
    assert client.put("/lab/labels", json={**line, "labeller": "a b"}).status_code in (400, 422)
    bad = {**line, "findings": [{"findingId": "F999", "detector": "x", "t": 1, "verdict": "wrong"}]}
    assert client.put("/lab/labels", json=bad).status_code == 400
    saved = (tmp_path / "labels" / f"{mid}-{pid}-pawel.jsonl").read_text().splitlines()
    assert len(saved) == 1 and json.loads(saved[0])["labelledAt"]
    client.put("/lab/labels", json={**line, "labeller": "ana"})
    summary = client.get("/lab/labels/summary?a=pawel&b=ana").json()
    assert summary["labellers"] == {"ana": 1, "pawel": 1}
    assert summary["agreement"]["a"] == "pawel" and "kappa" in json.dumps(summary["agreement"]).lower()

    assert client.get(f"/lab/picks/{mid}/{pid}?labeller=pawel").json() == {"picks": None, "score": None}
    coach = repo.analysis.moments(mid, pid)
    picks = [{"round": m.round, "t0": m.t0, "t1": m.t1, "kind": m.kind} for m in coach[:3]]
    out = client.put("/lab/picks", json={"matchId": mid, "playerId": pid, "labeller": "pawel", "picks": picks}).json()
    n = min(3, len(coach))
    assert out["score"]["overlap"] == n and out["score"]["humanPicks"] == n
    assert out["score"]["ndcgAt6"] == 1.0


# --- R10 Evaluation, R11 Dataset ---


def _trace(job, model, source, *, target="m1", lang="en", repaired=False, output="Text [F1].", match="m-a"):
    return {
        "job": job, "matchId": match, "playerId": "p", "target": target, "lang": lang, "model": model,
        "source": source, "repaired": repaired, "latencyS": 2.0,
        "verifier": {"ok": source == "agent", "errors": [] if source == "agent" else ["bad"]},
        "runs": [{
            "output": output,
            "steps": [{"tool": "get_finding", "args": {}, "result_bytes": 10, "ms": 3, "error": None}],
            "messages": [
                {"role": "system", "content": "sys"},
                {"role": "user", "content": f"Explain {target}"},
                {"role": "assistant", "content": output},
            ],
        }],
    }


def write_traces(folder, records):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "2026-09-27.jsonl").write_text("".join(json.dumps(r) + "\n" for r in records))


def test_evaluation_table_and_blind_ab(tmp_path, monkeypatch, analysed):
    lab_on(monkeypatch, tmp_path)
    monkeypatch.setattr(settings, "traces_dir", tmp_path / "tr")
    write_traces(tmp_path / "tr", [
        _trace("explain", "qwen3-14b", "agent"),
        _trace("explain", "qwen3-14b", "template", target="m2", lang="pl"),
        _trace("explain", "gemma-4-12b.gguf", "agent", output="Other text [F1]."),
        {"job": "explain", "source": "template", "runs": []},  # model off
    ])
    body = client.get("/lab/eval").json()
    rows = {(r["model"], r["job"]): r for r in body["rows"]}
    assert set(rows) == {("qwen3-14b", "explain"), ("gemma-4-12b", "explain")}
    q = rows[("qwen3-14b", "explain")]
    assert (q["runs"], q["verified"], q["fallbacks"], q["toolCalls"]) == (2, 1, 1, 2)
    assert q["byLang"] == {"en": "1/1", "pl": "0/1"}

    pair = client.get("/lab/eval/pair").json()
    assert {pair["a"]["text"], pair["b"]["text"]} == {"Text [F1].", "Other text [F1]."}
    assert "qwen" not in json.dumps(pair) and "gemma" not in json.dumps(pair)
    winner = "a" if pair["a"]["text"] == "Text [F1]." else "b"
    assert client.post("/lab/eval/rate", json={"a": pair["a"]["traceId"], "b": pair["b"]["traceId"], "winner": winner}).status_code == 204
    tally = {t["model"]: t for t in client.get("/lab/eval").json()["ratings"]}
    assert tally["qwen3-14b"]["wins"] == 1 and tally["gemma-4-12b"]["losses"] == 1
    assert client.get("/lab/eval/pair").json() is None  # the only pair is rated


def test_dataset_review_and_export(tmp_path, monkeypatch, analysed):
    lab_on(monkeypatch, tmp_path)
    monkeypatch.setattr(settings, "traces_dir", tmp_path / "tr")
    write_traces(tmp_path / "tr", [
        _trace("explain", "qwen", "agent", match="m-a"),
        _trace("explain", "qwen", "agent", target="m2", repaired=True),  # left out
        _trace("explain", "qwen", "template", target="m3"),  # left out
        _trace("ask", "qwen", "agent", target="q", match="m-b"),
        {"job": "select_moments", "source": "agent", "attempts": [{"output": "{}"}]},  # not a text job
    ])
    page = client.get("/lab/dataset").json()
    assert page["total"] == 2 and page["reviewed"] == 0
    first, second = page["items"]
    assert first["prompt"] == "Explain m1" and first["split"] in ("train", "val", "test")
    assert client.put(f"/lab/dataset/{first['id']}", json={"verdict": "edit"}).status_code == 400
    assert client.put(f"/lab/dataset/{first['id']}", json={"verdict": "edit", "text": "Better [F2]."}).status_code == 400
    assert client.put(f"/lab/dataset/{first['id']}", json={"verdict": "edit", "text": "Died 7 times [F1]."}).status_code == 400
    assert client.put(f"/lab/dataset/{first['id']}", json={"verdict": "edit", "text": "Better [F1]."}).status_code == 204
    assert client.put(f"/lab/dataset/{second['id']}", json={"verdict": "reject"}).status_code == 204
    assert client.put("/lab/dataset/2026-09-27:99", json={"verdict": "accept"}).status_code == 404
    page = client.get("/lab/dataset?pending=true").json()
    assert page["total"] == 0 and page["reviewed"] == 2 and page["counts"] == {"explain/en": 1}

    out = client.post("/lab/dataset/export").json()
    assert sum(out["counts"].values()) == 1
    lines = [json.loads(line) for s in ("train", "val", "test") for line in (tmp_path / "dataset" / f"{s}.jsonl").read_text().splitlines()]
    assert lines[0]["messages"][-1] == {"role": "assistant", "content": "Better [F1]."}
