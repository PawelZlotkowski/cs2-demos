"""Label detector findings and measure agreement (task T17).

Run from the repo root with the API venv active:

    # 1. Label rounds of one processed match (interactive, terminal)
    python -m eval.label_tool label --match-dir apps/api/data/matches/match-abc123 \\
        --player 76561198000000001 --rounds 3,7,12 --labeller pawel

    # 2. Agreement on the shared rounds (Cohen's kappa)
    python -m eval.label_tool agreement data/labels/a.jsonl data/labels/b.jsonl

    # 3. Precision / recall per detector over any set of label files (JSONL or
    #    clip labeller exports); RR_CORPUS_MANIFEST splits it by train and test
    python -m eval.label_tool score "data/labels/*.json"

Format: see data/labels/README.md. Labels never contain demo data beyond IDs,
round numbers, times and the labeller's notes.
"""

from __future__ import annotations

import argparse
import glob
import json
import sys
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

VERDICTS = {"c": "correct", "w": "wrong", "u": "unsure"}
# Findings of the same detector within this many seconds are the same event
MATCH_TOLERANCE_S = 1.0


# --- loading a processed match ---


def load_match(match_dir: Path):
    from app.analysis.match_data import build_match_data

    analysis = json.loads((match_dir / "analysis.json").read_text(encoding="utf-8"))
    replays = {}
    for r in analysis.get("rounds") or []:
        path = match_dir / "rounds" / f"r{r['number']}.json"
        if path.exists():
            replays[f"r{r['number']}"] = json.loads(path.read_text(encoding="utf-8"))
    return build_match_data(analysis, replays)


# --- labelling ---


def label_round(
    match: Any,
    player_id: str,
    round_no: int,
    labeller: str,
    findings: list[Any],
    ask: Callable[[str], str] = input,
) -> dict[str, Any]:
    """Ask for a verdict on each finding of one round, then for missed events."""
    rows = []
    for f in findings:
        prompt = f"  {f.id} {f.detector} t={f.t:.1f}s {f.zone or '-'}: {f.summary}\n  [c]orrect / [w]rong / [u]nsure? "
        answer = ""
        while answer not in VERDICTS:
            answer = ask(prompt).strip().lower()[:1]
        note = ask("  note (enter to skip): ").strip()
        rows.append(
            {"findingId": f.id, "detector": f.detector, "t": f.t, "verdict": VERDICTS[answer], **({"note": note} if note else {})}
        )
    missed = []
    while True:
        line = ask("  missed event as '<detector> <t seconds> [note]' (enter to finish): ").strip()
        if not line:
            break
        parts = line.split(maxsplit=2)
        try:
            missed.append({"detector": parts[0], "t": float(parts[1]), **({"note": parts[2]} if len(parts) > 2 else {})})
        except (IndexError, ValueError):
            print("  could not read that; example: untraded_death 42.5 teammate was behind me")
    return {
        "matchId": match.match_id,
        "map": match.map_name,
        "playerId": player_id,
        "round": round_no,
        "labeller": labeller,
        "labelledAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "findings": rows,
        "missed": missed,
    }


def cmd_label(args: argparse.Namespace) -> None:
    from app.analysis.run import detect_findings

    match = load_match(Path(args.match_dir))
    findings = detect_findings(match, args.player)
    rounds = [int(r) for r in args.rounds.split(",")] if args.rounds else [r.number for r in match.rounds]
    out = Path(args.out or ROOT / "data" / "labels" / f"{match.match_id}-{args.player}-{args.labeller}.jsonl")
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("a", encoding="utf-8") as fh:
        for rnd in rounds:
            print(f"Round {rnd} ({match.name(args.player)}):")
            record = label_round(match, args.player, rnd, args.labeller, [f for f in findings if f.round == rnd])
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            fh.flush()
    print(f"Wrote {out}")


# --- reading labels ---


def expand(patterns: Iterable[str]) -> list[Path]:
    """File patterns expanded by Python, so ``data/labels/*.json`` also works in PowerShell."""
    return list(dict.fromkeys(Path(m) for p in patterns for m in (sorted(glob.glob(p)) or [p])))


def read_labels(paths: Iterable[Path]) -> list[dict[str, Any]]:
    """Round records from JSONL files and clip labeller exports, newest label kept (``app.services.labels``)."""
    from app.services.labels import read_label_files

    return read_label_files(paths)


# --- agreement ---


def cohen_kappa(a: list[str], b: list[str]) -> float | None:
    """Cohen's kappa for two raters over the same items; None if undefined."""
    if len(a) != len(b) or not a:
        return None
    n = len(a)
    observed = sum(1 for x, y in zip(a, b) if x == y) / n
    ca, cb = Counter(a), Counter(b)
    expected = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    if expected == 1.0:
        return None  # both always gave the same one verdict: chance agreement is total
    return (observed - expected) / (1 - expected)


