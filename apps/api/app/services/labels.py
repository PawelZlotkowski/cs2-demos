"""Lab Labels (doc 29 §2.2, R07): detector labels and blind moment picks as committed files.

- Detector labels use the T17 format in ``data/labels/README.md``: one JSONL
  file per match, player and labeller, one line per labelled round. Agreement
  and precision/recall come from ``eval/label_tool.py`` so the page and the
  command line report the same numbers.
- Moment picks (T62) go to ``data/labels/moments/<match>-<player>-<labeller>.json``
  and are scored against the coach's picks with overlap@6 and NDCG@6.
"""

from __future__ import annotations

import json
import math
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.models.contracts import MomentPicks, RoundLabel, SelectedMoment

REPO_ROOT = Path(__file__).resolve().parents[4]
NAME_RE = re.compile(r"^[A-Za-z0-9_]{1,40}$")  # no "-": it separates the parts of the file name


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


def labellers() -> list[str]:
    names = set()
    for path in labels_dir().glob("*.jsonl"):
        names.add(path.stem.rsplit("-", 1)[-1])
    for path in (labels_dir() / "moments").glob("*.json"):
        names.add(path.stem.rsplit("-", 1)[-1])
    return sorted(names)


def _records(labeller: str) -> list[dict[str, Any]]:
    out = []
    for path in sorted(labels_dir().glob(f"*-{check_name(labeller)}.jsonl")):
        out += [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return out


def summary(a: str | None, b: str | None) -> dict[str, Any]:
    """Rounds labelled per labeller, precision/recall over everyone, and κ between two labellers."""
    tool = label_tool()
    names = labellers()
    per = {n: len(_records(n)) for n in names}
    all_records = [r for n in names for r in _records(n)]
    out: dict[str, Any] = {"labellers": per, "rounds": len(all_records), "tool": tool is not None}
    if tool is None:
        return out
    out["score"] = tool.score(all_records) if all_records else {}
    if a and b and a != b:
        out["agreement"] = {"a": a, "b": b, **tool.agreement(_records(a), _records(b))}
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
    NDCG@k: the coach's order scored against the human set, binary relevance."""
    human = picks.picks[:k]
    ranked = agent[:k]
    hits = [any(_same_moment(h.round, h.t0, h.t1, m) for h in human) for m in ranked]
    dcg = sum(1 / math.log2(i + 2) for i, hit in enumerate(hits) if hit)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(len(human), len(ranked))))
    return {
        "humanPicks": len(human),
        "coachPicks": len(ranked),
        "overlap": sum(hits),
        "overlapAt6": round(sum(hits) / len(ranked), 3) if ranked else None,
        "ndcgAt6": round(dcg / ideal, 3) if ideal else None,
        "coachSource": ranked[0].source if ranked else None,
    }
