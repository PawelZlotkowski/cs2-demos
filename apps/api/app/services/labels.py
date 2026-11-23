"""Lab Labels (doc 29 §2.2, R07): detector labels and blind moment picks as committed files.

- Detector labels use the T17 format in ``data/labels/README.md``: one JSONL
  file per match, player and labeller, one line per labelled round. The clip
  labeller's note exports (``round-reviewer-notes-v1``) are read too. Agreement
  and precision/recall come from ``eval/label_tool.py`` so the page and the
  command line report the same numbers.
- Moment picks (T62) go to ``data/labels/moments/<match>-<player>-<labeller>.json``
  and are scored against the coach's picks with overlap@6 and NDCG@6.
"""

from __future__ import annotations

import csv
import json
import math
import re
import sys
from collections import Counter
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.models.contracts import MomentPicks, RoundLabel, SelectedMoment

REPO_ROOT = Path(__file__).resolve().parents[4]
NAME_RE = re.compile(r"^[A-Za-z0-9_]{1,40}$")  # no "-": it separates the parts of the file name
NOTES_FORMAT = "round-reviewer-notes-v1"
VERDICTS = ("correct", "wrong", "unsure")


def labels_dir() -> Path:
    from app.core.config import settings

    path = settings.labels_dir or REPO_ROOT / "data" / "labels"
    path.mkdir(parents=True, exist_ok=True)
    return path


def label_tool() -> Any:
    """``eval/label_tool.py``, or None when the API runs without the repo (Docker image)."""
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    try:
        from eval import label_tool
    except ImportError:
        return None
    return label_tool


def check_name(labeller: str) -> str:
    if not NAME_RE.match(labeller):
        raise ValueError("Use letters, digits or _ for the labeller name (at most 40).")
    return labeller


def _label_file(match_id: str, player_id: str, labeller: str) -> Path:
    return labels_dir() / f"{match_id}-{player_id}-{check_name(labeller)}.jsonl"


