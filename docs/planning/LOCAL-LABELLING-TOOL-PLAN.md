# Local Python round labelling tool plan

**Implementation update, 27 October 2026:** the core browser workflow is implemented, with a Python launcher, a Docker image, raw-demo import, explicit player selection, independent review, candidate verdicts, transactional revision history, save/resume and v2 JSONL exports. See the [runnable tool instructions](../LABEL-TOOL.md). SQLite transactions replace the proposed JSON revision pointer; the lightweight `app.annotation.server` entry point reuses the application's parser/detectors without starting unrelated Studio services. The labeler now also includes an embedded radar, shared radar/video clock, padded context windows, persistent validated MP4 uploads, footage evidence references and an optional host CS:DM recording queue. Cross-snapshot scoring, adjudication and training-conversation generation remain follow-up research work. The original implementation scaffold follows.

Build a small annotation mode around the existing Python parser, evidence contracts and label services. Pawel should be able to select downloaded demos, choose one player, review rounds, save work and resume on this Windows PC. The companion [labelling guide](ROUND-LABELLING-GUIDE.md) defines the human task.

This scaffold expands RR02/RR05/RR12/RR13/RR24 in the [delivery plan](FINAL-DELIVERY-PLAN.md). Work belongs in `C:/Users/pawel/Documents/cs2-demos-studio`; the Phase 1 handoff is a historical source copy. Delivery maps are Ancient and Anubis.

## Existing pieces and gaps

| Existing component | Reuse | Gap to address |
|---|---|---|
| `eval/label_tool.py` | Processed-match loading, terminal findings, missed events, initial scores | Appends duplicate round reviews; recomputes findings from current configuration; no coaching rubric or resume workflow |
| `apps/api/app/services/labels.py` | Per-labeller storage and moment picks | Round saves rewrite the file directly; no revision history or richer annotation contract |
| `apps/api/app/models/contracts.py` | `RoundLabel`, `LabelVerdict`, `MissedEvent`, `MomentPicks` | No independent-pass status, evidence provenance or separate decision assessment |
| `apps/web/src/components/lab/LabelsTab.tsx` | Existing Lab form and player/match navigation | Match list requires `moments > 0`, excluding useful zero-detection matches; fixed detector list includes disabled rules |
| `apps/api/app/processing/` | Decompression, roster inspection, parsing and normalisation | Reuse safeguards by domain; canonical native parsing still needs bounded subprocess integration |
| `apps/api/app/analysis/policy.py` | Versioned `local-v1` candidate set | Persist exact configuration and input snapshot with each review |
| `tools/local_app.py` | Existing Python launcher | Starts both API and Next.js; this is not currently a Python-only annotation launcher |

The current `data/labels/README.md` describes the legacy detector format. The canonical `data/manifest.csv` is absent in the inspected checkout. Create and freeze the research manifest rather than treating an old plan's reference as an existing dataset.

## Target experience

1. Launch one Python command and open a local browser page.
2. Choose a demo or folder of demos. Show source, file type and import status; do not move or overwrite originals.
3. Inspect the roster, then require selection of one player before full parsing. Default annotation focus to Overall and record the chosen focus.
4. Show a round queue with unreviewed, draft, complete and blocked states. Allow rounds with no detector findings.
5. Review the full round in CS2 or existing Studio playback. The annotation page supplies event navigation, timestamps and optional validated MP4 playback. Save independent observations before revealing suggestions.
6. Complete the rubric, inspect detector candidates and record missed events. Autosave drafts, explicitly complete the round and resume where you left off.
7. Export labels by manifest split and review status; show progress as unique rounds and annotator reviews separately.

