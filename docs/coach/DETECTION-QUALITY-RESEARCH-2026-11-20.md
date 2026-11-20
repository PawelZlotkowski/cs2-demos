# CS2 detection quality and knowledge research

20 November 2026. Scope: the selected player's review on Ancient and Anubis, in English and Polish. This expands RR11–RR13 and RR16 in the [delivery plan](../planning/FINAL-DELIVERY-PLAN.md), not a separate backlog.

The immediate problem is overconfident interpretation of weak signals. A shot event is not proof of a duel, movement is not proof of bad shooting, and a nearby teammate's death is not proof of a clear trade opportunity. Keep measured events, judgement and coaching knowledge separate. The parser extracts evidence; detectors propose reviewable situations; human labels establish judgement quality; the coach explains supported conclusions using retrieved knowledge.

## Findings in this implementation

| Area | Previous behaviour | Implemented correction |
|---|---|---|
| Trade subject | D1 assessed the selected player's own untraded death | Assess teammate deaths while the selected player is alive and within 5 m |
| Trade attribution | Successful revenge kills used only time and team membership | Require the same proximity evidence for positive findings and `RoundStats.tradeKills`; count each revenge kill once |
| Missing opportunity evidence | An untraded death was automatically a mistake | Record no trade, another teammate's trade, player death, unavailable killer or incomplete observation as context |
| Movement | Rifle, pistol and sniper speed alone generated mistakes, including idle shots | Require at least two moving rifle shots and nearby firearm damage/kill evidence involving the player; retain as context |
| Weapons | One speed fraction applied to very different weapons | Pistols, SMGs, shotguns and scoped weapons abstain pending calibration; retained rifle speed values are explicitly a legacy proxy |
| Repeated action | Ranker/verifier compared lead times; a mixed group could be selected twice | Reject reused finding IDs and overlapping clip windows; cap chained candidate groups |
| Knowledge ingest | Source catalogue headings could become coaching passages; new folders could sort after personal notes | Exclude `SOURCES.md` as well as `README.md`; explicitly place personal notes last |

The policy is now `local-v1.1` (`legacy-all-v1.1` for the broad profile). Existing stored reviews, human labels and recorded media are not rewritten. Fresh analysis is required to see the corrected findings. Context is available in findings and labelling, but cannot independently lead a mistake/good highlight. This deliberately reduces coverage until stronger evidence is available; it does not turn all uncertain situations into negative coaching.

`deathTraded` remains the descriptive historical team-response statistic for the selected player's own death. It differs from the new nearby personal `tradeKills` metric. Missing positions cause abstention, so zero nearby trades must not be described as proof that no trades occurred anywhere in the match. The metre conversion retains the project's existing 0.0254 m per world unit convention.

## Sources to use and their limits

These are selected primary sources and author-maintained resources, checked on 20 November. They serve different purposes; a tutorial is not a labelled evaluation set. Machine-readable source records are in [the source manifest](../../data/knowledge/research-sources-2026-11-20.json).

