# Round labelling guide

Label one selected player's decisions within a round. A round can contain a mistake, a good play and several ordinary actions. Keep these as separate moments instead of assigning the entire round a good or bad score.

This rubric supports the Ancient and Anubis personal coach. It expands RR02 and RR12 in the [delivery plan](FINAL-DELIVERY-PLAN.md). Start with the six candidates in the current `local-v1` profile. The [Python tool plan](LOCAL-LABELLING-TOOL-PLAN.md) describes the implementation scaffold; the [local Python/Docker tool](../LABEL-TOOL.md) now supports these fields separately from the legacy Studio label form.

## What you should enter

The tool should fill match identity, map, player, round, side, ticks, equipment and event statistics from the parsed demo. Your work is to inspect the evidence and supply judgement.

| Field | Choices or content | Meaning |
|---|---|---|
| Review status | Draft, complete, blocked, excluded | A saved draft is not a reviewed negative example. Give a reason for blocked or excluded rounds. |
| Category | Shooting, utility, teamwork, positioning, objective, economy, other | The aspect of this player's play. Multiple categories are allowed. |
| Assessment | Mistake, good play, neutral, uncertain | Decision quality given the available information. |
| Observed facts | One or two sentences with evidence references | What the demo actually supports. |
| Player information | Known information, assumptions, unknown context | What could justify the decision at that time. |
| Reason | One or two sentences | Why you chose the assessment. |
| Alternative | One feasible action, or no change needed | What to do next time; required for a confident mistake. |
| Learning priority | 0 none, 1 minor, 2 useful, 3 important | How useful this moment is to review; separate from confidence. |
| Confidence | Low, medium, high | Confidence in the assessment, not probability of winning the round. |
| Outcome | Parsed win/loss/unknown plus optional observed consequence | Keep outcome separate from decision quality. |
| Missing evidence | POV, visibility, communications, inventory, timing, other | Explain what prevents a stronger judgement. |

Write in whichever of English or Polish is easiest. Save the language; translate accepted training examples later. A brief, specific explanation is more useful than a long generic coaching paragraph.

## Review each round in two passes

1. **Confirm the player and round.** Check the name and SteamID against the roster. Confirm the displayed round corresponds to the demo, especially after knife rounds, restarts or overtime. Use Overall focus for the initial dataset so a narrow focus does not hide other candidate types.
2. **Watch the full round with suggestions hidden.** Use CS2 POV or a suitable recorded clip, with radar for context. Hide generated coaching, detector markers and other annotators' notes. Inspect the decision before using its eventual result to judge it.
3. **Mark your own moments.** Set a start, decision anchor and end. Begin with roughly 5–10 seconds of lead-in, extending when setup or rotation context matters. Capture good, poor and uncertain decisions. Do not require a fixed number of moments.
4. **Complete the fields above.** Use the smallest supported claim. When a confident assessment is impossible, record uncertainty and the missing evidence.
5. **Save the independent pass, then reveal detector candidates.** Judge each candidate as correct, wrong or unsure. Link it to your existing moment when applicable; do not create duplicate human moments for several detectors describing one incident.
6. **Record missed events and completion.** Add supported events the enabled detectors missed. Keep out-of-profile coaching observations separately. Mark the round complete only after the full selected scope has been reviewed. An empty moment list can be a valid completed review.

The [local browser labeller](../LABEL-TOOL.md) saves the independent pass before revealing suggestions. Turn off automatic candidate recording for this pass and leave the detected clip queue closed. The legacy terminal labeller immediately displays candidates.

## Separate detector correctness from coaching quality

For the proposed rubric, `correct` means the candidate's explicitly displayed signal is supported. `wrong` means that signal is contradicted or attributed to the wrong player/event. `unsure` means the evidence is insufficient. The separate assessment says whether the player made a mistake. Version this definition; older labels may have judged the entire coaching message, so do not silently pool them with new signal labels.

| Current candidate | Check the factual signal | Then ask about the decision |
|---|---|---|
| `untraded_death` | Player died to an enemy, a teammate remained alive and no qualifying trade occurred in the configured window | Was a trade actually feasible given visibility, timing and objectives? Proximity alone is insufficient. |
| `shot_while_moving` | Weapon and event-level movement evidence satisfy the recorded detector rule | Was the firing choice avoidable and inappropriate? This heuristic does not establish aim quality or exact inaccuracy. |
| `unused_utility` | Available inventory evidence shows held utility at death | Was there a safe, useful earlier opportunity to use it? Possession alone does not prove waste. |
| `team_flash` | The player's flash affected a teammate beyond the recorded rule threshold | Did it disrupt a useful action, or was there an acceptable coordinated tradeoff? Communications may be unknown. |
| `opening_duel` | Correct player and first qualifying duel outcome | Was the approach sensible given the objective and available support? Losing is not automatically an error. |
| `good_plays` | Verify the particular entry, trade, multi-kill, clutch, flash assist or utility-damage subtype | Was the decision good, or did a risky action happen to succeed? |

