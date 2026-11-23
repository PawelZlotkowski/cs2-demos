"""Bind saved and in-flight Ask answers to the evidence they can cite."""
import hashlib
import json

from app.coach.tools import player_match_refs
from app.repositories.matches import repo
from app.rag.index import default_index
from app.coach.prompts import load_prompt


def answer_evidence_version(match_id: str | None, player_id: str) -> str:
    if match_id is not None:
        values = [(match_id, repo.analysis.evidence_version(match_id, player_id))]
    else:
        refs = player_match_refs(player_id)
        values = [(ref, mid, repo.analysis.evidence_version(mid, player_id)) for ref, mid in refs.items()]
    # K-number citations can move when sources are edited or inserted. Hide old
    # answers after a corpus change, just as after a changed finding ID mapping.
    values.append(('knowledge', default_index().evidence_version()))
    values.append(('answer-policy-v2', load_prompt('answer_question').version, load_prompt('answer_across').version))
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()
