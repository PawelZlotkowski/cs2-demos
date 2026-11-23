"""Selection usefulness, per-signal truth and footage quality are distinct labels."""
import json

import pytest

from test_annotation import client, store, DEMO, PLAYER, HEADERS
from test_annotation_batches import batch, items, ready
from test_grouped_clips import four_findings
from app.annotation.store import Store
from app.annotation.store import encode
from app.annotation.transfer import export_notes, import_notes


def review_route(client, store, grouped=False):
    if grouped:
        four_findings(store)
    current = batch(client, before=2, after=2)
    [clip] = items(client, current['id'])
    ready(store, clip['id'])
    return f"/api/clip-batches/{current['id']}/clips/{clip['id']}/label?labeller=qa"


def test_group_preserves_mixed_ratings_and_selection_feedback(client, store, tmp_path):
    route = review_route(client, store, True)
    ratings = [{'findingId': f'F{i}', 'verdict': 'wrong' if i == 2 else 'correct'} for i in range(1, 5)]
    payload = dict(status='complete', inputMode='structured', signalReviews=ratings,
                   footageStatus='verified', confirmFootage=True, assessment='neutral',
                   selectionVerdict='not_useful', notes='The action is normal; a different moment would teach more.')
    response = client.put(route, headers=HEADERS, json=payload)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved['signalReviews'] == ratings
    assert saved['verdict'] is None and saved['assessment'] == 'neutral'
    assert saved['selectionVerdict'] == 'not_useful'
    export_notes(store, tmp_path/'notes.json', 'qa')
    receiver = Store(tmp_path/'receiver')
    assert import_notes(receiver, tmp_path/'notes.json')['imported'] == 1
    with receiver.connect() as con:
        copied = json.loads(con.execute('SELECT payload FROM clip_labels').fetchone()[0])
    assert copied['signalReviews'] == ratings and copied['selectionVerdict'] == 'not_useful'


@pytest.mark.parametrize('ratings', [[], [{'findingId':'F1','verdict':'correct'}]])
def test_shared_verdict_cannot_complete_structured_group(client, store, ratings):
    route = review_route(client, store, True)
    response = client.put(route, headers=HEADERS, json=dict(status='complete',verdict='correct',
                          assessment='good',signalReviews=ratings))
    assert response.status_code == 422 and 'each detection' in response.text


@pytest.mark.parametrize('ratings', [
    [{'findingId':'F99','verdict':'wrong'}],
    [{'findingId':'F1','verdict':'wrong'}, {'findingId':'F1','verdict':'correct'}],
])
def test_reject_unknown_or_duplicate_signal(client, store, ratings):
    route = review_route(client, store)
    assert client.put(route, headers=HEADERS, json={'signalReviews':ratings}).status_code in (400, 422)


def test_footage_problem_returns_to_owner_but_cannot_train(client, store, tmp_path):
    route = review_route(client, store)
    client.put(f'/api/demos/{DEMO}/provenance',headers=HEADERS,json={'split':'train','trainingPermitted':True})
    response = client.put(route, headers=HEADERS, json=dict(status='complete', inputMode='note',
        footageStatus='wrong_player', selectionVerdict='unsure', notes='The view shows the opponent.', confirmFootage=True))
    assert response.status_code == 200, response.text
    assert response.json()['footage']['alignmentConfirmed'] is False
    assert client.get('/api/clip-labels/export?labeller=qa&training=true').text.strip() == ''
    export_notes(store, tmp_path/'notes.json', 'qa')
    assert import_notes(Store(tmp_path/'receiver'), tmp_path/'notes.json')['imported'] == 1


def test_footage_problem_cannot_assert_player_mistake(client, store):
    route = review_route(client, store)
    response = client.put(route, headers=HEADERS, json=dict(footageStatus='wrong_timing',
                         verdict='correct', assessment='mistake'))
    assert response.status_code == 422


def test_draft_with_footage_issue_can_be_exchanged(client, store, tmp_path):
    route = review_route(client, store)
    assert client.put(route, headers=HEADERS, json=dict(footageStatus='unplayable')).status_code == 200
    export_notes(store, tmp_path/'draft.json', 'qa')
    assert import_notes(Store(tmp_path/'receiver'), tmp_path/'draft.json')['imported'] == 1


def test_upgrade_blocks_old_candidates_without_erasing_notes(client, store):
    route = review_route(client, store)
    saved = client.put(route, headers=HEADERS, json={'notes':'Keep this draft.'}).json()
    snapshot = store.snapshot(DEMO, PLAYER)
    snapshot['version']['code'] = 'older-rules'
    with store.connect() as con:
        con.execute('UPDATE snapshots SET payload=?', (encode(snapshot),))
    assert client.put(route, headers=HEADERS, json={'previousRevision':saved['revision'],'notes':'Changed'}).status_code == 409
    assert client.post(route.split('/clips/')[0]+'/review?labeller=qa',headers=HEADERS).status_code == 409
    assert client.get('/api/next-ready-clip?labeller=qa').json() is None
    summary = client.get(route.split('/clips/')[0]+'?labeller=qa').json()
    assert summary['stale'] is True
    with store.connect() as con:
        assert json.loads(con.execute('SELECT payload FROM clip_labels').fetchone()[0])['notes'] == 'Keep this draft.'