def read_rounds(match_id: str, player_id: str, labeller: str) -> list[RoundLabel]:
    path = _label_file(match_id, player_id, labeller)
    if not path.exists():
        return []
    return [RoundLabel.model_validate(json.loads(line)) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def save_round(label: RoundLabel) -> RoundLabel:
    """Replace this labeller's line for the round (or add it)."""
    label = label.model_copy(update={"labelled_at": datetime.now(UTC).isoformat(timespec="seconds")})
    rows = [r for r in read_rounds(label.match_id, label.player_id, label.labeller) if r.round != label.round]
    rows.append(label)
    rows.sort(key=lambda r: r.round)
    path = _label_file(label.match_id, label.player_id, label.labeller)
    path.write_text("".join(json.dumps(r.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")
    return label


def _clip_rows(label: dict[str, Any]) -> list[dict[str, Any]]:
    """Verdicts on a clip's findings: its per-finding reviews, or the clip verdict when it shows one finding."""
    members = (label.get("footage") or {}).get("findings") or [label["finding"]]
    verdicts = {r.get("findingId"): r.get("verdict") for r in label.get("signalReviews") or []}
    if len(members) == 1:
        verdicts.setdefault(members[0].get("id"), label.get("verdict"))
    # One verdict over several findings cannot say which of them was right, so those are left out.
    return [
        {"findingId": f.get("id"), "detector": f.get("detector"), "t": f.get("t"), "verdict": verdicts[f.get("id")]}
        for f in members
        if verdicts.get(f.get("id")) in VERDICTS
    ]


def read_label_files(paths: Iterable[Path]) -> list[dict[str, Any]]:
    """Round records (the JSONL line format) from JSONL files and ``round-reviewer-notes-v1`` exports.

    A round labelled again keeps its newest line. Exports are cumulative, so each clip
    keeps its newest save (a withdrawal included), and its scored findings join its round;
    exports list no missed events, so those rounds have ``missed`` None.
    """
    rounds: dict[tuple, dict[str, Any]] = {}
    clips: dict[tuple, dict[str, Any]] = {}
    for path in paths:
        text = Path(path).read_text(encoding="utf-8")
        try:
            doc = json.loads(text)
        except ValueError:
            doc = None  # several JSONL lines
        if isinstance(doc, dict) and "findings" not in doc:
            # One JSON document that is not a round line: a notes export, or something else (skipped)
            entries = doc.get("labels") if doc.get("format") == NOTES_FORMAT else None
            for entry in entries or []:
                label = entry.get("label") or {}
                if entry.get("kind") != "clip" or not isinstance(label.get("finding"), dict):
                    continue
                review = (label.get("footage") or {}).get("reviewKey") or label["finding"].get("id")
                key = (label.get("matchId"), label.get("playerId"), label.get("snapshotId"), review, label.get("labeller"))
                if key not in clips or entry.get("savedAt", "") >= clips[key].get("savedAt", ""):
                    clips[key] = entry
            continue
        for line in text.splitlines():
            if line.strip():
                record = json.loads(line)
                key = (record["labeller"], record["matchId"], record["playerId"], record["round"])
                if key not in rounds or record.get("labelledAt", "") >= rounds[key].get("labelledAt", ""):
                    rounds[key] = record
    for entry in clips.values():
        label = entry["label"]
        rows = _clip_rows(label) if label.get("status") == "complete" else []
        if rows:
            key = (label.get("labeller"), label.get("matchId"), label.get("playerId"), label.get("round"))
            record = rounds.setdefault(
                key, {"labeller": key[0], "matchId": key[1], "playerId": key[2], "round": key[3], "findings": [], "missed": None}
            )
            record["findings"] += rows
    return list(rounds.values())


def manifest_splits() -> dict[str, str] | None:
    """``demo-<sha256>`` -> train, val or test from RR_CORPUS_MANIFEST; None when it is not set."""
    from app.core.config import settings

    if settings.corpus_manifest is None:
        return None
    with Path(settings.corpus_manifest).open(encoding="utf-8-sig", newline="") as fh:
        return {"demo-" + row["demoSha256"]: row["split"] for row in csv.DictReader(fh)}


def _records() -> list[dict[str, Any]]:
    folder = labels_dir()
    return read_label_files(sorted(folder.glob("*.jsonl")) + sorted(folder.glob("*.json")))


def labellers() -> list[str]:
    names = {r["labeller"] for r in _records()}
    for path in (labels_dir() / "moments").glob("*.json"):
        names.add(path.stem.rsplit("-", 1)[-1])
    return sorted(names)


def summary(a: str | None, b: str | None) -> dict[str, Any]:
    """Rounds labelled per labeller, precision/recall over everyone (also per split), and κ between two labellers."""
    tool = label_tool()
    all_records = _records()
    per = Counter(r["labeller"] for r in all_records)
    out: dict[str, Any] = {"labellers": {n: per[n] for n in labellers()}, "rounds": len(all_records), "tool": tool is not None}
    if tool is None:
        return out
    out["score"] = tool.score(all_records) if all_records else {}
    out.update(tool.score_by_split(all_records, manifest_splits()))
    if a and b and a != b:
        mine = [[r for r in all_records if r["labeller"] == name] for name in (a, b)]
        out["agreement"] = {"a": a, "b": b, **tool.agreement(*mine)}
    return out


# --- moment picks (T62) ---


def _picks_file(match_id: str, player_id: str, labeller: str) -> Path:
    folder = labels_dir() / "moments"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{match_id}-{player_id}-{check_name(labeller)}.json"


def read_picks(match_id: str, player_id: str, labeller: str) -> MomentPicks | None:
    path = _picks_file(match_id, player_id, labeller)
    return MomentPicks.model_validate_json(path.read_text(encoding="utf-8")) if path.exists() else None


def save_picks(picks: MomentPicks) -> MomentPicks:
    _picks_file(picks.match_id, picks.player_id, picks.labeller).write_text(
        picks.model_dump_json(by_alias=True, indent=1), encoding="utf-8"
    )
    return picks


def _same_moment(a_round: int, a_t0: float, a_t1: float, b: SelectedMoment) -> bool:
    return a_round == b.round and a_t0 <= b.t1 and b.t0 <= a_t1


def score_picks(picks: MomentPicks, agent: list[SelectedMoment], k: int = 6) -> dict[str, Any]:
    """overlap@k: share of the coach's picks (at most k) the human also picked (same round, windows overlap).
    NDCG@k: the coach's order scored against the human set, binary relevance.
    Each human pick matches at most one coach pick; both are None without human picks."""
    human = list({(h.round, h.t0, h.t1): h for h in picks.picks}.values())[:k]
    ranked = agent[:k]
    owner: dict[int, int] = {}  # human pick -> the coach pick it matched

    def claim(j: int, seen: set[int]) -> bool:
        # Augmenting path in rank order: an earlier coach pick never loses its match, so DCG is the highest possible
        for i, h in enumerate(human):
            if i not in seen and _same_moment(h.round, h.t0, h.t1, ranked[j]):
                seen.add(i)
                if i not in owner or claim(owner[i], seen):
                    owner[i] = j
                    return True
        return False

    hits = [claim(j, set()) for j in range(len(ranked))]
    dcg = sum(1 / math.log2(i + 2) for i, hit in enumerate(hits) if hit)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(len(human), k)))
    return {
        "humanPicks": len(human),
        "coachPicks": len(ranked),
        "overlap": sum(hits),
        "overlapAt6": round(sum(hits) / len(ranked), 3) if ranked and human else None,
        "ndcgAt6": round(dcg / ideal, 3) if ideal else None,
        "coachSource": ranked[0].source if ranked else None,
    }
