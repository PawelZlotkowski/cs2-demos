# Application and labelling audit — 20 November 2026

Owner-requested extension of the [detection research](DETECTION-QUALITY-RESEARCH-2026-11-20.md) and [saved-review clip audit](DETECTION-QUALITY-CLIP-AUDIT-2026-11-20.md), for the **25 November teacher presentation**. Work belongs to the existing RR delivery tasks, especially RR11–RR13/RR16; this is evidence, not a second backlog or a claim that those tasks are complete.

## Scope and interpretation

Only `C:\Users\pawel\Documents\cs_replays` was used as the additional source corpus. The owner's private grenade-practice recordings in `Videos` were excluded. Existing Studio/labeller footage derived from the permitted match demos was inspected locally. No hosted model, public upload, commit or push was used.

The application is materially safer for new uploads and continued labelling. Technical checks cannot certify every future coaching judgement. A nearby death, moving rifle burst, held grenade or team flash still needs gameplay context. Uncertainty must remain visible, and detector candidates must not become human ground truth automatically.

## Faults found and corrected

| Failure | Correction and effect |
|---|---|
| Old Ask answers cited IDs which had been reassigned by reanalysis | Saved and in-flight answers are bound to a content hash of findings, statistics, selected moments and knowledge sources. Changed evidence hides the old answer from the current panel; history/export retains it. An answer finishing during a changed analysis is rejected before display |
| Real Qwen treated a multikill as evidence of effective movement, despite a valid citation | Added v5 Ask/explanation and v2 cross-match prompts, a narrow technique-inference guard and Polish kill-terminology checks. Answer-policy versions also invalidate old Ask history. This is a targeted safeguard, not a complete semantic proof checker |
| A fresh API outside the launcher defaulted to research detectors | `local-v1` is now the configuration default. Research tests explicitly select `all`; experimental judgements cannot silently return on a normal new installation |
| Long chains of nearby candidates produced overlapping clips when split at 60 seconds | Labelling groups union connected padded windows within the round. They split at actual gaps, retaining each finding once. A genuinely long continuous play can exceed 60 seconds |
| Same footage appeared several times after recalculation | Current round footage excludes older analysis snapshots by default. `history=true` and direct historical IDs retain access. Equivalent batches reuse their existing recordings |
| Rule/code changes could leave prepared players marked ready with stale results | Separate extraction and judgement fingerprints; stale selection queues reanalysis. A legacy extraction cache is upgraded only after raw parsing exactly reproduces its reviewed telemetry. Different clocks fail safely instead of silently overwriting labels |
| Equivalent findings in a different order unnecessarily invalidated notes | Snapshot equivalence compares complete finding content as a multiset, not list order/IDs. Existing snapshots and notes survive a genuinely equivalent rerun; changed results archive the old snapshot and pause old queues |
| A stale browser draft could be saved against a different analysis | Round saves carry the loaded snapshot ID and check it inside the write transaction. Old clip batches reject new labels after a changed snapshot |
| Whole-round Studio recordings could default to the first roster player or reuse another player's file | Require the selected/configured roster player; compare player and exact tick bounds before reuse. No selected player means skipped capture with an explanation |
| Valid MP4 headers hid timing/frame problems | Positive finite frame rate, tighter duration tolerance, final-event coverage and full frame decoding before accepting an upload. Exact-window remux now has an explicit end time |
| 57 previously reused local videos lacked their size/hash metadata | Measured actual files, checked durations, backed up the database and completed only missing metadata. No human labels or media contents were rewritten |
| Native CS capture was killed by a HLAE-specific startup watchdog | Native capture writes frames in the game directory before moving output. It now uses the bounded overall capture timeout. After two HLAE startup failures, the worker makes one native attempt with the same demo/player/ticks and media validation |

The equivalent-snapshot migration initially encountered an ordering-only difference between `opening_duel` and `good_plays` at the same time. A guarded comparison proved identical telemetry, rounds, policy and finding multiset before restoring the original snapshot identity. Both snapshot records remain archived. This was corrected before proceeding with the remaining profiles.

## Real data checks

The source manifest has **148 files / 146 match groups**: 102 training files (100 groups), 26 validation files and 20 test files. Metadata checks found no missing files, duplicate compressed hashes or match-group split leakage. Validation/test contents were not opened or used to tune rules.

