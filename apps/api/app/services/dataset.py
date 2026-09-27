"""Fine-tuning set from the coach traces (T50) and the Lab Dataset review (T51, doc 29 R11).

An example is one coach run whose text passed the verifier on the first try
(a repaired run carries the failed attempt in its messages, so it is left
out). The chat messages of that run, tool calls and results included, are
the training conversation. Splits go by match, so no match is in two splits.

Only examples marked Accept or Edit are exported; an edit replaces the final
answer. The export goes to ``RR_DATASET_DIR`` (default ``data/dataset/``,
git-ignored: it is derived from player data).
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.contracts import DatasetExample, DatasetPage
from app.repositories.extras import extras
from app.services.traces import iter_traces

JOBS = ("explain", "ask", "ask_across", "summary", "wrapup", "practice_plan")
TARGET = 300  # reviewed examples the plan asks for (T51)


CITE_RE = re.compile(r"\[([^\]]+)\]")
NUMBER_RE = re.compile(r"(?<![A-Za-z:])\d+(?:[.,]\d+)?")


def edit_problem(ex: DatasetExample, text: str) -> str | None:
    """An edit may reword, but not cite or quote anything the verified output and its prompt did not have."""
    source = f"{ex.prompt}\n{ex.output}"
    new_cites = set(CITE_RE.findall(text)) - set(CITE_RE.findall(ex.output))
    if new_cites:
        return f"The edit cites {', '.join(sorted(new_cites))}, which the verified text did not."
    new_numbers = set(NUMBER_RE.findall(CITE_RE.sub("", text))) - set(NUMBER_RE.findall(source))
    if new_numbers:
        return f"The edit has numbers the evidence does not: {', '.join(sorted(new_numbers))}."
    return None


def split_of(key: str) -> str:
    """Stable 80/10/10 split by match (or player, for cross-match jobs)."""
    bucket = int(hashlib.sha1(key.encode("utf-8")).hexdigest(), 16) % 10
    return "test" if bucket == 0 else "val" if bucket == 1 else "train"


def _conversation(record: dict[str, Any]) -> list[dict[str, Any]] | None:
    runs = record.get("runs") or []
    if len(runs) != 1:
        return None
    messages = runs[0].get("messages") or []
    if not messages or messages[-1].get("role") != "assistant" or not runs[0].get("output"):
        return None
    return messages


def examples() -> list[tuple[DatasetExample, list[dict[str, Any]]]]:
    reviews = extras().dataset_reviews()
    out = []
    for trace_id, record in iter_traces():
        if record.get("job") not in JOBS or record.get("source") != "agent" or record.get("repaired"):
            continue
        messages = _conversation(record)
        if messages is None:
            continue
        prompt = next((str(m.get("content") or "") for m in messages if m.get("role") == "user"), "")
        review = reviews.get(trace_id) or {}
        out.append(
            (
                DatasetExample(
                    id=trace_id,
                    job=str(record["job"]),
                    lang=record.get("lang"),
                    match_id=record.get("matchId"),
                    split=split_of(str(record.get("matchId") or record.get("playerId") or trace_id)),  # type: ignore[arg-type]
                    prompt=prompt,
                    output=str(record["runs"][0]["output"]),
                    verdict=review.get("verdict"),
                    edited=review.get("text"),
                ),
                messages,
            )
        )
    return out


def page(*, job: str | None = None, pending: bool = False, limit: int = 20, offset: int = 0) -> DatasetPage:
    rows = [e for e, _m in examples()]
    counts = Counter(f"{e.job}/{e.lang or '-'}" for e in rows if e.verdict in ("accept", "edit"))
    reviewed = sum(1 for e in rows if e.verdict)
    if job:
        rows = [e for e in rows if e.job == job]
    if pending:
        rows = [e for e in rows if not e.verdict]
    return DatasetPage(items=rows[offset : offset + limit], total=len(rows), reviewed=reviewed, counts=dict(sorted(counts.items())))


def dataset_dir() -> Path:
    path = settings.dataset_dir or settings.data_dir / "dataset"
    path.mkdir(parents=True, exist_ok=True)
    return path


def export(folder: Path | None = None) -> dict[str, int]:
    """Write ``train.jsonl``, ``val.jsonl`` and ``test.jsonl`` (chat format) with the accepted examples."""
    folder = folder or dataset_dir()
    folder.mkdir(parents=True, exist_ok=True)
    lines: dict[str, list[str]] = {"train": [], "val": [], "test": []}
    for ex, messages in examples():
        if ex.verdict not in ("accept", "edit"):
            continue
        convo = [dict(m) for m in messages]
        if ex.verdict == "edit" and ex.edited:
            convo[-1] = {"role": "assistant", "content": ex.edited}
        row = {"id": ex.id, "job": ex.job, "lang": ex.lang, "messages": convo}
        lines[ex.split].append(json.dumps(row, ensure_ascii=False))
    for split, rows in lines.items():
        (folder / f"{split}.jsonl").write_text("".join(r + "\n" for r in rows), encoding="utf-8")
    return {split: len(rows) for split, rows in lines.items()}
