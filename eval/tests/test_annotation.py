"""Label workflow tests: real persistence and HTTP; synthetic telemetry fixtures."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'apps' / 'api'))
from app.annotation.server import create_app
from app.annotation.store import Store, Conflict
from app.annotation.jobs import Jobs
from app.models.annotation import ReviewSave, Provenance

DEMO = 'demo-' + 'a' * 64
PLAYER = '76561198000000001'
HEADERS = {'X-Annotation-Request': '1'}


def seed(store):
    store.register({'id': DEMO, 'map': 'de_ancient', 'filename': 'fixture.dem', 'sha256': 'a' * 64,
                    'players': [{'id': PLAYER, 'name': 'Selected player', 'team': 'CT'}]})
    rounds = [{'number': 1, 'id': 'r1', 'startTick': 640, 'endTick': 1280, 'durationSec': 10., 'side': 'CT', 'winner': 'T'},
              {'number': 2, 'id': 'r2', 'startTick': 1600, 'endTick': 2240, 'durationSec': 10., 'side': 'CT', 'winner': 'CT'}]
    store.add_snapshot(DEMO, PLAYER, {'id': 'frozen-snapshot', 'rounds': rounds, 'warnings': [],
                                     'policy': {'detectors': ['untraded_death']},
                                     'findings': [{'id': 'F1', 'round': 1, 'detector': 'untraded_death', 't': 5., 'evidence': {}}]})
    folder = store.root / 'matches' / DEMO
    (folder / 'rounds').mkdir(parents=True)
    for rnd in rounds:
        (folder / 'rounds' / f"r{rnd['number']}.json").write_text(json.dumps({**rnd, 'tickRate': 64, 'samples': [],
            'events': [{'id': 'kill-960', 'tick': 960, 't': 5., 'label': 'A kill', 'type': 'kill'}]}), encoding='utf-8')
    (folder / 'analysis.json').write_text(json.dumps({'rounds': rounds}), encoding='utf-8')


@pytest.fixture
def store(tmp_path):
    s = Store(tmp_path)
    seed(s)
    return s


@pytest.fixture
def client(store):
    with TestClient(create_app(store.root, run_worker=False)) as c:
        yield c


def path(rnd=1, labeller='pawel'):
    return f'/api/demos/{DEMO}/players/{PLAYER}/rounds/{rnd}?labeller={labeller}'


def complete(**changes):
    return ReviewSave(status='complete', fullRoundReviewed=True, independentComplete=True, **changes)


def test_restart_preserves_drafts_and_resume(store):
    saved = store.save(DEMO, PLAYER, 2, 'pawel', ReviewSave(notes='Zażółć gęślą jaźń'))
    reopened = Store(store.root)
    assert reopened.current(DEMO, PLAYER, 2, 'pawel')['notes'] == 'Zażółć gęślą jaźń'
    assert reopened.current(DEMO, PLAYER, 2, 'pawel')['revision'] == saved['revision']


def test_stale_tabs_rejected_and_original_retained(store):
    first = store.save(DEMO, PLAYER, 2, 'pawel', ReviewSave(notes='original'))
    second = store.save(DEMO, PLAYER, 2, 'pawel', ReviewSave(previousRevision=first['revision'], notes='second'))
    with pytest.raises(Conflict):
        store.save(DEMO, PLAYER, 2, 'pawel', ReviewSave(previousRevision=first['revision'], notes='stale'))
    assert store.current(DEMO, PLAYER, 2, 'pawel')['revision'] == second['revision']
    with store.connect() as con:
        assert con.execute('SELECT COUNT(*) FROM revisions').fetchone()[0] == 2


def test_concurrent_first_saves_only_one_wins(store):
    def write(note):
        try:
            return store.save(DEMO, PLAYER, 2, 'pawel', ReviewSave(notes=note))['revision']
        except Conflict:
            return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(write, ['tab-a', 'tab-b']))
    assert results.count('conflict') == 1


def test_independent_pass_is_frozen_and_candidates_hidden(client):
    assert client.get(path()).json()['candidates'] == []
    payload = {'notes': 'Independent observation', 'fullRoundReviewed': True, 'independentComplete': True}
    first = client.put(path(), json=payload, headers=HEADERS).json()
    assert len(client.get(path()).json()['candidates']) == 1
    payload.update(previousRevision=first['revision'], notes='Edited after reveal')
    edited = client.put(path(), json=payload, headers=HEADERS).json()
    assert edited['independentPass']['notes'] == 'Independent observation'
    payload.update(previousRevision=edited['revision'], independentComplete=False)
    assert client.put(path(), json=payload, headers=HEADERS).status_code == 409


def test_zero_candidate_round_can_complete_without_moments(store):
    record = store.save(DEMO, PLAYER, 2, 'pawel', complete())
    assert record['moments'] == []
    assert len(store.export('pawel')) == 1
    assert not store.export('aleksander')


@pytest.mark.parametrize('payload', [
    {'status': 'complete'},
    {'independentComplete': True},
    {'status': 'blocked'},
    {'status': 'excluded'},
    {'fullRoundReviewed': True, 'independentComplete': True, 'status': 'complete'},
    {'candidates': {'F1': {'verdict': 'correct'}}},
])
def test_invalid_completion_and_reveal_rejected(client, payload):
    assert client.put(path(), json=payload, headers=HEADERS).status_code == 422


def test_all_candidates_must_be_reviewed_and_unknown_ids_rejected(client):
    payload = {'status': 'complete', 'fullRoundReviewed': True, 'independentComplete': True,
               'candidates': {'F1': {'verdict': 'unsure', 'note': 'Missing visibility'}}}
    assert client.put(path(), json=payload, headers=HEADERS).status_code == 200
    payload['candidates']['invented'] = {'verdict': 'correct'}
    assert client.put(path(), json=payload, headers=HEADERS).status_code == 422


def moment(**changes):
    return {'id': 'human-1', 'start': 1., 'anchor': 5., 'end': 7., 'categories': ['teamwork'],
            'assessment': 'uncertain', 'facts': 'Untraded death', 'reason': 'Visibility unavailable',
            'unknown': 'POV', 'evidence': ['kill-960'], **changes}


def test_ticks_use_frozen_round_mapping(store):
    record = store.save(DEMO, PLAYER, 1, 'pawel', ReviewSave(moments=[moment()]))
    assert record['moments'][0]['ticks'] == {'start': 704, 'anchor': 960, 'end': 1088}


@pytest.mark.parametrize('changes', [{'end': 11}, {'start': 6}, {'anchor': -1}, {'evidence': ['not-real']},
                                     {'missedDetector': 'dry_peek'}, {'categories': []}])
def test_invalid_moments_rejected(client, changes):
    assert client.put(path(), json={'moments': [moment(**changes)]}, headers=HEADERS).status_code == 422


def test_complete_mistake_requires_alternative(client):
    payload = {'status': 'complete', 'fullRoundReviewed': True, 'independentComplete': True,
               'candidates': {'F1': {'verdict': 'correct'}}, 'moments': [moment(assessment='mistake')]}
    assert client.put(path(), json=payload, headers=HEADERS).status_code == 422
    payload['moments'][0]['alternative'] = 'Wait for the teammate before committing.'
    assert client.put(path(), json=payload, headers=HEADERS).status_code == 200


def test_latest_completed_export_does_not_count_autosaves_or_other_raters(store):
    one = store.save(DEMO, PLAYER, 2, 'pawel', complete())
    store.save(DEMO, PLAYER, 2, 'pawel', complete(previousRevision=one['revision'], notes='correction'))
    store.save(DEMO, PLAYER, 2, 'aleksander', complete())
    assert len(store.export('pawel')) == 1
    assert store.export('pawel')[0]['notes'] == 'correction'


def test_training_export_gates_and_partition_freeze(store):
    store.set_provenance(DEMO, Provenance(split='test', sourceMatchId='faceit:one'))
    store.save(DEMO, PLAYER, 2, 'pawel', complete())
    assert store.export('pawel', training=True) == []
    with pytest.raises(Conflict):
        store.set_provenance(DEMO, Provenance(split='train'))
    with pytest.raises(Conflict):
        store.set_provenance(DEMO, Provenance(split='test', sourceMatchId='different'))


def test_training_permission_required(store):
    store.set_provenance(DEMO, Provenance(split='train'))
    store.save(DEMO, PLAYER, 2, 'pawel', complete())
    assert not store.export('pawel', training=True)
    store.set_provenance(DEMO, Provenance(split='train', trainingPermitted=True))
    assert len(store.export('pawel', training=True)) == 1


def test_multiple_recordings_cannot_have_conflicting_split(store):
    other = 'demo-' + 'b' * 64
    store.register({'id': other})
    store.set_provenance(DEMO, Provenance(sourceMatchId='faceit:one', split='train'))
    with pytest.raises(Conflict):
        store.set_provenance(other, Provenance(sourceMatchId='faceit:one', split='test'))


def test_http_origin_host_and_filename_controls(client):
    assert client.put(path(), json={}).status_code == 403
    assert client.put(path(), json={}, headers={**HEADERS, 'Origin': 'https://evil.example'}).status_code == 403
    assert client.get('/health', headers={'Host': 'evil.example'}).status_code == 400
    assert client.post('/api/import', content=b'x', headers={**HEADERS, 'X-Filename': '../a.dem'}).status_code == 400
    assert client.post('/api/import', content=b'x', headers={**HEADERS, 'X-Filename': 'a.zip'}).status_code == 400
    assert client.get(path(labeller='../other')).status_code in (404, 422)


def test_upload_size_and_empty_limits(client, monkeypatch):
    monkeypatch.setenv('RR_ANNOTATION_MAX_UPLOAD_MB', '0')
    assert client.post('/api/import', content=b'x', headers={**HEADERS, 'X-Filename': 'a.dem'}).status_code == 413
    assert client.post('/api/import', content=b'', headers={**HEADERS, 'X-Filename': 'a.dem'}).status_code == 400


def test_roster_choice_required_before_parse(client, store):
    response = client.post(f'/api/demos/{DEMO}/select', json={'playerId': '123'}, headers=HEADERS)
    assert response.status_code == 422
    assert store.jobs() == []
    response = client.post(f'/api/demos/{DEMO}/select', json={'playerId': PLAYER}, headers=HEADERS)
    assert response.json()['state'] == 'complete'  # Existing snapshot reused, no new parse.
    assert store.jobs() == []


def test_corrupt_demo_fails_in_isolated_process_and_queue_can_retry(tmp_path):
    store = Store(tmp_path)
    (store.root / 'uploads' / 'bad').write_bytes(b'not a demo')
    jobs = Jobs(store)
    job = jobs.submit('inspect', {'filename': 'broken.dem', 'upload': 'bad'})
    with pytest.raises(RuntimeError, match='not a CS2 demo'):
        jobs.execute(job)
    assert store.demos() == []
    store.job_state(job['id'], 'failed', error='bad demo')
    assert jobs.retry(job['id'])['state'] == 'queued'


def test_workspace_lock_prevents_two_servers_and_recovers_after_close(tmp_path):
    store = Store(tmp_path)
    first, second = Jobs(store), Jobs(store)
    first.start()
    try:
        with pytest.raises(RuntimeError, match='already has'):
            second.start()
    finally:
        first.close()
    third = Jobs(store)
    third.start()
    third.close()


def test_cancel_and_restart_recovery(tmp_path):
    store = Store(tmp_path)
    jobs = Jobs(store)
    job = jobs.submit('inspect', {'filename': 'pending.dem', 'upload': 'pending'})
    assert jobs.cancel(job['id'])['state'] == 'cancelled'
    interrupted = uuid.uuid4().hex
    store.add_job(interrupted, 'parse', {'demo': 'missing', 'player': PLAYER})
    store.job_state(interrupted, 'running')
    jobs.start()
    try:
        assert store.job(interrupted)['state'] == 'failed'
        assert 'Interrupted' in store.job(interrupted)['error']
    finally:
        jobs.close()


def test_export_api_and_safe_text_assets(client, store):
    store.save(DEMO, PLAYER, 2, 'pawel', complete(notes='<script>alert(1)</script>'))
    response = client.get('/api/export?labeller=pawel')
    assert response.headers['content-disposition'] == 'attachment; filename="labels-pawel.jsonl"'
    assert json.loads(response.text)['notes'] == '<script>alert(1)</script>'
    assert client.get('/').status_code == 200
    assert 'frame-ancestors' in client.get('/').headers['content-security-policy']
    assert client.get('/static/app.js').status_code == 200


def test_plain_and_zstd_share_canonical_identity_with_normal_frame_window(tmp_path, monkeypatch):
    import zstandard
    from app.annotation.worker import inspect
    import app.processing.parse_demo as parser
    monkeypatch.setattr(parser, 'inspect_demo_roster', lambda _path: ('de_ancient', [{'id': PLAYER, 'name': 'Fixture'}]))
    store = Store(tmp_path)
    content = b'PBDEMS2\0' + bytes(range(256)) * 8192
    compressed = zstandard.ZstdCompressor().compress(content)
    assert zstandard.get_frame_parameters(compressed).window_size > 128 * 1024
    (store.root / 'uploads' / 'plain').write_bytes(content)
    (store.root / 'uploads' / 'compressed').write_bytes(compressed)
    work = store.root / 'jobs' / 'inspect'
    work.mkdir()
    plain = inspect(store.root, {'upload': 'plain', 'filename': 'a.dem'}, work)
    packed = inspect(store.root, {'upload': 'compressed', 'filename': 'a.dem.zst'}, work)
    assert plain['id'] == packed['id']
    assert len(list((store.root / 'matches').iterdir())) == 1
    assert (store.root / 'matches' / plain['id'] / 'source.dem').read_bytes() == content