All 102 training files were streamed through decompression/hash verification, roster/map inspection and round-event parsing. **100 passed**. `anb-026-p1` and `anc-030-p1` have no selectable players; their corresponding second fragments pass. Keep the first fragments excluded from standalone player review. The older already-excluded malformed Anubis demo remains separate; this audit did not establish a repair for it.

Four fresh full analyses covered FACEIT and professional Ancient/Anubis recordings: `anb-005`, `anb-030`, `anc-003`, `anc-021`. They produced **93 rounds, 86 findings and 64 grouped windows**, with zero invariant errors or repeated/overlapping grouped evidence. Only one contained the owner's selected player; the other technical checks used an explicitly recorded roster choice. They are private QA artefacts, not personal reviews or new training labels.

All five existing labeller profiles were verified against current code, retaining their snapshot identities. The original **7 round-review revisions and 10 clip-label revisions are byte-for-byte unchanged**. A consistent post-audit SQLite backup passed integrity checking. The five saved Studio reviews remain recalculated under `local-v1.1` with their original player, focus and language.

**All 85 current grouped clips are ready**: 30 Ancient across two player profiles, and 55 Anubis across three. Every file passed full frame decoding, hash/size, codec and timing checks; all five batches have zero overlapping windows or repeated evidence IDs. The portable export contains **1,006,084,694 media bytes**, 85 manifest entries and no export problems. The extra 14 Anubis clips completed through native CS capture in 293.4 seconds with zero failed uploads. Human POV-confirmation flags were not forged: the audit still reports those as unconfirmed pending human review.

Visual inspection extends the earlier 18-file audit: timestamped before/after frames from all **28 additional clips** (14 Ancient and 14 Anubis) were checked for selected-player HUD, round/event correspondence and death/engagement context. Ancient round 12 shows the selected player's subsequent death. Anubis round 5 shows a nearby teammate death while the selected player fires through fire/obscured vision and loses health; neither supports “no attempt to trade”. Pistols and P90 fights do not acquire automatic movement criticism. Team-flash and unused-utility frames do not establish tactical blame. These are assistant frame observations, not independent human adjudication or continuous viewing of every file.

## Recording compatibility evidence