Load thresholds and subtype definitions from a frozen detector snapshot. Do not memorise a threshold and assume it remains unchanged after tuning. Dry peek, late rotation, economy mismatch and repeated death zone are currently outside `local-v1`; human observations in these areas are useful, but are not false negatives for a detector that was disabled.

If a candidate combines a true numerical signal with unsupported advice, mark signal correctness and the coaching problem separately. Never use signal precision as evidence that the advice is correct.

## Examples of useful annotations

These examples are illustrative, not labels of inspected matches.

**Untraded death with insufficient context.** Facts: the selected player died and no teammate killed the attacker within the configured trade window. Detector: correct. Assessment: uncertain. Reason: radar proximity does not establish a teammate's line of sight; communications are unavailable. Missing evidence: POV and visibility. Alternative: leave empty until a feasible option can be established.

**Utility used at the right time.** Facts: the player's flash blinded an opponent immediately before a teammate's kill; the reviewed POV shows it supported the entry. Assessment: good play. Category: utility and teamwork. Reason: utility supported a teammate's engagement. Alternative: repeat the timing when the same setup is available. Do not infer an agreed voice call from the sequence alone.

**Death with an unused grenade but no practical throw.** Facts: inventory shows a grenade at death; the inspected sequence shows the player was already under immediate attack. Detector: correct. Assessment: neutral unless earlier review establishes a usable opportunity. Reason: retaining utility during the immediate fight was not itself the error. Do not label the whole round neutral without reviewing the earlier setup.

**No useful coaching moment.** Full round reviewed; no supported issue or particularly instructive good play identified. Save a completed round with zero moments. This differs from an unreviewed round or a round blocked by missing replay data.

## Evidence and time rules

Save raw demo ticks as the primary anchor, plus elapsed seconds since the round's freeze end. Existing analysis uses that elapsed clock; it is not the in-game countdown or the time since the video began. Preserve the parser's clock mapping, tick rate and any fallback warnings. Do not hard-code a universal tick rate or infer timestamps from a countdown screenshot.

Check at least a few kills and a bomb event against playback when onboarding a demo. If timing is wrong, block that round rather than compensating with remembered offsets. A clip needs its own start tick/time mapping and player identity.

Telemetry can establish positions and events without establishing what the player saw. Mark omniscient radar information as observer-only. A demo POV is also a reconstruction. Do not claim voice communications, intent or exact perception unless there is evidence for them. Missing parser data is unknown, not a confirmed absence of an event.

## A manageable first dataset

Begin with six training rounds, three per map, to test the workflow. Count them within the planned 30-round calibration pilot if their provenance and later rubric remain valid; otherwise retain them as practice only. Measure review time before scaling.

The current delivery target is 150 unique rounds, with a proposed 90 train / 30 validation / 30 test allocation, drawn from a corpus of 100 matches split 65/15/20 by match. Freeze the manifest before tuning. For the 30 training rounds reviewed independently by both students, propose 15 Ancient and 15 Anubis, replacing the older three-map allocation. Agree and record that allocation under RR02.

Sample full rounds across T/CT, wins/losses, economy states, sources and ordinary play. Use a recorded random seed for a representative base sample, then separately flag targeted additions for rare situations. Do not select only deaths or rounds where the current detector already fires. Stratified or enriched results describe that sample; they are not automatically population-wide rates.

Keep every POV, clip, translation and duplicate download of a match in the same split. Hash decompressed demo bytes to catch differently compressed copies; also reconcile source match IDs because different recordings of one match can have different hashes. Record the source and permitted use. Keep professional/public matches identifiable as a separate source group when comparing with personal FACEIT matches.

For the overlap rounds, work independently before discussing disagreements. Keep both originals and a separate adjudicated record. Report agreement and unsure counts. If only Pawel labels initially, save those labels; repeat-reviewing them later can check consistency but does not measure inter-rater agreement.

Complete test labels in a separate evaluation session and keep them out of prompt, threshold and training development. Training conversations must come from reviewed training material; annotations alone are not yet tool-use training examples.

## A collection plan for the current eighty demos

**Proposed on 15 November 2026 for the 25 November prototype.** Paweł reports roughly 40 demos per map. Start with these files and count eligible matches after checking duplicate downloads, map, parser compatibility and permitted uses. The quantities below assume 40 usable, distinct matches on each map. They are allocations for the team to make before looking at model results. The [first prototype plan](TEACHER-PROTOTYPE-2026-11-25.md) gives the presentation schedule.

