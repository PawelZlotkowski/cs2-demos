"""Private subprocess entrypoint; only JSON is passed back to the API process."""

import argparse
import json
import time
from pathlib import Path

from app.processing.normalize import normalize_parsed
from app.processing.parse_demo import parse_demo_file


def main() -> None:
    args = argparse.ArgumentParser()
    args.add_argument("--demo", required=True)
    args.add_argument("--match-id", required=True)
    args.add_argument("--output", required=True)
    args.add_argument("--max-bytes", type=int, required=True)
    options = args.parse_args()
    start = time.perf_counter()
    parsed = parse_demo_file(options.demo)
    parse_seconds = time.perf_counter() - start
    start = time.perf_counter()
    result = normalize_parsed(options.match_id, parsed)
    result["workerPerf"] = {
        "parseSeconds": round(parse_seconds, 3),
        "normalizeSeconds": round(time.perf_counter() - start, 3),
    }
    output = Path(options.output)
    temporary = output.with_suffix(".tmp")
    count = 0
    try:
        with temporary.open("wb") as stream:
            for chunk in json.JSONEncoder(separators=(",", ":"), allow_nan=False).iterencode(result):
                encoded = chunk.encode("utf-8")
                count += len(encoded)
                if count > options.max_bytes:
                    raise RuntimeError("Replay output exceeded the configured size limit.")
                stream.write(encoded)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