Installed HLAE 2.192.5 produced an `AfxHookSource2/ViewModel.cpp:75` dialog and repeated startup failures on the additional Anubis batch. The installed CS2 files reported patch 1.42.0.0 dated 19 November. The official [HLAE FAQ](https://github.com/advancedfx/advancedfx/wiki/FAQ) identifies this family of errors as a possible game/hook version mismatch; [2.193.0 release notes](https://github.com/advancedfx/advancedfx/releases/tag/v2.193.0) also document recording-path changes. This supports a compatibility investigation, not a proven single root cause. The installed HLAE binaries and security settings were left unchanged.

Native CS capture visibly played the correct Anubis demo and executed `startmovie` sequences. Its initially interrupted attempt exposed the separate watchdog fault described above. After correction, all 14 windows recorded successfully. The combined automatic fallback is covered by regression tests; the real native path was exercised separately. The original recorder supervisor was restored with the new source. Use prepared recordings for the presentation; launching a game/hook chain live adds a dependency that parser tests cannot cover.

## Validation and practical limits

| Area | Evidence / limit |
|---|---|
| API, parser, detector, annotation, coach and recorder regressions | **464 passed, 3 skipped, 3 subtests passed** in 174.68 s. Final recorder suite: **19 tests / 3 subtests**. After the live-model guard changes: 95 affected tests passed; one stale v4-version assertion was updated to v5 and its rerun passed. Tests use synthetic/temporary data and mock inference |
| Web | TypeScript check and production build passed. Replay, batch, navigation and voice JavaScript checks passed |
| Shared labeller database/API | 28 integration tests passed on an isolated PostgreSQL 17 instance: roles/scopes, CSRF, concurrent saves, revocation and upload integrity/resume. Object storage was mocked; this is not a deployed cloud/R2 test. Temporary database container removed |
| Browser Studio | Five reviews loaded; radar, finding seek and recorded POV loaded. Ask returned current F1/F2 evidence, labelled its template source and retained the answer after refresh. Old movement criticism disappeared |
| Local labeller | Ready clip played, frame/clock metadata loaded and next-clip navigation worked. No fabricated review or correctness label was saved. Original labeller name restored |
| Recovery | Recreated the local container without losing its volume; five current snapshots retained. All pre-audit human revision rows preserved; consistent SQLite copies checked |
| Source validity | No selectable player means rejected review. Optional/missing telemetry must not imply “did not act”. Actual damaged demos still need exclusion or a separate parser fix |
| Tactical correctness | No new human precision/recall score. No general visibility/navmesh or communications model. Five metres is eligibility, not proof that a kill was possible; conservative combat gating can miss meaningful misses/spam |
| RAG/model | Existing 158-passage corpus/retrieval checks and verifier regressions exercised. Two real local Qwen questions rerun after safeguards: EN **9.66 s**, PL **11.07 s**, both returned agent text with valid F citations. See qualifications below. Full immutable citation snapshots for every historical explanation and shared-GPU scheduling remain wider tasks |
| Presentation Mac/cloud | Native Mac setup, projector, Tailscale model path and real cloud object storage still require the rehearsal in the existing presentation plan |

## Live model qualification

The installed Qwen3-14B-Q4_K_M ran locally through llama.cpp on loopback, with an 8,192-token context and 20 GPU layers because other GPU processes were already running. No other GPU workload was stopped. The two contextual questions used the MCP-enabled coach loop and verifier, but the model answered from supplied findings without tool calls: this is **not** an end-to-end RAG retrieval evaluation or a target-hardware latency benchmark.

The initial outputs exposed an unsupported positive inference about movement and a Polish mistranslation of kills. Both raw outputs and the rerun are retained in the private audit folder. The corrected English answer explicitly refuses to infer technique quality from kills. The Polish rerun uses zabójstwa and distinguishes outcome from unknown technique, but still contains awkward grammar. Free-form Polish coaching therefore needs language review before a polished live presentation. A valid citation and the current verifier do not establish all prose is semantically entailed. Use the deterministic explanations as the presentation fallback. The temporary model server was stopped after checking, releasing its allocated GPU memory.

## Further labelling and repeatable checks

1. Confirm demo, one player, map, round and clock. Review that player's footage; radar can reveal information the player never had. Stop and use blocked/excluded when POV, timing or source integrity is wrong.
2. Use an independent full-round pass for missed-event/recall measurement. Candidate-clip review is already exposed to detector choices and cannot measure independent recall.
3. Keep all observations from the same play in one grouped note. Record outcome separately from judgement and proposed alternative. “No trade kill within five seconds” does not mean “no attempt” or “bad positioning”.
4. For shooting, note weapon, shot sequence, target visibility, cover/smoke, damage and purpose. A pistol/SMG running shot or successful rifle fight is not automatically an error. Use uncertain when the evidence is insufficient.
5. Preserve demo/match split groups and snapshot versions. Human corrections must keep provenance; do not promote assistant QA notes or detector output into adjudicated labels. Keep validation/test data sealed during threshold tuning.

Reusable tools added: [corpus audit](../../tools/audit_demo_corpus.py) and [workspace/media audit](../../tools/audit_label_workspace.py). They produce local JSON reports and make **no semantic correctness claim**. Run the latter after a bulk recording/reanalysis, with `--decode` for every video frame. Export selected batches with `python -m app.annotation.clip_export export <private-folder> --batch <id>`; inspect the manifest and error count before transfer.

Private evidence is under `.local/showcase-audit-2026-11-20/`: corpus reports, deployment checks, consistent database copies, media report, frame sheets and a portable clip export. Logs are `.local/showcase-*.log`. Do not commit this folder or the raw demos.

## 25 November rehearsal gate

Run `./start-local.ps1 -Check`, then `./start-local.ps1`. Confirm one Ancient and one Anubis prepared review, selected player/focus/language, three representative clips (trade, interrupted trade, moving-fire context), a citation seek and a saved note. Keep this deterministic/template path available offline. Enable `-Llm` only after the private Windows model endpoint has passed a separate real question/latency check. Rehearse the actual Mac/projector/network route before relying on it. Follow the [existing presentation plan](../planning/TEACHER-PROTOTYPE-2026-11-25.md); no delivery task is marked complete by passing this local audit.
