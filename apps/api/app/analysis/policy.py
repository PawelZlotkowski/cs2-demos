"""Versioned initial review policy; thresholds are hypotheses to label, not verdicts."""

LOCAL_V1_DETECTORS = (
    "untraded_death", "shot_while_moving", "unused_utility",
    "team_flash", "opening_duel", "good_plays",
)


def policy_description(profile: str) -> dict:
    from app.analysis.detectors import DETECTORS

    return {
        "version": "local-v1.2" if profile == "local-v1" else "legacy-all-v1.2",
        "changes": "v1.2 (23 Nov 2026): team flash skips dead players; no clutch after dying; traded deaths "
                   "are not untraded deaths or unused utility; ranker reports scores at pick time.",
        "profile": profile,
        "detectors": list(LOCAL_V1_DETECTORS if profile == "local-v1" else DETECTORS),
        "interpretation": "Candidate moments for review, not proven mistakes. Missing evidence is not invented.",
        "execution": "API host: parsing, deterministic detectors and ranking. Optional local model: selection and explanation.",
        "replayHz": 8,
        "maximumMoments": 6,
        "tradeRadiusM": 5.0,
        "tradeWindowS": 5.0,
        "uncertainSignals": "Nearby untraded deaths and moving rifle bursts are context, not proven mistakes.",
        "recording": "Selected moment window plus configured padding, clamped to the round and 60 seconds.",
    }