def agreement(a_records: list[dict[str, Any]], b_records: list[dict[str, Any]]) -> dict[str, Any]:
    def rows(records):
        return [((r["matchId"], r["playerId"], r["round"], row["detector"]), row) for r in records for row in r["findings"]]

    ra, rb = rows(a_records), rows(b_records)
    by_key: dict[tuple, list[int]] = defaultdict(list)
    for j, (key, _row) in enumerate(rb):
        by_key[key].append(j)
    # IDs shift when detectors change: the same finding ID first, then the nearest time within the tolerance, one to one
    candidates = sorted(
        (x.get("findingId") != rb[j][1].get("findingId"), abs(float(x["t"]) - float(rb[j][1]["t"])), i, j)
        for i, (key, x) in enumerate(ra)
        for j in by_key[key]
        if abs(float(x["t"]) - float(rb[j][1]["t"])) <= MATCH_TOLERANCE_S
    )
    used_a, used_b, matched = set(), set(), []
    for _same, _dt, i, j in candidates:
        if i not in used_a and j not in used_b:
            used_a.add(i)
            used_b.add(j)
            matched.append((ra[i][0][3], ra[i][1]["verdict"], rb[j][1]["verdict"]))
    a = [x for _d, x, _y in matched]
    b = [y for _d, _x, y in matched]
    by_detector: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for det, x, y in matched:
        by_detector[det].append((x, y))
    return {
        "sharedFindings": len(matched),
        "rawAgreement": round(sum(x == y for x, y in zip(a, b)) / len(matched), 3) if matched else None,
        "kappa": None if (k := cohen_kappa(a, b)) is None else round(k, 3),
        "perDetector": {
            d: {"n": len(pairs), "agree": sum(x == y for x, y in pairs)} for d, pairs in sorted(by_detector.items())
        },
    }


def cmd_agreement(args: argparse.Namespace) -> None:
    result = agreement(read_labels(expand([args.a])), read_labels(expand([args.b])))
    print(json.dumps(result, indent=2))


# --- precision / recall ---


def score(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Per detector: precision = correct / (correct + wrong);
    recall = correct / (correct + missed). Unsure verdicts are left out. Clip labeller
    exports list no missed events, so recall is None where they contribute."""
    counts: dict[str, Counter] = defaultdict(Counter)
    for r in records:
        for row in r["findings"]:
            counts[row["detector"]][row["verdict"]] += 1
            counts[row["detector"]]["noMissedList"] += r.get("missed") is None
        for row in r.get("missed") or []:
            counts[row["detector"]]["missed"] += 1
    out = {}
    for det, c in sorted(counts.items()):
        tp, fp, fn = c["correct"], c["wrong"], c["missed"]
        out[det] = {
            "correct": tp,
            "wrong": fp,
            "missed": fn,
            "unsure": c["unsure"],
            "precision": round(tp / (tp + fp), 3) if tp + fp else None,
            "recall": round(tp / (tp + fn), 3) if tp + fn and not c["noMissedList"] else None,
        }
    return out


def score_by_split(records: list[dict[str, Any]], splits: dict[str, str] | None) -> dict[str, Any]:
    """Scores for train+validation and for test, by each label's demo in the corpus manifest (None: not set)."""
    if splits is None:
        return {"bySplit": {"split unknown": score(records)}, "testSplitVerdicts": None}
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        split = splits.get(r["matchId"])
        groups["test" if split == "test" else "train+validation" if split in ("train", "val") else "not in manifest"].append(r)
    return {
        "bySplit": {name: score(rs) for name, rs in sorted(groups.items())},
        "testSplitVerdicts": sum(len(r["findings"]) for r in groups.get("test", [])),
    }


def cmd_score(args: argparse.Namespace) -> None:
    from app.services.labels import manifest_splits

    out = score_by_split(read_labels(expand(args.files)), manifest_splits())
    print(json.dumps(out, indent=2))
    if out["testSplitVerdicts"]:
        print(f"Warning: {out['testSplitVerdicts']} verdicts are on test-split demos; keep them out of any tuning.", file=sys.stderr)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m eval.label_tool", description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("serve", help="open the local browser labeller (raw demos, roster, save/resume)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--data-dir", default=str(ROOT / ".local" / "annotation"))
    p.set_defaults(func=cmd_serve)
    p = sub.add_parser("label", help="label findings of a processed match")
    p.add_argument("--match-dir", required=True)
    p.add_argument("--player", required=True, help="SteamID64 of the coached player")
    p.add_argument("--labeller", required=True)
    p.add_argument("--rounds", help="comma-separated round numbers (default: all)")
    p.add_argument("--out", help="JSONL file to append to")
    p.set_defaults(func=cmd_label)
    p = sub.add_parser("agreement", help="Cohen's kappa between two labellers")
    p.add_argument("a")
    p.add_argument("b")
    p.set_defaults(func=cmd_agreement)
    p = sub.add_parser("score", help="precision and recall per detector")
    p.add_argument("files", nargs="+")
    p.set_defaults(func=cmd_score)
    args = parser.parse_args(argv)
    args.func(args)


def cmd_serve(args: argparse.Namespace) -> None:
    import os
    import uvicorn

    if not 1024 <= args.port <= 65535:
        raise SystemExit("Choose a port between 1024 and 65535.")
    if args.host not in ("127.0.0.1", "localhost", "0.0.0.0"):
        raise SystemExit("Use localhost, 127.0.0.1, or 0.0.0.0 inside a container with a loopback published port.")
    os.environ["RR_ANNOTATION_DIR"] = str(Path(args.data_dir).resolve())
    print(f"Round labels: http://127.0.0.1:{args.port} | data: {os.environ['RR_ANNOTATION_DIR']}", flush=True)
    uvicorn.run("app.annotation.server:create_app", factory=True, host=args.host, port=args.port, workers=1)


if __name__ == "__main__":
    main()
