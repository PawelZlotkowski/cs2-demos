# Detector labels (task T17)

Hand labels for the detectors (AI Coach plan §11). Committed; raw demos are not.

## Target

- About 150 rounds from about 15 matches, split by match like `data/manifest.csv` (label only train and validation matches when tuning thresholds; test matches are for the final numbers).
- Both students label the **same 30 rounds** so agreement (Cohen's κ) can be reported.

## How to label

1. Process the demo in the app (upload, then choose the player). The match lands in `apps/api/data/matches/<match-id>/`.
2. Run the tool from the repo root with the API venv active:

   ```bash
   python -m eval.label_tool label --match-dir apps/api/data/matches/<match-id> \
       --player <steamid64> --rounds 3,7,12 --labeller <name>
   ```

   For each finding, watch the moment in the Studio and answer `c` (correct), `w` (wrong) or `u` (unsure), with an optional note. Then list what the detectors **missed** as `<detector> <t seconds> [note]` using the round clock shown in the Studio.
3. Agreement and scores:

   ```bash
   python -m eval.label_tool agreement data/labels/<a>.jsonl data/labels/<b>.jsonl
   python -m eval.label_tool score data/labels/*.jsonl
   ```

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
- Finding IDs change when detectors change, so scoring matches events by match, player, round, detector and time (within 1 s), not by ID.
- Detector names are the module names in `apps/api/app/analysis/detectors/`.
