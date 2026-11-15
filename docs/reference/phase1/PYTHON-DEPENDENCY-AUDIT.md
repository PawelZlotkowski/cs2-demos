# Python dependency audit

Checked 2026-10-13 with `pip-audit 2.10.1` in a disposable `uvx` environment:

```text
uvx pip-audit -r apps/api/requirements.lock --strict
No known vulnerabilities found
```

The audit used the universal, hash-pinned production lock and the current public PyPI advisory data. It did not modify project dependencies or either lockfile.

The installed root `.venv` is Python 3.12.4 on Windows and contains the editable API plus development tools. `pip check` reports no broken requirements. A marker-aware comparison against `requirements.lock` found all 53 applicable production pins installed at their locked versions; `requirements-dev.lock` likewise matched all 58 applicable pins. Both locks skip the `httpx2-jsfetch` Emscripten-only package and `uvloop`, which is excluded on Windows. The local environment has expected extras for the editable API and tooling (`round-reviewer-api`, `pip`, and `uv`); it is not a clean production install, so this confirms version consistency for the locked dependencies rather than production image equivalence.
