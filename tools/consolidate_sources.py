"""Inventory the four local source trees without copying secrets or runtime data.

This command writes a provenance report only. It never merges application code.
Run from the repository root with Python 3.11+.
"""
from __future__ import annotations

import hashlib
import difflib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "studio": ROOT,
    "accounts": ROOT.parent / "cs2-demos-accounts",
    "original": ROOT.parent / "cs2-demos",
    "phase1": ROOT.parent / "cs2-demos-phase1-source" / "cs2-demos",
}
SKIP_DIRS = {
    ".git", "node_modules", ".venv", "venv", "__pycache__", ".next",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", "qa-out", "test-results",
    "playwright-report", ".playwright", "dist", "out", "integration",
}
SKIP_SUFFIXES = {
    ".pyc", ".log", ".dem", ".zst", ".mp4", ".mkv", ".gguf", ".safetensors",
    ".db", ".sqlite", ".sqlite3", ".pem", ".key", ".tsbuildinfo",
}


def allowed(relative: Path) -> bool:
    if any(p in SKIP_DIRS or p.endswith(".egg-info") for p in relative.parts):
        return False
    if relative.as_posix().startswith("docs/consolidation/"):
        return False
    if relative.name.startswith(".env") and not relative.name.endswith(".example"):
        return False
    if relative.name.lower() in {"credentials.json", ".ds_store", "thumbs.db"}:
        return False
    return relative.suffix.lower() not in SKIP_SUFFIXES


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inventory(root: Path) -> dict:
    if (root / ".git").exists():
        git = ["git", "-c", f"safe.directory={root.as_posix()}", "-C", str(root)]
        result = subprocess.run(
            [*git, "ls-files", "-z"],
            check=True, capture_output=True,
        )
        paths = [Path(p) for p in result.stdout.decode("utf-8").split("\0") if p]
        head = subprocess.run(
            [*git, "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        method = "tracked working-tree files (not Git blob contents)"
    else:
        paths = [p.relative_to(root) for p in root.rglob("*") if p.is_file()]
        head, method = None, "packaged source files"
    files = {}
    for rel in sorted(paths):
        path = root / rel
        if allowed(rel) and path.is_file() and not path.is_symlink():
            files[rel.as_posix()] = {"sha256": sha256(path), "bytes": path.stat().st_size}
    return {"root": str(root), "head": head, "method": method, "files": files}


def make_inventory() -> None:
    sources = {name: inventory(root) for name, root in SOURCES.items()}
    baseline = sources["studio"]["files"]
    comparisons = {}
    for name, source in sources.items():
        if name == "studio":
            continue
        files = source["files"]
        comparisons[name] = {
            "identical": sorted(p for p in files if p in baseline and files[p]["sha256"] == baseline[p]["sha256"]),
            "different": sorted(p for p in files if p in baseline and files[p]["sha256"] != baseline[p]["sha256"]),
            "source_only": sorted(p for p in files if p not in baseline),
            "studio_only": sorted(p for p in baseline if p not in files),
        }
    output = ROOT / "docs" / "consolidation" / "source-inventory.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise SystemExit("Refusing to overwrite the pre-consolidation inventory.")
    output.write_text(json.dumps({
        "date": "2026-10-20", "purpose": "Pre-consolidation source snapshot",
        "sources": sources, "comparisons_against_studio": comparisons,
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "inventory": str(output),
        "counts": {k: len(v["files"]) for k, v in sources.items()},
        "differences": {
            k: {field: len(paths) if field in {"identical", "studio_only"} else paths for field, paths in v.items()}
            for k, v in comparisons.items()
        },
    }, indent=2))


def assemble() -> None:
    """Copy selected supporting material and package conflicting code as review diffs."""
    inventory_path = ROOT / "docs/consolidation/source-inventory.json"
    audit = json.loads(inventory_path.read_text(encoding="utf-8"))
    phase = SOURCES["phase1"]
    baseline = audit["sources"]["studio"]["files"]
    phase_files = audit["sources"]["phase1"]["files"]
    manifest_path = ROOT / "docs/consolidation/import-manifest.json"
    if manifest_path.exists():
        raise SystemExit("Imports already recorded; refusing to overwrite.")
    current = {
        "FINAL-DELIVERY-PLAN.md", "HOSTING-AND-GPU-PLAN.md",
        "RECORDING-AND-TRAINING-PLAN.md", "STUDIO-UI-AND-MOTION-PLAN.md",
    }
    mapping = {}
    for name in phase_files:
        if not name.startswith("review/"):
            continue
        rel = Path(name).relative_to("review")
        folder = Path("docs/planning") if rel.name in current else Path("docs/reference/phase1")
        mapping[(phase / name).resolve()] = ROOT / folder / rel
    extra = {
        phase / "START-HERE.md": ROOT / "docs/reference/phase1/SOURCE-START-HERE.md",
        phase / "PACKAGE-MANIFEST.json": ROOT / "docs/reference/phase1/ORIGINAL-PACKAGE-MANIFEST.json",
        phase / "docker/README.md": ROOT / "docs/reference/phase1/DOCKER-SETUP.md",
        Path(r"C:\Users\pawel\Downloads\project-proposal-Pawel-Zlotkowski (1).docx"):
            ROOT / "docs/university/project-proposal-Pawel-Zlotkowski-original.docx",
        Path(r"C:\Users\pawel\.codex\visualizations\2026\10\19\01a15595-6726-7230-90a4-71c88346d21e\tactical-lens-studio.html"):
            ROOT / "prototype/source/tactical-lens-studio.fragment.html",
    }
    mapping.update({p.resolve(): dest for p, dest in extra.items()})
    imports = []
    for source, destination in mapping.items():
        if destination.exists():
            raise SystemExit(f"Destination already exists: {destination}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        raw = source.read_bytes()
        expected = phase_files.get(source.relative_to(phase).as_posix()) if source.is_relative_to(phase) else None
        if expected and sha256(source) != expected["sha256"]:
            raise SystemExit(f"Source changed since inventory: {source}")
        if source.suffix == ".md":
            content = raw.decode("utf-8")
            def relocate(match: re.Match) -> str:
                target = match.group(1)
                if "://" in target or target.startswith("#"):
                    return match.group(0)
                base, sep, anchor = target.partition("#")
                resolved = (source.parent / base).resolve()
                replacement = mapping.get(resolved)
                if replacement:
                    relative = Path(os.path.relpath(replacement, destination.parent)).as_posix()
                    return "](" + relative + (sep + anchor if sep else "") + ")"
                return match.group(0)
            content = re.sub(r"\]\(([^)\n]+)\)", relocate, content)
            raw = content.encode("utf-8")
        destination.write_bytes(raw)
        imports.append({
            "source": str(source), "source_sha256": sha256(source),
            "destination": destination.relative_to(ROOT).as_posix(),
            "imported_sha256": sha256(destination),
            "transformation": "relative Markdown links relocated" if source.suffix == ".md" else "byte-for-byte copy",
        })

    changes = audit["comparisons_against_studio"]["phase1"]
    groups: dict[str, list[str]] = {}
    decisions = []
    for path in sorted(changes["different"] + changes["source_only"]):
        if path.startswith("review/") or path in {"START-HERE.md", "PACKAGE-MANIFEST.json", "docker/README.md"}:
            continue
        group = None
        if path.startswith("apps/api/app/") or path.startswith("apps/api/tests/"):
            group = "api-reliability"
        elif path.startswith("apps/mcp/"):
            group = "mcp-access"
        elif path.startswith(("apps/web/src/lib/replay/", "apps/web/src/components/replay/")) or path == "apps/web/scripts/run-replay-checks.cjs":
            group = "replay-correctness"
        elif path.startswith(("apps/web/src/lib/contracts/", "apps/web/src/components/coach/")):
            group = "coach-and-contracts"
        elif path.startswith(("docker/", "apps/api/requirements")) or path.endswith((".env.example", "package.json", "package-lock.json", "pyproject.toml", "eslint.config.mjs", "next.config.ts")) or path in {".gitignore", "compose.yaml"}:
            group = "dependencies-and-runtime"
        reason = "Preserve for domain-level integration; not applied to the active app."
        if group:
            groups.setdefault(group, []).append(path)
        else:
            reason = "Retain Studio's current UI, routing, account flow or documentation; Phase 1 version remains in the untouched source folder."
        decisions.append({"path": path, "decision": "patch-reference" if group else "not-imported", "group": group, "reason": reason})

    patches = []
    for group, paths in groups.items():
        chunks = []
        entries = []
        for path in paths:
            source = phase / path
            if sha256(source) != phase_files[path]["sha256"]:
                raise SystemExit(f"Source changed since inventory: {source}")
            old_path = ROOT / path
            if path in baseline and sha256(old_path) != baseline[path]["sha256"]:
                raise SystemExit(f"Baseline changed before patch generation: {old_path}")
            old = old_path.read_text(encoding="utf-8") if path in baseline else ""
            new = source.read_text(encoding="utf-8")
            diff = list(difflib.unified_diff(
                old.splitlines(keepends=True), new.splitlines(keepends=True),
                fromfile="a/" + path if path in baseline else "/dev/null",
                tofile="b/" + path, n=3,
            ))
            for line in diff:
                chunks.append(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n")
            entries.append({
                "path": path, "phase1_sha256": phase_files[path]["sha256"],
                "studio_sha256": baseline.get(path, {}).get("sha256"),
            })
        destination = ROOT / "integration/phase1" / f"{group}.patch"
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            raise SystemExit(f"Patch already exists: {destination}")
        destination.write_text("".join(chunks), encoding="utf-8", newline="\n")
        patches.append({"path": destination.relative_to(ROOT).as_posix(), "sha256": sha256(destination), "files": entries})
    manifest_path.write_text(json.dumps({
        "date": "2026-10-20", "canonical_root": str(ROOT), "imports": imports,
        "patches": patches, "phase1_decisions": decisions,
        "application_code_merged": False, "original_folders_deleted": False,
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "copied_files": len(imports),
        "patches": {p["path"]: len(p["files"]) for p in patches},
        "not_imported_phase1_variants": [d["path"] for d in decisions if d["decision"] == "not-imported"],
    }, indent=2))


if __name__ == "__main__":
    if sys.argv[1:] == ["--assemble"]:
        assemble()
    elif not sys.argv[1:]:
        make_inventory()
    else:
        raise SystemExit("Usage: python tools/consolidate_sources.py [--assemble]")
