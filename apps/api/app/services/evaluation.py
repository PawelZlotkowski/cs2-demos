"""Lab Evaluation (doc 29 §2.2, R10): per-model tables from the coach traces.

Every coach job already writes a trace, so the table needs no separate run:
use the app (or ``python -m eval.compare_models run``) with one model, restart
llama-server with the other, use it again, and both show up side by side.
``eval/results/*.json`` files from ``compare_models`` are listed as they are.

Blind A/B: two models' verified answers to the same job, target and language,
shown without the model names; the vote is stored with the trace ids, and the
tally maps them back to models.
"""

from __future__ import annotations

import json
import random
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.models.contracts import (
    ABPair,
    ABSide,
    EvalResultFile,
    EvalRow,
    EvalSummary,
    RatingTally,
)
from app.repositories.extras import extras
from app.services.labels import REPO_ROOT
from app.services.traces import iter_traces, steps_of, verdict_of

RESULTS_DIR = REPO_ROOT / "eval" / "results"
TEXT_JOBS = ("explain", "ask", "ask_across", "summary", "wrapup", "practice_plan")


def _model(record: dict[str, Any]) -> str:
    return str(record.get("model") or "unknown").removesuffix(".gguf")


def _latency(record: dict[str, Any]) -> float | None:
    if record.get("latencyS") is not None:
        return float(record["latencyS"])
    if record.get("attempts"):
        return round(sum(a.get("latencyS") or 0 for a in record["attempts"]), 3)
    return None


def eval_rows() -> list[EvalRow]:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for _id, record in iter_traces():
        # Template-only runs (model off) never reached a model
        if not record.get("runs") and not record.get("attempts"):
            continue
        groups[(_model(record), str(record.get("job") or "unknown"))].append(record)
    rows = []
    for (model, job), records in sorted(groups.items()):
        ok = [bool(verdict_of(r)[0]) for r in records]
        steps = [s for r in records for s in steps_of(r)]
        latencies = [x for r in records if (x := _latency(r)) is not None]
        langs: dict[str, list[bool]] = defaultdict(list)
        for r, passed in zip(records, ok, strict=True):
            if r.get("lang"):
                langs[r["lang"]].append(passed)
        rows.append(
            EvalRow(
                model=model,
                job=job,
                runs=len(records),
                verified=sum(ok),
                fallbacks=len(records) - sum(ok),
                repaired=sum(1 for r in records if r.get("repaired") or len(r.get("attempts") or []) > 1),
                tool_calls=len(steps),
                tool_errors=sum(1 for s in steps if s.get("error")),
                median_s=round(statistics.median(latencies), 2) if latencies else None,
                by_lang={k: f"{sum(v)}/{len(v)}" for k, v in sorted(langs.items())},
            )
        )
    return rows


def result_files(folder: Path | None = None) -> list[EvalResultFile]:
    folder = folder or RESULTS_DIR
    out = []
    for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        try:
            body = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(body, dict) and isinstance(body.get("summary"), dict):
            out.append(
                EvalResultFile(file=path.name, label=str(body.get("label") or path.stem), model=body.get("model"), summary=body["summary"])
            )
    return out


def _target(record: dict[str, Any]) -> str | None:
    job = record.get("job")
    if job == "explain":
        return f"{record.get('matchId')}/{record.get('target')}"
    if job in ("summary", "wrapup"):
        return f"{record.get('matchId')}/{job}"
    if job in ("ask", "ask_across"):
        q = " ".join(str(record.get("question") or "").lower().split())
        return f"{record.get('matchId') or record.get('playerId')}/{q}" if q else None
    if job == "practice_plan":
        return str(record.get("playerId"))
    return None


def _question(record: dict[str, Any]) -> str:
    if record.get("question"):
        return str(record["question"])
    from app.repositories.matches import repo

    match = (repo.get(str(record.get("matchId"))) or {}).get("match") or {}
    where = f" on {match['map']}, {match.get('score', '')}".rstrip(", ") if match.get("map") else ""
    job, target = record.get("job"), str(record.get("target") or "")
    if job == "explain":
        what = f"moment {target[1:]}" if target.startswith("m") else f"round {target[1:]}" if target.startswith("r") else "a noted window"
        return f"Explain {what} of the match{where}"
    if job in ("summary", "wrapup"):
        return f"The {'overview summary' if job == 'summary' else 'wrap-up'} of the match{where}"
    return "The practice plan"


def _answer_text(record: dict[str, Any]) -> str:
    runs = record.get("runs") or []
    return str(runs[-1].get("output") or "") if runs else ""


def ab_pair(rng: random.Random | None = None) -> ABPair | None:
    """A pair of verified answers from two models that has not been rated yet."""
    rng = rng or random.Random()
    by_key: dict[tuple[str, str, str], dict[str, tuple[str, dict[str, Any]]]] = defaultdict(dict)
    for trace_id, record in iter_traces():
        if record.get("job") not in TEXT_JOBS or record.get("source") != "agent":
            continue
        target = _target(record)
        if target is None:
            continue
        # Newest answer per model wins
        by_key[(str(record["job"]), target, str(record.get("lang") or ""))][_model(record)] = (trace_id, record)
    rated = {frozenset((r["a"], r["b"])) for r in extras().ratings()}
    options = []
    for (job, target, lang), models in by_key.items():
        names = sorted(models)
        for i, m1 in enumerate(names):
            for m2 in names[i + 1 :]:
                (id1, r1), (id2, r2) = models[m1], models[m2]
                if frozenset((id1, id2)) not in rated:
                    options.append((job, target, lang, (id1, r1), (id2, r2)))
    if not options:
        return None
    job, target, lang, one, two = rng.choice(sorted(options, key=lambda o: (o[0], o[1], o[2])))
    first, second = (one, two) if rng.random() < 0.5 else (two, one)
    return ABPair(
        job=job,
        target=target,
        lang=lang or None,
        question=_question(first[1]),
        a=ABSide(trace_id=first[0], text=_answer_text(first[1])),
        b=ABSide(trace_id=second[0], text=_answer_text(second[1])),
    )


def rating_tally() -> list[RatingTally]:
    models = {trace_id: _model(record) for trace_id, record in iter_traces()}
    tally: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    for r in extras().ratings():
        a, b = models.get(r["a"]), models.get(r["b"])
        if not a or not b:
            continue
        if r["winner"] == "tie":
            tally[a][2] += 1
            tally[b][2] += 1
        else:
            win, lose = (a, b) if r["winner"] == "a" else (b, a)
            tally[win][0] += 1
            tally[lose][1] += 1
    return [RatingTally(model=m, wins=w, losses=lo, ties=t) for m, (w, lo, t) in sorted(tally.items())]


def eval_summary() -> EvalSummary:
    return EvalSummary(rows=eval_rows(), results=result_files(), ratings=rating_tally())
