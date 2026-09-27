"""Label detector findings and measure agreement (task T17).

Run from the repo root with the API venv active:

    # 1. Label rounds of one processed match (interactive, terminal)
    python -m eval.label_tool label --match-dir apps/api/data/matches/match-abc123 \\
        --player 76561198000000001 --rounds 3,7,12 --labeller pawel

    # 2. Agreement on the shared rounds (Cohen's kappa)
    python -m eval.label_tool agreement data/labels/a.jsonl data/labels/b.jsonl

    # 3. Precision / recall per detector over any set of label files
    python -m eval.label_tool score data/labels/*.jsonl

Format: see data/labels/README.md. Labels never contain demo data beyond IDs,
round numbers, times and the labeller's notes.
"""

from __future__ import annotations

import argparse
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


def read_labels(paths: Iterable[Path]) -> list[dict[str, Any]]:
    records = []
    for p in paths:
        for line in Path(p).read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(json.loads(line))
    return records


def _event_key(record: dict[str, Any], row: dict[str, Any]) -> tuple:
    # IDs shift when detectors change, so events are matched by what and when
    return (record["matchId"], record["playerId"], record["round"], row["detector"], round(float(row["t"]) / MATCH_TOLERANCE_S))


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
        return 1.0 if observed == 1.0 else None
    return (observed - expected) / (1 - expected)


def agreement(a_records: list[dict[str, Any]], b_records: list[dict[str, Any]]) -> dict[str, Any]:
    def verdicts(records):
        out = {}
        for r in records:
            for row in r["findings"]:
                out[_event_key(r, row)] = row["verdict"]
        return out

    va, vb = verdicts(a_records), verdicts(b_records)
    shared = sorted(set(va) & set(vb))
    a = [va[k] for k in shared]
    b = [vb[k] for k in shared]
    by_detector: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for k in shared:
        by_detector[k[3]].append((va[k], vb[k]))
    return {
        "sharedFindings": len(shared),
        "rawAgreement": round(sum(x == y for x, y in zip(a, b)) / len(shared), 3) if shared else None,
        "kappa": None if (k := cohen_kappa(a, b)) is None else round(k, 3),
        "perDetector": {
            d: {"n": len(pairs), "agree": sum(x == y for x, y in pairs)} for d, pairs in sorted(by_detector.items())
        },
    }


def cmd_agreement(args: argparse.Namespace) -> None:
    result = agreement(read_labels([Path(args.a)]), read_labels([Path(args.b)]))
    print(json.dumps(result, indent=2))


# --- precision / recall ---


def score(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Per detector: precision = correct / (correct + wrong);
    recall = correct / (correct + missed). Unsure verdicts are left out."""
    counts: dict[str, Counter] = defaultdict(Counter)
    for r in records:
        for row in r["findings"]:
            counts[row["detector"]][row["verdict"]] += 1
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
            "recall": round(tp / (tp + fn), 3) if tp + fn else None,
        }
    return out


def cmd_score(args: argparse.Namespace) -> None:
    print(json.dumps(score(read_labels(Path(p) for p in args.files)), indent=2))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m eval.label_tool", description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
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


if __name__ == "__main__":
    main()