The first Python-only interface is a small static form served by the existing FastAPI application in an explicit local annotation mode. It reuses application services rather than creating another parser or a second product. FastAPI supports serving static files, so the form need not require a Node build. Use basic HTML and JavaScript for the form; do not promise a browser UI written entirely in Python. [FastAPI static files documentation](https://fastapi.tiangolo.com/tutorial/static-files/).

Keep the established Studio radar renderer. Initially link to it when Studio is running, or use CS2 for full-round playback. A Python-only form does not render a `.dem` into POV video. Embedded gameplay requires a pre-rendered MP4 or the existing Windows recorder; radar does not replace visual evidence for visibility-dependent judgements. No LLM or GPU is required for importing, forms or saving labels.

## Suggested code boundaries

These are proposed files, not files created by this planning task:

```text
eval/label_tool.py                          existing CLI; add import/serve/validate/export
eval/annotation/manifest.py                 source identity, deduplication, split assignments
eval/annotation/importer.py                 adapters to existing parser and cached artifacts
eval/annotation/export.py                   v2 exports and explicit legacy projection
apps/api/app/models/annotation.py           versioned annotation contracts
apps/api/app/services/annotations.py        shared validation, revisions and completion rules
apps/api/app/api/annotations.py             guarded annotation routes
apps/api/app/annotation_static/index.html   small local form
apps/api/app/annotation_static/app.js       draft saving, two-pass workflow, clip navigation
apps/api/tests/analysis/test_annotations.py focused persistence and evaluation checks
.local/annotation/                         ignored cache, local manifest, drafts and revisions
data/labels/                               intentional reviewed exports only
```

Both CLI and browser form must call the same service. Update Pydantic contracts first and mirror any exposed additions in Studio TypeScript. Use a separate v2 record type: routing richer records through today's `RoundLabel` risks dropping unsupported fields. Do not change the legacy wire format silently.

## Import and cache contract

Accept `.dem` and `.dem.zst` using existing adapters. For ZIP/RAR or other compression, explain that the user must extract a `.dem` first in the MVP. Do not assume every FACEIT download uses one format. Validate actual file content and show failures per file so one broken demo does not stop the queue.

Keep source URL/provider match ID when supplied, original path, compressed hash if applicable, decompressed hash, canonical match identity, map, parser/version information and permission/use notes. Keep local paths and player mapping private; export pseudonymous references for training. Different source providers do not require different coaching rubrics, but they do need retained provenance.

Use decompressed hash plus parser version and extraction settings as the cache key. Store raw round/event identities and normalised round numbering. Do not use a random upload ID as the only research identity. Freeze the manifest's match-to-split mapping before derived examples are made; missing or conflicting assignments block research export.

Queue one parsing job at a time initially, outside the UI process, with explicit cancellation and bounded resources. Integrate the existing Phase 1 subprocess/decompression safeguards with the canonical parser's roster-first flow. The adapter should call the established normaliser to produce `analysis.json` and round replay artifacts, not reconstruct a competing time model. The upstream parser already exposes Python event and tick queries. [demoparser Python interface](https://github.com/LaihoE/demoparser/blob/main/README.md).

Cache parsed data independently of detector output. A new detector run creates a new candidate snapshot containing configuration, profile, focus, code revision or content digest, event evidence and stable snapshot identity. It must not overwrite the candidate set that a previous annotation judged.

## Proposed annotation contract

The durable review key is canonical match + selected player + round + annotator + rubric version. Revisions are immutable; one revision is explicitly current. Keep schema version separate from rubric version.

| Record section | Required information |
|---|---|
| Identity | Schema/rubric versions, review/revision IDs, match/demo identity, player, map, round, labeller, timestamps, language |
| Provenance | Manifest revision and split, parser artifact digest, detector snapshot/profile/focus, evidence availability |
| Coverage | Full-round reviewed flag, reviewed tick range, completed categories, blocked/excluded reason |
| Independent pass | Draft/completed status, completion time, original human moments, whether suggestions had already been seen |
| Human moments | Stable annotation UUID, start/anchor/end ticks, derived elapsed times, category, facts, information context, assessment, reason, alternative, confidence and priority |
| Candidate reviews | Snapshot candidate ID, explicit signal claim, correct/wrong/unsure, reason, linked human moment IDs |
| Missed events | Human event identity, enabled detector and subtype where applicable, timestamp, evidence; separate out-of-profile observations |
| Review lifecycle | Draft/complete/blocked/excluded, independent reviewers, adjudicated revision reference |

Candidate IDs such as `F14` are valid only within their saved snapshot. They are not durable identities across re-analysis. Group related candidates under one human moment, while retaining each detector's verdict.

Illustrative human moment, not a complete export or an observation of a real demo:

```json
{
  "annotationId": "illustrative-moment",
  "category": ["teamwork"],
  "assessment": "uncertain",
  "facts": "The player's death was not traded in the configured window.",
  "knownInformation": [],
  "unknownInformation": ["Teammate line of sight", "Voice communications"],
  "reason": "Timing and proximity do not establish a feasible trade.",
  "alternative": null,
  "confidence": "low",
  "learningPriority": 1,
  "candidateReviews": [
    {"detector": "untraded_death", "signalVerdict": "correct"}
  ]
}
```

Validation requires a real player/round, finite timestamps, ordered windows within the replay bounds, resolvable evidence, approved vocabulary, and a known manifest assignment for export. A confident mistake requires a reason and feasible alternative. An uncertain judgement requires a missing-evidence reason. Failed parsing cannot be marked a completed negative example. Empty moments are valid when coverage is complete.

## Saving and evaluation

Use immutable JSON revision files and an atomic current-revision pointer for the initial single-writer local tool. Write to a temporary file in the same directory, flush it and replace the target atomically. Verify revision files on resume and retain the last valid revision after an interrupted save. Require the previous revision ID when saving; reject stale browser-tab edits instead of silently overwriting them. Route CLI writes through the same service and refuse a second writer for that store. Export JSONL from validated completed revisions, never by appending every autosave to the evaluation file.

Fix the following before publishing evaluation results:

- **Duplicate counting:** the old CLI appends repeated rounds and the Lab summary pools annotators. Score either one adjudicated revision per round or each rater separately; do not treat overlap reviews as independent rounds.
- **Event matching:** `_event_key` currently rounds timestamps into buckets; that is not true matching within one second. Use exact IDs for a shared snapshot and one-to-one matching within a frozen tolerance for independent event lists. Include match, player, round, detector/subtype and event anchor; prevent many predictions matching one human event. Record sensitivity to the chosen tolerance.
- **Recall coverage:** require complete full-round review for the evaluated categories. A missing manual event list is not proof of no false negatives. Report partial reviews separately.
- **Uncertainty:** exclude unsure verdicts from decided precision/recall denominators, but always report their count/rate and coverage. No observations means unavailable, not perfect performance.
- **Agreement:** compute on independent pre-adjudication labels, report shared item counts and raw agreement alongside kappa. An undefined kappa for a degenerate one-class sample should remain undefined. Assess independently discovered events separately from verdict agreement on common candidates.
- **Signal versus advice:** report signal correctness and coaching assessment separately. Match-level selection also needs full-match independent picks; a sample of labelled rounds cannot stand in for reviewing all candidate rounds in a match.

The legacy projection may emit `findings` and `missed` for compatibility only after stating its verdict semantics and dropping no completed reviews accidentally. Training export additionally requires `split=train`, accepted review status and permitted use. Conversation/tool-trace preparation remains RR24; do not turn every annotation automatically into a model answer.

## Implementation order and completion checks

| Step | Deliverable | Completion evidence |
|---|---|---|
| 1 Data contract and pilot | Rubric v2, local manifest, immutable candidate snapshot, completed-review rules | Six real training rounds across both maps can be represented, including uncertain and zero-moment reviews |
| 2 Python import and resume | CLI folder import, explicit roster selection, cached parsing, draft/revision persistence | Import one real demo per map; restart and resume without losing labels or parsing again; duplicate compressed/plain copies stay in one match |
| 3 Local form | Python-launched loopback annotation route with two-pass form and existing playback links | Complete a full round, reveal candidates, edit a draft and reopen it; zero-finding matches remain selectable; no model required |
| 4 Playback convenience | Validated MP4 playback and mapping, optional recorder adapter | A verified clip shows the chosen player and correct anchor; unavailable clips produce a truthful fallback |
| 5 Evaluation and export | Schema validation, split gates, adjudication and corrected matching/counting | Test exports cannot enter training; overlapping raters and repeated saves do not inflate counts; misses and unsure cases have correct denominators |

Automated checks should target interrupted saves, stale revisions, split leakage, duplicate import identity, tick boundaries and one-to-one event matching. Manual acceptance should include halftime/overtime/knife-round mapping where present, one corrupt input, missing optional telemetry and a full round with no detector candidates. Record measured import/review time and peak resource use in the pilot; estimate the remaining annotation effort from those measurements.

Bind local annotation mode to `127.0.0.1`, validate request origins for mutations, restrict file access to explicitly imported artifacts and preserve the existing account guards in shared mode. Do not expose arbitrary local paths via a general file-serving endpoint. Remote annotation can later use the existing authenticated API rather than the local bypass.

## What can run today

The existing CLI labels **already processed matches** and needs playback in Studio or CS2. From PowerShell:

```powershell
Set-Location C:\Users\pawel\Documents\cs2-demos-studio
$env:RR_ANALYSIS_PROFILE = 'local-v1'
.\apps\api\.venv\Scripts\python.exe -m eval.label_tool --help
```

After identifying a real processed match directory containing `analysis.json` and `rounds/`, substitute its path and the selected player's SteamID:

```powershell
.\apps\api\.venv\Scripts\python.exe -m eval.label_tool label --match-dir 'PATH_TO_PROCESSED_MATCH' --player 'STEAMID64' --rounds '3,7,12' --labeller pawel --out '.local/annotation/pilot-legacy.jsonl'
```

That command displays candidates immediately, recomputes them and appends legacy rows. Use a fresh output file for each deliberate pilot run and do not treat it as the planned v2 workflow. Start the existing local Studio through `start-local.ps1` if parsing or radar is needed; this launcher still uses installed Node dependencies.

The intended future commands are `python -m eval.label_tool import`, `serve`, `validate` and `export`. They are implementation targets, not available subcommands. The next concrete build slice is steps 1–2, followed by the small local form.
