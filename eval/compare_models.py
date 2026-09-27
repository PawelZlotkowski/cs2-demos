"""Compare coach models on the same processed match (Gemma 4 vs Qwen3 and so on).

Run from the repo root with the API venv active, once per model, with that
model's llama-server listening on RR_LLM_BASE_URL:

    # 1. Qwen3-14B (the 26 Sep baseline)
    RR_LLM_MODEL=qwen3-14b-q4_k_m python -m eval.compare_models run \\
        --match-id match-abc123 --label qwen3-14b --langs en,pl,nl

    # 2. Restart llama-server with Gemma 4 12B, then
    RR_LLM_MODEL=gemma-4-12b-it-q6_k python -m eval.compare_models run \\
        --match-id match-abc123 --label gemma-4-12b --langs en,pl,nl

    # 3. Side-by-side table plus every text, for a native read of PL and NL
    python -m eval.compare_models report eval/results/qwen3-14b.json eval/results/gemma-4-12b.json

Each run does what the app does for one player: moment selection (thinking
on), an explanation per moment and language, and a few Ask questions. The
match's stored moments are put back after selection and explanations are not
stored, so the app's data is unchanged and every model explains the same
moments. Sampling comes from the model name (see ``SAMPLING_PROFILES``) unless
``--sampling`` or the RR_LLM_* overrides say otherwise.

Everything stays local: the model is whatever llama-server serves, and no
hosted API is called (decision #16).
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

RESULTS_DIR = ROOT / "eval" / "results"

# Asked about the first moment's round, the first good moment and the match
QUESTIONS = {
    "en": ["What was my biggest mistake in this round?", "What did I do well here?", "What should I work on next match?"],
    "pl": ["Jaki był mój największy błąd w tej rundzie?", "Co zrobiłem tu dobrze?", "Nad czym mam popracować w następnym meczu?"],
    "nl": ["Wat was mijn grootste fout in deze ronde?", "Wat deed ik hier goed?", "Waar moet ik de volgende match aan werken?"],
}


class CapturingTraces:
    """Keeps every trace record in memory and still writes them to the traces folder."""

    def __init__(self, inner: Any) -> None:
        self.inner = inner
        self.records: list[dict[str, Any]] = []

    def write(self, record: dict[str, Any]) -> Any:
        self.records.append(record)
        return self.inner.write(record)

    def last(self) -> dict[str, Any]:
        return self.records[-1] if self.records else {}


def gpu_memory_mib() -> int | None:
    """Used VRAM on the first GPU, when nvidia-smi is on PATH."""
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10, check=True,
        ).stdout
        return int(out.split()[0])
    except (subprocess.SubprocessError, ValueError, IndexError):
        return None


def _tool_stats(record: dict[str, Any]) -> dict[str, int]:
    steps = [s for run in record.get("runs") or [] for s in run.get("steps") or []]
    return {"toolCalls": len(steps), "toolErrors": sum(1 for s in steps if s.get("error"))}


def _answer_row(kind: str, target: str, lang: str, text: str, source: str, errors: list[str], record: dict[str, Any], wall_s: float) -> dict[str, Any]:
    return {
        "kind": kind,
        "target": target,
        "lang": lang,
        "text": text,
        "verified": source == "agent",
        "repaired": bool(record.get("repaired")),
        "autocited": bool((record.get("verifier") or {}).get("autocited")),
        "errors": errors,
        "latencyS": round(wall_s, 2),
        "maxStepsHit": any(r.get("finish") == "max_steps" for r in record.get("runs") or []),
        **_tool_stats(record),
    }


def run(args: argparse.Namespace, llm: Any = None) -> Path:
    from app.coach.agent import TraceWriter
    from app.coach.jobs import CoachJobs, run_sync
    from app.coach.llm_client import LLMClient
    from app.core.config import settings
    from app.models.contracts import AskRequest
    from app.repositories.matches import repo

    settings.llm_enabled = True
    llm = llm or LLMClient(base_url=args.base_url, model=args.model, sampling=args.sampling)
    if not llm.available():
        sys.exit(f"No model server answers at {llm.base_url}. Start llama-server first.")
    record = repo.get(args.match_id)
    if record is None:
        sys.exit(f"Unknown match {args.match_id!r}. Known: {', '.join(repo.list_ids())}")
    player_id = args.player or (record.get("match") or {}).get("selectedPlayerId")
    if not player_id or not repo.analysis.has_analysis(args.match_id, player_id):
        sys.exit("Pick a player with --player (the match has no analysed player yet).")

    traces = CapturingTraces(TraceWriter(settings.resolved_traces_dir()))
    jobs = CoachJobs(repo, llm=llm, traces=traces)
    langs = [x.strip() for x in args.langs.split(",") if x.strip()]
    rows: list[dict[str, Any]] = []
    vram = [gpu_memory_mib()]

    # Moment selection, then put the stored moments back so every model explains the same ones
    before = repo.analysis.moments(args.match_id, player_id)
    t0 = time.perf_counter()
    sel = run_sync(jobs.select_moments(args.match_id, player_id))
    sel_record = traces.last()
    selection = {
        "verified": sel.source == "agent",
        "repaired": len(sel_record.get("attempts") or []) > 1,
        "errors": sel.errors,
        "latencyS": round(time.perf_counter() - t0, 2),
        "picked": [{"id": m.id, "round": m.round, "kind": m.kind, "findingIds": m.finding_ids} for m in sel.moments],
    }
    vram.append(gpu_memory_mib())
    if before:
        repo.analysis.replace_moments(args.match_id, player_id, before)
    moments = repo.analysis.moments(args.match_id, player_id)

    for _ in range(args.repeat):
        for lang in langs:
            for m in moments:
                t0 = time.perf_counter()
                expl = run_sync(jobs.explain(args.match_id, player_id, m.id, lang, store=False))
                rows.append(_answer_row("explain", m.id, lang, expl.text, expl.source, expl.verifier_errors, traces.last(), time.perf_counter() - t0))
                print(f"  explain {m.id} {lang}: {'ok' if expl.source == 'agent' else 'fallback'}", flush=True)
            first = moments[0] if moments else None
            good = next((m for m in moments if m.kind == "good"), first)
            asks = [
                AskRequest.model_validate({"question": QUESTIONS[lang][0], "language": lang, "round": first.round if first else None}),
                AskRequest.model_validate({"question": QUESTIONS[lang][1], "language": lang, "momentId": good.id if good else None}),
                AskRequest.model_validate({"question": QUESTIONS[lang][2], "language": lang}),
            ]
            for req in asks:
                t0 = time.perf_counter()
                out = run_sync(jobs.ask(args.match_id, player_id, req))
                rows.append(_answer_row("ask", req.question, lang, out.answer, out.source, out.errors, traces.last(), time.perf_counter() - t0))
                print(f"  ask {lang}: {'ok' if out.source == 'agent' else 'fallback'}", flush=True)
            vram.append(gpu_memory_mib())

    result = {
        "label": args.label,
        "model": llm.model,
        "sampling": llm.sampling,
        "samplingOverrides": {k: v for k, v in llm.sampling_overrides.items() if v is not None},
        "baseUrl": llm.base_url,
        "matchId": args.match_id,
        "playerId": player_id,
        "langs": langs,
        "ranAt": datetime.now(UTC).isoformat(),
        "vramMiBPeak": max((v for v in vram if v is not None), default=None),
        "selection": selection,
        "answers": rows,
        "summary": summarise(selection, rows),
    }
    out = Path(args.out) if args.out else RESULTS_DIR / f"{args.label}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))
    print(f"Wrote {out}")
    return out


def summarise(selection: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    def rate(items: list[dict[str, Any]]) -> str:
        return f"{sum(r['verified'] for r in items)}/{len(items)}"

    def median(xs: list[float]) -> float | None:
        xs = sorted(xs)
        return round(xs[len(xs) // 2], 2) if xs else None

    expl = [r for r in rows if r["kind"] == "explain"]
    asks = [r for r in rows if r["kind"] == "ask"]
    calls = sum(r["toolCalls"] for r in rows)
    failed = sum(r["toolErrors"] for r in rows)
    langs = sorted({r["lang"] for r in rows})
    return {
        "selectionVerified": selection["verified"],
        "selectionLatencyS": selection["latencyS"],
        "explanationsVerified": rate(expl),
        "explanationsByLang": {lang: rate([r for r in expl if r["lang"] == lang]) for lang in langs},
        "askVerified": rate(asks),
        "repaired": sum(r["repaired"] for r in rows),
        "autocited": sum(r["autocited"] for r in rows),
        "maxStepsHit": sum(r["maxStepsHit"] for r in rows),
        "toolCalls": calls,
        "toolCallSuccess": f"{calls - failed}/{calls}",
        "explainMedianS": median([r["latencyS"] for r in expl]),
        "askMedianS": median([r["latencyS"] for r in asks]),
    }


SUMMARY_ROWS = [
    ("Moment selection verified", lambda r: "yes" if r["summary"]["selectionVerified"] else "no (ranker)"),
    ("Moment selection time", lambda r: f"{r['summary']['selectionLatencyS']} s"),
    ("Explanations verified", lambda r: r["summary"]["explanationsVerified"]),
    ("  by language", lambda r: ", ".join(f"{k} {v}" for k, v in r["summary"]["explanationsByLang"].items())),
    ("Ask answers verified", lambda r: r["summary"]["askVerified"]),
    ("Needed a repair", lambda r: str(r["summary"]["repaired"])),
    ("Citation added by verifier", lambda r: str(r["summary"]["autocited"])),
    ("Ran out of tool steps", lambda r: str(r["summary"]["maxStepsHit"])),
    ("Tool calls without error", lambda r: r["summary"]["toolCallSuccess"]),
    ("Explanation median time", lambda r: f"{r['summary']['explainMedianS']} s"),
    ("Ask median time", lambda r: f"{r['summary']['askMedianS']} s"),
    ("Peak VRAM", lambda r: f"{r['vramMiBPeak'] / 1024:.1f} GB" if r.get("vramMiBPeak") else "n/a"),
    ("Sampling", lambda r: r["sampling"] + (f" {r['samplingOverrides']}" if r.get("samplingOverrides") else "")),
]


def report(args: argparse.Namespace) -> str:
    results = [json.loads(Path(p).read_text(encoding="utf-8")) for p in args.results]
    lines = [
        f"# Coach model comparison ({datetime.now(UTC):%d %b %Y})",
        "",
        f"Match `{results[0]['matchId']}`, player `{results[0]['playerId']}`.",
        "",
        "| | " + " | ".join(r["label"] for r in results) + " |",
        "|---|" + "---|" * len(results),
    ]
    for name, cell in SUMMARY_ROWS:
        lines.append(f"| {name} | " + " | ".join(cell(r) for r in results) + " |")
    lines += ["", "## Texts", "", "Fallbacks are marked; read the Polish and Dutch ones natively.", ""]
    keyed = [{(a["kind"], a["target"], a["lang"]): a for a in r["answers"]} for r in results]
    for key in dict.fromkeys(k for d in keyed for k in d):
        kind, target, lang = key
        lines.append(f"### {kind} {target} ({lang})")
        lines.append("")
        for r, d in zip(results, keyed, strict=True):
            a = d.get(key)
            if a is None:
                continue
            mark = "" if a["verified"] else " (fallback: " + "; ".join(a["errors"][:2]) + ")"
            lines.append(f"- **{r['label']}**{mark}: {a['text']}")
        lines.append("")
    text = "\n".join(lines)
    out = Path(args.out) if args.out else RESULTS_DIR / "comparison.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print("\n".join(lines[: 6 + len(SUMMARY_ROWS)]))
    print(f"Wrote {out}")
    return text


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("run", help="Run the coach jobs with the model llama-server is serving")
    p.add_argument("--match-id", required=True)
    p.add_argument("--player", help="Steam id (default: the match's selected player)")
    p.add_argument("--label", required=True, help="Name for this run, e.g. gemma-4-12b")
    p.add_argument("--langs", default="en,pl,nl")
    p.add_argument("--repeat", type=int, default=1, help="Repeat explanations and Ask to average out sampling noise")
    p.add_argument("--base-url", help="Default RR_LLM_BASE_URL")
    p.add_argument("--model", help="Default RR_LLM_MODEL")
    p.add_argument("--sampling", help="auto, qwen3, gemma, ministral or gpt-oss (default RR_LLM_SAMPLING)")
    p.add_argument("--out", help="Default eval/results/<label>.json")
    p.set_defaults(func=run)
    r = sub.add_parser("report", help="Markdown table from two or more run files")
    r.add_argument("results", nargs="+")
    r.add_argument("--out", help="Default eval/results/comparison.md")
    r.set_defaults(func=report)
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