| Source | Useful material | How Round Reviewer should use it |
|---|---|---|
| [Leetify metric glossary](https://leetify.com/blog/leetify-stats-glossary/) | Separates personal trades from traded deaths. Its counter-strafe metric filters for rifle engagements and excludes crouched shots | Reference for measurement design. This is a 2021 metric description, not a current CS2 accuracy oracle |
| [Refrag counter-strafing guide](https://refrag.gg/blog/counter-strafing-the-key-to-precision-aim-in-counter-strike-2/) | Movement technique, crouched movement exception and practice methods | Short attributed concept notes and drill links; no copied article or implied subscription |
| [Refrag aim training](https://refrag.gg/blog/cs2-aim-training-guide/) | Crosshair placement, movement and practice choices | Explain the skill after evidence establishes the relevant problem |
| [Refrag Bootcamp](https://refrag.gg/bootcamp/) | Structured mechanics and utility training | Candidate exercise catalogue for human review, not automatic truth labels |
| [demoparser2](https://github.com/LaihoE/demoparser) | Available events and player/weapon properties | Keep the existing parser. Probe supported fields in the installed version before changing production extraction |
| [Valve weapon schema mirror](https://github.com/SteamTracking/GameTracking-CS2/blob/master/DumpSource2/schemas/client/CCSWeaponBaseVData.h) | Separate movement, stance, jumping, firing, spread, recovery and firing-mode fields | Defines what a versioned weapon model must represent. A schema gives field names, not calibrated values or a complete accuracy formula |
| [Awpy visibility and assets](https://awpy.readthedocs.io/en/stable/visibility.html) | Collision geometry and versioned map assets | Assess as an offline visibility/geometry helper. Do not swap the working parser just to gain one capability |
| [Awpy navigation](https://awpy.readthedocs.io/en/stable/nav.html) | Navigation mesh queries | Research path-based reachability, distinct from straight-line distance and visibility |
| [Awpy event datasets](https://awpy.readthedocs.io/en/stable/datasets.html) | Events, shot state and explicit trade conventions | Cross-check event interpretation on fixtures. Different tools' trade counts need not agree when definitions differ |
| [CSNADES Ancient](https://csnades.gg/guides/ancient) and [Anubis](https://csnades.gg/guides/anubis) | Map-specific utility demonstrations | Link to examples and verify in the matching game/map build; do not treat an old lineup as a universal coordinate rule |
| [Valve introducing TrueView](https://store.steampowered.com/news/posts/?appids=730&enddate=1762988292) | Demo playback prediction and version caveats | Record playback build/settings in the annotation provenance; replay pictures are not infallible subtick measurements |

Use the sources above for short original notes with attribution. Their availability on the web is not permission to mirror all articles, videos or transcripts. The present change contains no third-party full text, downloaded videos, new model weights or external model calls.

## Datasets worth evaluating

| Dataset | What the author's documentation provides | Fit and limitation |
|---|---|---|
| [OpenCS2 POV WebDataset](https://huggingface.co/datasets/blanchon/opencs2_dataset_wds/blob/main/README.md) | POV round videos, tick sidecars, input/world-state data, analytical indexes and synchronised perspectives | Strong candidate for testing video/tick alignment and mining review windows. Its card describes renders/metadata as CC BY 4.0 and retains original tournament terms for demos. Event categories are not expert mistake labels |
| [X-EGO-CS](https://huggingface.co/datasets/wangyz1999/X-EGO-CS) | Video, action trajectories, measured offsets and match-level splits; includes Ancient and Anubis | Candidate multimodal research set, with limited target-map coverage in the card. Audit identity precision, alignment, splits and annotation provenance before use; the card's MIT label alone does not settle upstream footage rights |
| [PureSkill competitive CS2](https://docs.pureskill.gg/datascience/adx/cs2/csds/) | Parsed telemetry and event channels, data dictionary and known-flaw documentation | Useful schema/analysis reference. Access requires provider approval through AWS; documentation lists CC BY-NC-SA 4.0 and possible AWS transfer charges. No subscription or download was started |
| [HLTV results and demos](https://www.hltv.org/results) | Professional match catalogue | Use permitted demos to obtain examples, then label decisions. Professional play introduces a skill/team-communication distribution shift relative to invited users |
| Existing owner-provided demos and clips | The exact playback and parser used by this app | First choice for the development pilot, including mundane correct decisions and missed events rather than only highlights |

The inspected resources do not establish a ready-to-use, expert-verified dataset of the exact coaching errors required here. Raw/event-labelled footage remains valuable, but a kill, loss or professional action must not automatically become a correct/incorrect decision label. Older CS:GO data is useful for research methods, not current weapon or map calibration.

## Trade rules and evidence

The implemented eligibility rule is the owner's choice: teammate death, selected player alive, known opposing killer, fresh player position and three-dimensional separation at most 5 m at the death. Compare the unrounded distance. A sample more than 0.25 s old or from the future is insufficient. Use the existing 5 s response window, clamped to round end. Same-time ambiguous ordering abstains rather than inventing a subtick sequence.

Record successful personal retaliation separately from another teammate's retaliation. Damage to the killer is useful attempt evidence, but no damage does not mean no attempt: shots may miss. A player dying during the response window or the round ending early is a different outcome from observing the full window without retaliation.

For a future **missed trade mistake**, require additional evidence: a viable route or angle to the killer, weapon readiness, adequate time before the killer becomes unavailable, and visibility/flash/smoke context. Keep the player's current task and known information in view. The omniscient demo contains enemy positions the player may not know. A nearby teammate behind a wall is a required negative test, not an automatic failure.

The 5 m filter will exclude some valid longer-range crossfire trades. That is an intentional product definition, not a claim about the rules of CS2. Preserve it in versioned evaluation metadata so a changed threshold does not masquerade as improved skill.

## Shooting rules and parser work

Do not replace the old rule with “only show moments containing a kill”. That would miss useful damage exchanges, unsuccessful duels and good support. Instead establish an engagement, then assess the action using weapon and situation.

The current conservative gate uses firearm damage or a kill involving the selected player within 0.5 s of a burst, at least two moving shots, a moving fraction of at least half, and known finite shot velocities. It does not prove the bullets targeted the damaging opponent, nor that movement caused a miss. Therefore its output remains context. These gate values are engineering hypotheses, not research-derived optimal thresholds.

The next parser revision should preserve these fields at shot/engagement time:

| Evidence | Reason | Missing-data behaviour |
|---|---|---|
| Weapon ID, firing mode, scope, recoil/accuracy state, time since last shot | Accuracy differs by mode and shot history | No weapon-specific mistake verdict |
| Velocity XYZ, duck amount, grounded/ladder state, current maximum speed | Separate running, crouched movement, jumping and landing | Report unknown stance; do not assume standing |
| Eye position/angles, relevant enemy hitboxes and geometry | Estimate target angle, range and potential visibility | Never use radar proximity or spotted bit as proof of sight |
| Flash onset/duration, smoke lifetime/geometry, penetration information | Distinguish blind fire, smoke spam and wallbangs | Preserve uncertainty; damage alone does not prove visibility |
| Shot, damage and death event IDs, exact ticks, build and parser version | Join events without dropping identity or confusing clocks | Preserve nulls and event order; reject ambiguous associations |
| Selected-player dense windows around hurt/fire/contact, not only kills | Capture duels without deaths and avoid selection bias | Bound windows and measure additional blob size and parsing cost |

Probe properties with the installed demoparser2, retain existing event extraction if an optional property is unsupported, and record field availability. A single failed optional field must not silently empty the entire `weapon_fire` table. Preserve the current separate analysis blobs and 8 Hz radar contract. No new parser fields were added in this correction.

Build a small local calibration map/session for stop/tap, crouch walk, running pistols, close SMG fights, scoped fire, jumps, smoke spam and wallbangs. Record the exact CS2 build, weapon data hash and server settings. Compare telemetry with the intended action and recorded POV; avoid claiming a speed proxy computes actual hit probability.

## Broader detection coverage

The next useful detectors should cover different decisions, rather than fill a quota with variations of movement. Proposed order within RR13:

| Situation | Required evidence | Important counterexample |
|---|---|---|
| Successful/missed trade | Nearby death, identity, response, readiness, visibility | Smoke, wall, flash, reload, another teammate already trades |
| Harmful team flash | Blind interval overlaps teammate engagement | Teammate is safe and the flash successfully enables entry |
| Useful support flash | Enemy blind overlaps supported engagement | Flash duration without any teammate able to capitalise |
| Avoidable unused utility | Inventory plus a feasible earlier use | Saving for post-plant, surprise death, no safe throw window |
| Weapon readiness or exposed reload | Reload/draw interval, exposure and nearby enemy action | Safe reload behind cover; baiting information |
| Repeated exposure after contact | Same threat, renewed visibility and available cover | Coordinated repeek, time pressure or forced escape |
| Crossfire/support spacing | Both players' sightlines, paths and timing | Five metres through a wall; long-range valid crossfire |
| Objective timing | Bomb/defuse state, kit, route and time budget | Saving is the rational decision; information is incomplete |
| Crosshair placement/shot discipline | Visible target onset, angles, range and weapon | Trigger discipline, prefire, unseen target, demo timing artefact |
| Rotation and economy | Information timeline, team plan proxies and resources | A slow arrival or unusual buy can be deliberate |

Keep speculative dry-peek, rotation and economy rules outside the narrow local profile until they have suitable labels. Good outcomes and bad outcomes both need review. A winning shot can be technically poor; losing a duel can follow a reasonable decision.

## RAG implementation direction

The repository already has Markdown chunking, SQLite BM25, optional local embeddings and reciprocal-rank fusion. Its map corpus is mainly draft Mirage/Anubis material; Ancient coverage and enforced review status remain gaps. Adding more unreviewed text would amplify the original errors.

1. Maintain three collections: versioned mechanical facts, conditional coaching concepts, and human-reviewed example episodes. Store raw demos/clips separately. Never paste raw tick streams into a text knowledge index.
2. Give each approved chunk a stable document/chunk ID, source URL, author, reviewed date, applicable game/map build, language, topic, conditions, exceptions and content hash. The present `K1…` ordinal IDs are only safe within a captured run; persist the actual retrieved passage with the trace before relying on long-lived citations.
3. Enforce review/build/map filters at ingestion or query time. Today frontmatter review status is informational, not a runtime gate. Exclude drafts from evaluation; add source-reviewed and in-game-reviewed states rather than pretending web review is gameplay validation.
4. Retrieve using the detector topic plus weapon, side, map and situation. Search EN and PL queries; compare BM25 alone with the existing hybrid path using local embeddings. Add a local reranker only if measured retrieval improves enough to justify latency.
5. Pass retrieved advice as conditional knowledge. Every assertion about this match still needs a finding/statistic or a human-reviewed episode. Knowledge about stopping before rifle fire cannot prove the player missed because of movement.
6. Keep snapshot citations and uncertainty through explanation, Ask and training exports. The current text verifier checks citations/numbers, not every causal interpretation; typed evidence-to-claim checks under RR14 remain necessary.

This change adds short original detection-context passages and corrects several overconfident fundamentals. It does not claim a completed, human-validated RAG system or import the external datasets wholesale.

## Labels and acceptance

Use the existing 30-round development pilot and independent annotation workflow. Split by **match identity** before sampling clips; all POVs and overlapping windows from one match remain in the same split. Deduplicate mirrored demos across external datasets. Do not tune on the sealed test set.

For each episode, label the observed event, opportunity (`yes`, `no`, `unknown`), attempt, outcome, decision quality (`mistake`, `reasonable`, `good`, `uncertain`), reason, alternative and evidence interval. Mark visibility and player knowledge separately from spectator knowledge. Keep confidence/reviewer agreement; an automatic detector label is a proposal. Include full-round independent discovery so recall is not measured only on generated candidates.

Include explicit negatives: pistol run-and-gun, rifle spam without a visible target, crouch walk, kill-free damage fights, nearby deaths through walls/on other floors, interrupted trade windows, a teammate already trading, dry peeks that are reasonable, and one fight producing several findings. Inspect aligned POV plus radar and the relevant evidence; check game-build/TrueView status before adjudicating frame timing.

Report precision/recall per **judgement category**, abstention/coverage, false accusations per reviewed round, duplicate selected-episode rate, temporal alignment, EN/PL retrieval hit@k/MRR and human explanation usefulness. Event-detection correctness and coaching correctness are separate metrics. Choose acceptance thresholds before measuring the sealed set; the initial goal is fewer unsupported accusations, not a fixed number of highlights.

## Validation and remaining work

Full API regression suite: **335 passed, 3 skipped in 118.80 s** on 20 November 2026. The focused detector/ranker/template/verifier/knowledge run also passed (119 tests). Full-suite command from `apps/api`, using an isolated data directory and no model/recording:

```powershell
$env:RR_DATA_DIR = 'C:/Users/pawel/Documents/cs2-demos-studio/.local/detection-quality-tests-verified'
$env:RR_AUTH_ENABLED = 'false'
$env:RR_ANALYSIS_PROFILE = 'all'
$env:RR_LLM_ENABLED = 'false'
$env:RR_CSDM_ENABLED = 'false'
.venv/Scripts/python.exe -m pytest -q -o faulthandler_timeout=40
```

The suite needed execution outside the filesystem/network sandbox because local TestClient socket initialisation stalled inside it. These environment overrides applied only to the test process; the running app's authentication configuration was not changed. The working tree is uncommitted, based on `153408688d8c6d22760570e25b609a0ee91fc295`, with other owner changes retained. Test totals describe that whole current API tree, not only this patch.

The knowledge index contains 158 passages, including eight new detection-context passages. Comparing file/title identities against the baseline confirmed that all 150 existing curated `K..` identifiers still resolve to the same sections. This is compatibility for this change, not a general solution for ordinal citation IDs. English and Polish retrieval smoke queries resolve the intended trade, movement and crouch notes; source catalogue text is excluded. All 16 source records have unique IDs and the report's local links resolve.

Read-only smoke over five cached reviews found **two distinct telemetry inputs**: Ancient and Anubis, each with 21 playable rounds and ten players. Across every player, moving-shot candidates changed from 156 automatic mistakes to 24 contextual observations. This is a reduction in output, **not a measured precision improvement**. It also does not assess recalled mistakes lost by abstention. The aggregate input hashes and counts are in [the smoke record](DETECTION-QUALITY-SMOKE-2026-11-20.json).

`data/labels/` currently contains the format guide but no adjudicated round fixtures, so the new edge cases are synthetic and the cached-match check is unlabelled. The local model health request to `http://127.0.0.1:8080/health` timed out; no real-model output, latency or quality was measured. The attempted Ruff check could not run because Ruff is not installed in the API virtual environment. No dependency was installed to hide that limitation.

The next concrete handoff is Pawel's parser/visibility feasibility work under RR10/RR13 plus both reviewers' development labels under RR12. Aleksander can use the source manifest and corrected concept notes for RR11/RR16. Before product acceptance, rerun fresh analysis/recording on permitted examples and check real local-model explanations. No raw demo reparse, video adjudication or live-model quality result is claimed by the cached smoke.
