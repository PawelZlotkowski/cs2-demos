"""Verify file organisation and provenance, not application readiness."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote

from consolidate_sources import ROOT, sha256

AUDIT_DIR = ROOT / "docs/consolidation"
DOCUMENT_EDITS = {"README.md", "AGENTS.md", "docs/README.md", "docs/handoff/00-README.md"}
IMPORT_NOTICES = {
    "docs/planning/FINAL-DELIVERY-PLAN.md": "Workspace consolidation and design-pause notice.",
    "docs/planning/STUDIO-UI-AND-MOTION-PLAN.md": "Explicit user-requested design-pause notice.",
}


def main() -> None:
    audit = json.loads((AUDIT_DIR / "source-inventory.json").read_text(encoding="utf-8"))
    manifest = json.loads((AUDIT_DIR / "import-manifest.json").read_text(encoding="utf-8"))
    errors = []
    baseline_verified = 0
    for name, expected in audit["sources"]["studio"]["files"].items():
        path = ROOT / name
        if name in DOCUMENT_EDITS:
            continue
        if not path.is_file() or sha256(path) != expected["sha256"]:
            errors.append(f"Unexpected baseline change: {name}")
        else:
            baseline_verified += 1

    source_verified = 0
    for name, source in audit["sources"].items():
        if name == "studio":
            continue
        source_root = Path(source["root"])
        for relative, expected in source["files"].items():
            path = source_root / relative
            if not path.is_file() or sha256(path) != expected["sha256"]:
                errors.append(f"Original changed: {name}/{relative}")
            else:
                source_verified += 1

    imported = []
    for item in manifest["imports"]:
        source, destination = Path(item["source"]), ROOT / item["destination"]
        if not source.is_file() or sha256(source) != item["source_sha256"]:
            errors.append(f"Import source changed: {item['source']}")
        if not destination.is_file():
            errors.append(f"Missing import: {item['destination']}")
            continue
        digest = sha256(destination)
        if digest != item["imported_sha256"] and item["destination"] not in IMPORT_NOTICES:
            errors.append(f"Unexpected import change: {item['destination']}")
        imported.append({
            "path": item["destination"], "sha256": digest,
            "post_copy_edit": IMPORT_NOTICES.get(item["destination"]),
        })

    for item in manifest["patches"]:
        if sha256(ROOT / item["path"]) != item["sha256"]:
            errors.append(f"Patch changed: {item['path']}")
    patch_check = subprocess.run(
        ["git", "-c", f"safe.directory={ROOT.as_posix()}", "apply", "--check",
         *[item["path"] for item in manifest["patches"]]],
        cwd=ROOT, capture_output=True, text=True,
    )
    if patch_check.returncode:
        errors.append("Patch applicability: " + patch_check.stderr.strip())

    link_files = [
        ROOT / name for name in DOCUMENT_EDITS
    ] + list((ROOT / "docs/planning").glob("*.md")) + [
        ROOT / "docs/consolidation/README.md",
        ROOT / "docs/university/README.md",
        ROOT / "docs/reference/phase1/README.md",
        ROOT / "integration/phase1/README.md",
        ROOT / "prototype/README.md",
    ]
    checked_links = 0
    historical_links = []
    for document in link_files:
        text = document.read_text(encoding="utf-8-sig")
        text = re.sub(r"```.*?```", "", text, flags=re.S)
        for target in re.findall(r"\]\(([^)\n]+)\)", text):
            target = unquote(target.strip("<>").split("#", 1)[0])
            if not target or "://" in target or target.startswith(("mailto:", "C:", "c:")):
                continue
            # The verification report is written at the end of this command.
            if document.parent == AUDIT_DIR and target == "verification.json":
                continue
            resolved = (document.parent / target).resolve()
            if resolved.exists():
                checked_links += 1
            elif document.relative_to(ROOT).as_posix() in DOCUMENT_EDITS:
                # Existing baseline docs can contain historical broken links.
                historical_links.append({"document": document.relative_to(ROOT).as_posix(), "target": target})
            else:
                errors.append(f"Broken documentation link: {document.relative_to(ROOT)} -> {target}")

    standalone = ROOT / "prototype/tactical-lens-studio.html"
    if not standalone.is_file():
        errors.append("Missing standalone Tactical Lens preview")
    result = {
        "date": "2026-10-20", "scope": "Organisation and source provenance only",
        "passed": not errors, "baseline_files_unchanged": baseline_verified,
        "intentional_existing_document_edits": sorted(DOCUMENT_EDITS),
        "original_source_files_unchanged": source_verified,
        "imports_verified": imported,
        "patches_checked_without_applying": len(manifest["patches"]),
        "selected_phase1_file_variants": sum(len(p["files"]) for p in manifest["patches"]),
        "documentation_links_verified": checked_links,
        "existing_historical_link_gaps": historical_links,
        "derived_preview": {
            "path": "prototype/tactical-lens-studio.html",
            "sha256": sha256(standalone) if standalone.is_file() else None,
            "source": "prototype/source/tactical-lens-studio.fragment.html",
            "method": "Bundled visualize render.py export; no design edits.",
        },
        "application_tests_run": False,
        "application_code_merged": False,
        "errors": errors,
    }
    (AUDIT_DIR / "verification.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in {"imports_verified", "derived_preview"}}, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
