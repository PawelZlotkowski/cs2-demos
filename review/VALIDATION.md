# Round Reviewer audit validation

Validation date: 13 October 2026. Production application files were not changed. The new files are reports, proposed skills/prompts, and a synthetic audit probe. Existing user deletions were preserved.

## Existing test suite

- Initial directly runnable subset: **18 passed**.
- Broad API suite: **229 passed, 4 skipped, 1 failed** in 149.80 seconds.
- The failed case was `tests/coach/test_mcp_server.py::test_stdio_server_subprocess`. Its child process could not import `mcp` because the test supplies its own `PYTHONPATH`, replacing the temporary dependency path used by the audit environment.
- Retried that single case using a temporary virtual environment with dependencies visible to child processes: **1 passed** in 5.66 seconds.

Thus all **230 runnable cases passed across the suite run and the targeted environment retry**. This was not a second complete suite run. The four skipped cases comprise three real-demo tests without their demo files and one live llama-server test without a configured live model. No test was edited to obtain these results.

The system Anaconda interpreter lacked demoparser2/MCP. Dependencies were installed into an isolated temporary project folder, with compatible Windows DLL paths and test namespace handling. Selected resolved versions included demoparser2 0.42.0, MCP 2.3.0, FastAPI 0.143.0, pandas 3.0.6 and Pydantic 2.14.1. These versions are an audit environment, not a new project dependency lock. Temporary dependencies and generated runtime state are removed before delivery.

## Synthetic behavioral probes

`python review/reproduce_findings.py` requires the normal API dependencies and uses a temporary data directory. It does not start a model, Steam, CS2 or CS Demo Manager.

| Probe | Observed result |
|---|---|
| Separate anonymous clients upload and read one match | Both receive HTTP 200 |
| Reload repository before uploaded demo has been parsed | Uploaded match is absent from the reloaded API records |
| Parser sleeps 200 ms with a 20 ms deadline | Processing returns after approximately 238 ms |
| Recorder reports success without creating a new MP4 | Previous `r1.mp4` is moved into `r2.mp4` |
| Untraded-death finding cited for winning through smoke | Verifier accepts the unsupported sentence with no errors |
| Same team wins on CT then T across a side switch | Normalized match score is 1–1 instead of 2–0 |

These are defect reproductions, so their boolean outputs are expected to be true in the current code. When fixes land, the affected probes should be converted to regression tests asserting the desired behavior, with obsolete audit expectations removed.

## Checks not represented by those results

Frontend assessment was static. No production frontend build or browser QA was run, and no npm/pip vulnerability scanner was run. Next.js versions were read from both committed lockfiles and compared with the official September security release. No actual demo recording, local GPU throughput, model-quality benchmark, asset extraction or Three.js rendering was performed.

The skill files receive frontmatter/naming/scaffold validation and a manual scope check. That validates packaging, not future implementation quality or model performance.