| If the inventory confirms the count | Training | Validation | Sealed test | Total |
|---|---:|---:|---:|---:|
| Ancient | 25 | 5 | 10 | 40 |
| Anubis | 25 | 5 | 10 | 40 |
| Initial corpus | 50 | 10 | 20 | 80 |
| Later additions towards the existing 100-match target | 15 | 5 | 0 | 20 |

This allocation preserves the 20 unseen matches promised for moment selection. Allocate by match identity with a recorded seed, stratifying by map and, where possible, by source and recurring player. Reserve eligible, previously unseen matches for the sealed set. Put matches already used for debugging, demonstrations or prompt tuning on the development side. If many demos come from one player, describe the population as repeat matches from that player or group. A claim about new players needs evidence from players held out across splits. Collect additional matches where the inventory shows gaps in source, date or player coverage.

**Make one private manifest that both students use.** Start with one row per demo file. Record the fields below and use the same provider-qualified source match identity for all recordings of the same game. Hash the decompressed demo bytes to recognise compressed and plain copies. Flag the chosen primary recording for counting and hold all related files in the same partition. The following header can be copied to a shared working file. The first four columns use the browser labeller’s provenance field names.

```text
source,sourceMatchId,split,trainingPermitted,demoSha256,matchAlias,map,matchDate,playerAlias,primaryRecording,parseStatus,classroomUse,priorExposure,manifestVersion
```

