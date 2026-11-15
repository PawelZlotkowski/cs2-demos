# CS2 Demo Reviewer — Phase 1 source handoff

This ZIP contains the current source, tests, Python and npm lockfiles, fixtures,
Docker configuration, and review/ research, skills and implementation plans.
Dependencies, builds, runtime databases/demos/clips, model weights, Git history
and private environment files are excluded. The original folder is unchanged.

Read review/PHASE1-RESULTS.md first, then
review/AGENTIC-IMPLEMENTATION-PLAN.md and review/THREEJS-RESEARCH.md.
Phase 1 preserves numerical analysis -> model moment selection -> external
Windows CS Demo Manager/HLAE recording. No context/memory service was added.

## Windows local setup

Install Python 3.12 (or a supported 3.11+ version) and Node.js 22.
In PowerShell from this extracted folder:

```powershell
py -3.12 -m venv .venv
.venv/Scripts/python.exe -m pip install --require-hashes -r apps/api/requirements-dev.lock
.venv/Scripts/python.exe -m pip install --no-deps -e apps/api
Set-Location apps/api
../../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal from the extracted folder:

```powershell
Set-Location apps/web
npm ci
npm run dev
```

Open http://localhost:3000. Personal mode is loopback-only. The model and
recording are off until you configure your local services. On the Windows API
host, enable RR_LLM_ENABLED=true for numerical model selection, and configure
RR_CSDM_ENABLED=true / RR_CSDM_MODE=csdm plus installed CS:DM, Steam/CS2, HLAE
and FFmpeg/ffprobe for real clips. Free-form coaching is an explicit opt-in;
model selection does not require it. Environment examples are provided.

## Validation

From apps/api: ../../.venv/Scripts/python.exe -m pytest -q
From apps/mcp: ../../.venv/Scripts/python.exe -m pytest -q tests/test_access.py
From apps/web: npm run typecheck; npm run lint; node scripts/run-replay-checks.cjs

Last integration check: 271 API tests passed, 4 skipped; 18 MCP access tests
passed. The final selection/job recheck passed 19 tests. Web checks/build passed.
Real-demo, live model and Windows recording smoke tests are still required.
Public release needs further worker isolation, accounts and durable jobs.

Docker is optional; see docker/README.md. Current compose interpolation requires
RR_CSDM_DB_PASSWORD in the shell even when the optional database profile is off.
The ordinary API container disables the Windows recorder.

PACKAGE-MANIFEST.json lists included source files with SHA-256 hashes.
