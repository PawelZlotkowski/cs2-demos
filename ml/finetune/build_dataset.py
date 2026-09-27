"""Write the reviewed fine-tuning set (T50, T51) from the command line.

Same export as the Lab's Dataset tab: verifier-passed coach runs from
``data/traces/`` that were marked Accept or Edit, as chat-format JSONL split by
match into train, val and test. Run from the repo root:

    python ml/finetune/build_dataset.py [--out apps/api/data/dataset]
    python ml/finetune/build_dataset.py --stats   # counts only, nothing written

The output is derived from player data, so it stays out of git.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "apps" / "api"))

from app.services import dataset  # noqa: E402


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--out", type=Path, help="Folder for train/val/test.jsonl (default RR_DATASET_DIR or data/dataset)")
    p.add_argument("--stats", action="store_true", help="Print counts and write nothing")
    args = p.parse_args(argv)
    rows = [e for e, _m in dataset.examples()]
    verdicts = Counter(e.verdict or "not reviewed" for e in rows)
    print(f"{len(rows)} verifier-passed examples: " + ", ".join(f"{n} {v}" for v, n in sorted(verdicts.items())))
    if args.stats:
        return
    counts = dataset.export(args.out)
    print(f"Wrote {sum(counts.values())} examples to {args.out or dataset.dataset_dir()}: {counts}")


if __name__ == "__main__":
    main()
