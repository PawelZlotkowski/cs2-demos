"""Versioned initial review policy; thresholds are hypotheses to label, not verdicts."""

LOCAL_V1_DETECTORS = (
    "untraded_death", "shot_while_moving", "unused_utility",
    "team_flash", "opening_duel", "good_plays",
)


def policy_description(profile: str) -> dict:
    from app.analysis.detectors import DETECTORS

    return {
        "version": "local-v1.0" if profile == "local-v1" else "legacy-all",
        "profile": profile,
        "detectors": list(LOCAL_V1_DETECTORS if profile == "local-v1" else DETECTORS),
        "interpretation": "Candidate moments for review, not proven mistakes. Missing evidence is not invented.",
        "execution": "API host: parsing, deterministic detectors and ranking. Optional local model: selection and explanation.",
        "replayHz": 8,
        "maximumMoments": 6,
        "recording": "Selected moment window plus configured padding, clamped to the round and 60 seconds.",
    }