Use `train`, `val` and `test` as the assigned split values. Record unknown permissions explicitly and set `trainingPermitted` to false until training use is established. Classroom display is a separate decision. Store raw demos, the identity lookup and unredacted JSONL privately. The course report can give aggregate counts by map/source/partition, exclusions and reasons, sampling method and intended use. Documenting collection and permitted uses follows the approach in [Datasheets for Datasets](https://arxiv.org/abs/1803.09010).

## The first labelling session

1. **Paweł prepares six training rounds.** Choose three per map, preferably from six different matches. Record the sampling seed and round list before opening findings. Include ordinary live rounds, both sides and a mix of wins and losses. Keep knife rounds, parser failures and rounds already examined for the presentation identifiable. Keep any deliberately sought rare examples in a separately marked group.
2. **Both students work independently.** In the browser labeller, use separate handles, choose the same player, switch off automatic candidate recording and leave the detected queue closed. Watch the full round, mark zero or more decision anchors and save the independent pass. Then reveal candidates, judge the literal signal and record any missed in-scope event. Save the completed review. If a reviewer already saw a candidate, retain the exposure flag and use a fresh round for the independent comparison. [Browser instructions](../LABEL-TOOL.md)
3. **Compare decisions before rewriting the rubric.** Match annotations by source match, player, round and event identity. For the same detector snapshot retain its finding ID. Across snapshots use event/tick and detector type, with a pre-agreed time tolerance for events lacking a stable ID. Match one to one and record unmatched events. Review disagreements about timing, observer-only knowledge, tactical interpretation and priority. Preserve both original exports and a separate agreed resolution with the reason. Freeze a rubric version. Report exact agreement and unsure counts on the shared items. Once there are sufficient comparable labels, report Cohen’s kappa for each relevant judgement alongside the counts.
4. **Time the complete pass.** Six unique rounds double-reviewed give 12 individual reviews. The final target of 150 unique rounds with 30 double-reviewed requires 180 individual reviews before adjudication, match-level picks and answer ratings. Multiply the pilot’s measured minutes per review by 180 to estimate that part of the workload. Keep the first six within the 30-round calibration set if their labels still meet the frozen rubric.

**A worked decision.** The saved Anubis development example has a round-6 finding for a death at 46.469 seconds with two grenades held. A reviewer who independently confirms the inventory can mark the signal `correct`. With only that fact available, mark the decision `uncertain` and name the missing evidence, such as an earlier safe throwing opportunity. A wider verified POV could justify a different assessment. The earlier technical check chose the first roster entry, so this example is for calibration or teaching and still requires player confirmation and classroom permission for displaying the match. [Presentation example](TEACHER-PROTOTYPE-2026-11-25.md)

For training, deliberately look for a **pair of similar signals with different coaching answers**. For example, find two genuine deaths with grenades held. In one, reviewers can point to an earlier feasible throw. In the other, retaining utility was reasonable or the evidence is inconclusive. Record the exact information that distinguishes them. This tests whether the model can move beyond repeating the detector name. Keep these selected pairs identifiable as challenge examples when reporting results.

## Turning labels into the coach and the evaluation

| What the team records | How to use it in the project | Check before using it |
|---|---|---|
| Candidate signal verdicts and independently observed missed events | Compute per-detector precision on judged candidates and recall against independently reviewed events. Use training examples to revise thresholds. | Match each event once. Report correct/wrong/unsure, missed and excluded counts. Candidate-first clip queues alone cannot supply the recall denominator. Report targeted challenge sets separately from the sampled rounds. |
| Human priorities and two independent sets of top moments | Compare model selection with the deterministic ranker and each rater using overlap at six and ranking quality (NDCG). | Make full-match picks before seeing system picks. Keep human-to-human agreement and the actual number of eligible picks visible. |
| Facts, cited evidence, available information, feasible alternatives and unknowns | Turn permitted training cases into reviewed examples of tool lookup, explanation, follow-up answers and appropriate uncertainty. Keep accepted or corrected answers as targets. Save original failures with a reason for error analysis. | Give the model the question and the evidence available through its tools. Keep human verdicts, ideal answers and test labels out of prompts, searchable map notes and player history. A finding ID is local to its snapshot. |
| Map notes and bilingual retrieval questions | Store reviewed, attributed general or map-specific guidance in the existing knowledge index. Record the expected passage for each retrieval question. | A cited map passage supports a general tactic. A match finding supports a claim about that game. Use target-map coverage when interpreting retrieval results, especially on Ancient. |
| Blind ratings of generated and rule-written advice | Give the same evidence and question to both systems. Record preference, unsupported factual claims, correct uncertainty, language, latency and repairs/fallbacks. | Retain failures under the system assigned. Group English/Polish versions and repeated ratings by original situation and match. The [current Lab pairing](../../apps/api/app/services/evaluation.py) filters for agent traces, so use a shuffled offline sheet for the pilot. |

**First backend change to propose.** Read the shared manifest in the dataset builder. The annotation tool already exports v2 JSONL with provenance. The training exporter currently assigns a separate 80/10/10 hash split. Have the adapter resolve every source match for a conversation, including history lookups, and keep only permitted train sources for training. Quarantine incomplete, conflicting or mixed-split provenance. Keep both the manifest revision and the annotation snapshot alongside the exported conversation. An acceptance fixture should include a compressed duplicate, a translated answer, an unknown-permission match and a train query that refers to a test match. The two variants must share the original partition and the ineligible cases must yield zero training examples. The legacy agreement/scoring command reads a different schema from v2. [Annotation export](../../apps/api/app/annotation/store.py) · [Current training exporter](../../apps/api/app/services/dataset.py) · [Research export formats](../LABEL-TOOL.md)

**Training example format.** Link a reviewed train moment to a user question, the assistant’s scoped tool call, the tool result and the human-approved final reply in the requested language. Include the tool schema, cited finding or passage, and all source match references. Store the human annotation and review outcome as evaluation metadata. Train the assistant to look up evidence, explain one feasible next decision, and acknowledge missing context. QLoRA adapts a frozen quantised base model. Run the same questions, tools and decoding settings before and after applying the adapter so its contribution can be measured. [QLoRA paper](https://arxiv.org/abs/2305.14314)

## What to bring to the generative AI course

**Lead with one question.** Given the same CS2 decision and evidence, does the self-hosted coach offer a more actionable, evidence-supported next step than a deterministic template? The product can express the answer in three short parts: the observed fact and its citation, what remains uncertain, and one conditional next action when the evidence permits it.

For **25 November**, freeze four validation situations, ideally two per map. Use the same player, evidence and question within each pair. Produce a template and local-model explanation in both English and Polish, giving eight pairs or 16 outputs. Shuffle A/B per pair and have both students rate independently. Record model/template/tie for the most feasible, evidence-supported answer, plus the reason. Audit each factual claim as supported, contradicted or unsupported from the available evidence. Report wins, losses, ties and failures with their denominators and show one disagreement. The pilot describes these four situations. A player study can later test whether readers can use the advice to name a feasible action in a comparable situation. Claim-level human grounding audits are also used in [RAGTruth](https://arxiv.org/abs/2401.00396).

Use three kinds of Ask questions when building the bilingual set. A **match question** such as “What was I still carrying?” needs a finding or round-stat lookup. A **map question** such as “Under what conditions could a flash support this entry?” can also require a reviewed knowledge passage. An **unanswerable question** such as “What did my teammate say before I threw it?” tests whether the coach recognises missing communications. For each question save the expected tool, permissible evidence IDs, answerability and minimum acceptable content in a private answer key. Have a speaker check that the English and Polish versions ask the same thing. Show reviewers the same evidence and give credit to a justified expression of uncertainty when the answer key records insufficient evidence.

For **December**, keep the template and base agent as fixed comparators. Run a focused retrieval ablation on map-dependent questions with the same base agent and tools, first without map-note retrieval and then with it. Compare the base model with the QLoRA adapter using the same retrieval configuration. Keep the data split, questions, evidence, quantisation and sampling comparable. Preserve verifier failures and template fallbacks in the original system’s denominator. Measure appropriate uncertainty on ambiguous cases and unnecessary abstention on answerable cases. Show the teachers one supported claim, one genuine failure or explicitly labelled controlled rejection, one matched A/B comparison and one limitation in whose matches the data represents.
