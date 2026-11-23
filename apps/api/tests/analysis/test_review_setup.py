import pytest

from app.core.config import settings
from app.models.contracts import MatchStatus, PlayerSelectRequest
from app.processing import pipeline as mod
from app.repositories.matches import MatchRepository
from tests.analysis import synthetic_demo as sd


@pytest.fixture()
def setup_match(tmp_path, monkeypatch):
    for key, path in [('data_dir', tmp_path / 'data'), ('upload_dir', tmp_path / 'uploads'), ('work_dir', tmp_path / 'work'), ('matches_dir', tmp_path / 'matches')]:
        monkeypatch.setattr(settings, key, path)
        path.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, 'llm_enabled', False)
    monkeypatch.setattr(settings, 'csdm_enabled', False)
    repository = MatchRepository()
    pipeline = mod.ProcessingPipeline(repository)
    record = repository.create_upload('setup.dem', b'PBDEMS2\x00')
    record['requires_setup'] = True
    roster = [{'id': sd.sid(i), 'name': f'Player {i}', 'team': 'T'} for i in sd.T_IDS]
    roster += [{'id': sd.sid(i), 'name': f'Player {i}', 'team': 'CT'} for i in sd.CT_IDS]
    monkeypatch.setattr(mod, 'inspect_demo_roster', lambda path: ('de_ancient', roster))
    parsed = []

    def parse(path):
        parsed.append(path)
        return sd.build()

    monkeypatch.setattr(mod, 'parse_demo_file', parse)
    return repository, pipeline, record['id'], roster, parsed


def test_no_full_parse_before_confirmation_and_utility_focus_reaches_analysis(setup_match):
    repo, pipeline, mid, roster, calls = setup_match
    pipeline.process(mid)
    assert repo.get(mid)['status'] == MatchStatus.awaiting_setup
    assert len(repo.get(mid)['match']['players']) == 10
    assert not calls and not repo.has_analysis_input(mid)
    pipeline.process(mid)  # polling/duplicate scheduling must not bypass setup
    assert not calls
    pipeline.select_player(mid, roster[0]['id'], focus='utility', language='pl', run_async=False)
    assert len(calls) == 1
    assert repo.get(mid)['status'] == MatchStatus.complete
    findings = repo.analysis.findings(mid, roster[0]['id'])
    assert findings
    assert all(f.detector in ('unused_utility', 'team_flash') or f.template in ('good_plays.flash_assist', 'good_plays.utility_damage') for f in findings)
    assert repo.review_options(mid) == {'playerId': roster[0]['id'], 'focus': 'utility', 'language': 'pl'}
    restored = MatchRepository()
    assert restored.get(mid)['match']['reviewFocus'] == 'utility'
    assert restored.get(mid)['match']['selectedPlayerId'] == roster[0]['id']


def test_pending_setup_survives_restart_and_rejects_another_player(setup_match):
    repo, pipeline, mid, roster, calls = setup_match
    pipeline.process(mid)
    restored = MatchRepository()
    assert restored.get(mid)['status'] == MatchStatus.awaiting_setup
    assert restored.get(mid)['match']['players'] == roster
    with pytest.raises(mod.PlayerSelectionError, match='not in this match'):
        pipeline.select_player(mid, '123', run_async=False)
    assert not calls and not repo.review_options(mid)


def test_confirmation_is_durable_before_background_parse_starts(setup_match, monkeypatch):
    repo, pipeline, mid, roster, calls = setup_match
    pipeline.process(mid)
    pending = []
    monkeypatch.setattr(pipeline, 'enqueue', lambda mid: pending.append(mid))
    pipeline.select_player(mid, roster[-1]['id'], focus='teamwork')
    assert pending == [mid] and not calls
    assert MatchRepository().get(mid)['status'] == MatchStatus.ready_to_parse
    with pytest.raises(mod.PlayerSelectionError):
        pipeline.select_player(mid, roster[0]['id'])
    assert repo.review_options(mid)['playerId'] == roster[-1]['id']


def test_score_is_the_coached_players_rounds_and_heals_stale_records(setup_match):
    # 23 Nov 2026: match.json kept the CT-starter's score (and, on older parses, the knife
    # round) while the Studio scorebug and Progress used the player's round stats.
    import json
    repo, pipeline, mid, roster, calls = setup_match
    pipeline.process(mid)
    player = roster[0]['id']  # starts on T, so the CT-first normalize score is reversed
    pipeline.select_player(mid, player, run_async=False)
    stats = repo.analysis.round_stats(mid, player)
    wins = sum(1 for s in stats if s.won)
    expected = f'{wins}–{len(stats) - wins}'
    assert repo.get(mid)['match']['score'] == expected
    meta = settings.matches_dir / mid / 'match.json'
    payload = json.loads(meta.read_text(encoding='utf-8'))
    payload['match']['score'] = '7–17'  # stale order / knife round from an older parse
    meta.write_text(json.dumps(payload), encoding='utf-8')
    assert MatchRepository().get(mid)['match']['score'] == expected


def test_unknown_focus_is_rejected_at_api_contract():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        PlayerSelectRequest(playerId='123', focus='whole-team')


@pytest.mark.parametrize('focus,excluded', [('shooting', {'unused_utility', 'team_flash', 'untraded_death'}), ('teamwork', {'unused_utility', 'shot_while_moving', 'opening_duel'})])
def test_other_focuses_keep_only_relevant_findings(setup_match, focus, excluded):
    repo, pipeline, mid, roster, calls = setup_match
    pipeline.process(mid)
    pipeline.select_player(mid, roster[0]['id'], focus=focus, run_async=False)
    findings = repo.analysis.findings(mid, roster[0]['id'])
    assert findings and not ({f.detector for f in findings} & excluded)
    assert repo.analysis.moments(mid, roster[0]['id'])
