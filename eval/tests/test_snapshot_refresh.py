"""Reanalysis must not attach a human judgement to a changed ordinal finding."""
from copy import deepcopy
import json

import pytest

from eval.tests.test_annotation import DEMO, PLAYER, seed
from app.annotation.store import Store, Conflict
from app.models.annotation import ReviewSave


def test_refresh_preserves_history_and_rejects_stale_review(tmp_path):
    store = Store(tmp_path)
    seed(store)
    old = store.snapshot(DEMO, PLAYER)
    saved = store.save(DEMO, PLAYER, 2, 'reviewer', ReviewSave(
        status='complete', fullRoundReviewed=True, independentComplete=True, notes='Historical decision'))
    new = deepcopy(old)
    new['id'] = 'refreshed-snapshot'
    new['findings'][0]['id'] = 'F2'
    store.refresh_snapshot(DEMO, PLAYER, new, expected_id=old['id'])
    assert store.current(DEMO, PLAYER, 2, 'reviewer') is None
    assert store.progress(DEMO, PLAYER, 'reviewer') == {}
    assert store.export('reviewer')[0]['snapshotId'] == old['id']
    with store.connect() as con:
        archived = json.loads(con.execute('SELECT payload FROM snapshot_history').fetchone()[0])
        assert archived == old
        assert con.execute('SELECT COUNT(*) FROM revisions').fetchone()[0] == 1
    with pytest.raises(Conflict):
        store.save(DEMO, PLAYER, 2, 'reviewer', ReviewSave(previousRevision=saved['revision']))
    with pytest.raises(Conflict):
        store.refresh_snapshot(DEMO, PLAYER, new, expected_id=old['id'])
    with pytest.raises(ValueError):
        store.save(DEMO, PLAYER, 1, 'reviewer', ReviewSave(
            fullRoundReviewed=True, independentComplete=True, candidates={'F1': 'correct'}))
    store.save(DEMO, PLAYER, 2, 'reviewer', ReviewSave(
        status='complete', fullRoundReviewed=True, independentComplete=True, notes='New decision'))
    assert {r['snapshotId'] for r in store.export('reviewer')} == {old['id'], new['id']}


def test_refresh_rejects_reused_finding_ids(tmp_path):
    store = Store(tmp_path)
    seed(store)
    old = store.snapshot(DEMO, PLAYER)
    with pytest.raises(ValueError):
        store.refresh_snapshot(DEMO, PLAYER, {**old, 'id': 'new'}, expected_id=old['id'])
    assert store.snapshot(DEMO, PLAYER) == old


def test_first_save_from_stale_tab_and_old_batch_are_rejected(tmp_path):
    from app.annotation.batches import Batches, BatchRequest, ClipLabel
    from eval.tests.test_annotation_batches import ready
    store = Store(tmp_path); seed(store)
    batches = Batches(store); batch = batches.create(DEMO, PLAYER, BatchRequest())
    clip = batches.review(batch['id'], 'qa')[0]; ready(store, clip['id'])
    old = store.snapshot(DEMO, PLAYER)
    new = deepcopy(old); new['id'] = 'new'; new['findings'][0]['id'] = 'F2'
    store.refresh_snapshot(DEMO, PLAYER, new, expected_id=old['id'])
    with pytest.raises(Conflict, match='analysis changed'):
        store.save(DEMO, PLAYER, 2, 'new_review_person', ReviewSave(snapshotId=old['id'], notes='Stale first draft'))
    with pytest.raises(Conflict, match='older analysis'):
        batches.save(batch['id'], clip['id'], 'qa', ClipLabel(notes='Stale clip'))
    assert batches.get(batch['id'])['paused']
    with store.connect() as con:
        assert not con.execute('SELECT * FROM clip_selection').fetchall()


def test_select_refreshes_stale_rules_but_reuses_current_snapshot(tmp_path):
    from fastapi.testclient import TestClient
    from app.annotation.server import create_app
    from eval.tests.test_annotation import HEADERS
    store = Store(tmp_path); seed(store)
    with TestClient(create_app(tmp_path, run_worker=False)) as client:
        route = f'/api/demos/{DEMO}/select'
        assert client.post(route, headers=HEADERS, json={'playerId': PLAYER}).json()['state'] == 'complete'
        old = store.snapshot(DEMO, PLAYER); old['version']['code'] = 'older-rules'
        with store.connect() as con:
            con.execute('UPDATE snapshots SET payload=?', (json.dumps(old),))
        queued = client.post(route, headers=HEADERS, json={'playerId': PLAYER}).json()
        assert queued['state'] == 'queued' and queued['payload']['expectedSnapshot'] == old['id']
        assert client.post(route, headers=HEADERS, json={'playerId': PLAYER}).json()['id'] == queued['id']


def test_identical_reanalysis_keeps_ready_batch_and_labels(tmp_path):
    from app.annotation.batches import Batches, BatchRequest
    store = Store(tmp_path); seed(store)
    batch = Batches(store).create(DEMO, PLAYER, BatchRequest())
    old = store.snapshot(DEMO, PLAYER)
    saved = store.save(DEMO, PLAYER, 2, 'qa', ReviewSave(notes='Keep my work'))
    new = deepcopy(old); new['id'] = 'new'; new['findings'][0]['id'] = 'F2'
    new['version']['code'] = 'new-code-same-results'
    assert store.accept_reanalysis(DEMO, PLAYER, new, expected_id=old['id']) == old
    assert store.snapshot_is_current(DEMO, PLAYER, old, new['version'])
    assert store.current(DEMO, PLAYER, 2, 'qa')['revision'] == saved['revision']
    with store.connect() as con:
        assert con.execute('SELECT batch FROM clip_selection').fetchone()[0] == batch['id']
        assert con.execute('SELECT COUNT(*) FROM snapshot_history').fetchone()[0] == 0


def test_unchanged_reanalysis_compares_observations_independent_of_order(tmp_path):
    store = Store(tmp_path); seed(store)
    old = store.snapshot(DEMO, PLAYER)
    old['findings'].append({**old['findings'][0], 'id':'F2', 't':6.})
    with store.connect() as con:
        con.execute('UPDATE snapshots SET payload=?', (json.dumps(old),))
    new = deepcopy(old); new['id']='new'
    new['findings'].reverse()
    for i, f in enumerate(new['findings'], 3): f['id']=f'F{i}'
    assert store.accept_reanalysis(DEMO, PLAYER, new, expected_id=old['id']) == old
