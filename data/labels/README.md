# Detector labels (task T17)

Hand labels for the detectors (AI Coach plan §11). Committed; raw demos are not.

## Target

- About 150 rounds from about 15 matches, split by match like `data/manifest.csv` (label only train and validation matches when tuning thresholds; test matches are for the final numbers).
- Both students label the **same 30 rounds** so agreement (Cohen's κ) can be reported.

## How to label

In the app: Lab, Labels (needs `RR_LAB_ENABLED=1`). It writes the same files, lets you pick your own six moments for a match before seeing the coach's (saved to `moments/<match-id>-<player-id>-<labeller>.json` and scored with overlap@6 and NDCG@6), and shows precision, recall and κ. Labeller names use letters, digits and `_`.

From the command line:

1. Process the demo in the app (upload, then choose the player). The match lands in `apps/api/data/matches/<match-id>/`.
2. Run the tool from the repo root with the API venv active:

   ```bash
   python -m eval.label_tool label --match-dir apps/api/data/matches/<match-id> \
       --player <steamid64> --rounds 3,7,12 --labeller <name>
   ```

   For each finding, watch the moment in the Studio and answer `c` (correct), `w` (wrong) or `u` (unsure), with an optional note. Then list what the detectors **missed** as `<detector> <t seconds> [note]` using the round clock shown in the Studio.
3. Agreement and scores (patterns are expanded by Python, so quote them and they work the same in PowerShell):

   ```bash
   python -m eval.label_tool agreement data/labels/<a>.jsonl data/labels/<b>.jsonl
   python -m eval.label_tool agreement "data/labels/<a>-notes*.json" "data/labels/<b>-notes*.json"
   python -m eval.label_tool score "data/labels/*.json*"
   ```

   Set `RR_CORPUS_MANIFEST` to the private corpus `manifest.csv` to get the scores separately for train+validation and for test (each label's demo is looked up by `demoSha256`). Without it the scores are reported as `split unknown`. Verdicts on test-split demos are counted in `testSplitVerdicts` and a warning: they must not tune anything. The Lab page shows the same numbers.

## Clip labeller exports

The clip labeller exports one JSON document per labeller (`<labeller>-notes*.json`, `"format": "round-reviewer-notes-v1"`): `demos` maps `demo-<sha256>` to its metadata and provenance, and `labels` holds one entry per clip review (`kind: "clip"`, `revision`, `savedAt`, `label`). The label's `matchId` is the demo id, `finding` is the lead finding, and `footage.findings` / `footage.reviewKey` list every finding the clip shows.

- Exports are cumulative: a later file repeats the earlier labels. The tools keep the newest `savedAt` per match, player, snapshot, review key and labeller, so passing every export never counts a label twice.
- Only `complete` labels are scored. A clip that shows one finding is scored with its verdict; a clip that shows several is scored per finding only where it carries per-finding `signalReviews`, because one verdict cannot say which finding was right. Labels without a verdict are skipped; `unsure` is counted but left out of precision.
- Exports list no missed events, so recall is `null` for detectors they contribute to.

## File format

One JSON object per line, one line per labelled round per labeller. File name: `<match-id>-<player-id>-<labeller>.jsonl`.

```json
{
  "matchId": "match-abc123",
  "map": "de_mirage",
  "playerId": "76561198000000001",
  "round": 7,
  "labeller": "pawel",
  "labelledAt": "2026-10-06T18:20:00+00:00",
  "findings": [
    {"findingId": "F14", "detector": "untraded_death", "t": 42.3, "verdict": "correct"},
    {"findingId": "F15", "detector": "dry_peek", "t": 41.8, "verdict": "wrong", "note": "enemy pushed me"}
  ],
  "missed": [
    {"detector": "team_flash", "t": 30.0, "note": "blinded two teammates at A ramp"}
  ]
}
```

- `verdict` is `correct`, `wrong` or `unsure` (unsure is left out of precision and recall).
- Labelling a round again appends a line; only the newest line per labeller, match, player and round counts.
- Finding IDs change when detectors change, so agreement pairs events one to one by match, player, round and detector: the same finding ID within 1 s first, then the nearest time within 1 s. κ is `null` when it is undefined (for example both labellers always said `correct`).
- Detector names are the module names in `apps/api/app/analysis/detectors/`.
