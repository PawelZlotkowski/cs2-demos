"""Selected-player batch capture and candidate-first label persistence."""
from concurrent.futures import ThreadPoolExecutor
import json

import pytest

from test_annotation import client, store, DEMO, PLAYER, HEADERS, path
from app.annotation.batches import Batches, BatchRequest
from app.annotation.jobs import Jobs
from app.annotation.store import Store, encode

BASE = f'/api/demos/{DEMO}/players/{PLAYER}/clip-batch'


def batch(client, **kwargs):
    response = client.post(BASE, headers=HEADERS, json=kwargs)
    assert response.status_code == 202, response.text
    return response.json()


def items(client, identity, labeller='qa'):
    response = client.post(f'/api/clip-batches/{identity}/review?labeller={labeller}', headers=HEADERS)
    assert response.status_code == 200, response.text
    return response.json()


def ready(store, clip_id):
    with store.connect() as con:
        row = con.execute('SELECT metadata FROM footage WHERE id=?', (clip_id,)).fetchone()
        data = json.loads(row['metadata'])
        data.update(duration=data['end']-data['start'], width=1280, height=720, fps='30/1',
                    sha256='b'*64, alignmentConfirmed=True)
        con.execute("UPDATE footage SET state='ready',metadata=? WHERE id=?", (encode(data), clip_id))


def test_batch_contains_all_findings_with_context_and_no_duplicates(client, store):
    snapshot = store.snapshot(DEMO, PLAYER)
    snapshot['findings'].append({'id': 'F2', 'round': 2, 't': 8., 'detector': 'untraded_death', 'evidence': {}})
    with store.connect() as con:
        con.execute('UPDATE snapshots SET payload=?', (encode(snapshot),))
    a = batch(client, before=3, after=4)
    b = batch(client, before=3, after=4)
    assert a['id'] == b['id'] and b['total'] == 2 and b['counts'] == {'queued': 2}
    clips = items(client, a['id'])
    assert [(c['round'], c['start'], c['end']) for c in clips] == [(1, 2, 9), (2, 5, 10)]
    assert all(c['player'] == PLAYER for c in clips)
    assert client.post(BASE.replace(PLAYER, '999'), headers=HEADERS, json={}).status_code == 409
    assert Batches(Store(store.root)).summary(a['id'])['total'] == 2


def test_concurrent_batch_creation_is_idempotent(store):
    def make(_):
        return Batches(store).create(DEMO, PLAYER, BatchRequest())['id']
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert len(set(pool.map(make, range(2)))) == 1
    with store.connect() as con:
        assert con.execute('SELECT COUNT(*) FROM footage').fetchone()[0] == 1


def test_session_claim_is_atomic_scoped_and_renewable(client, store):
    import time
    snapshot = store.snapshot(DEMO, PLAYER)
    snapshot['findings'].append({'id': 'F2', 'round': 2, 't': 8., 'detector': 'untraded_death', 'evidence': {}})
    with store.connect() as con:
        con.execute('UPDATE snapshots SET payload=?', (encode(snapshot),))
    old = batch(client, before=2, after=2)
    current = batch(client, before=3, after=3)  # Pauses the previous batch.
    jobs = client.post('/api/recordings/claim-session', headers=HEADERS, json={'limit':128}).json()
    assert len(jobs) == 2 and {j['batchId'] for j in jobs} == {current['id']}
    assert len({j['lease'] for j in jobs}) == 1
    assert all(j['sessionSize'] == 2 and 'finding' not in j for j in jobs)
    assert client.post('/api/recordings/claim', headers=HEADERS).json() is None
    assert client.post('/api/recordings/claim-session', headers=HEADERS, json={}).json() is None
    lease = jobs[0]['lease']
    progress = '/api/recordings/session/progress?lease='+lease
    assert client.post(progress, headers=HEADERS, json={'stage':'capturing', 'captureWindow':1, 'captureWindows':2}).status_code == 200
    queue = client.get(f"/api/clip-batches/{current['id']}/queue").json()
    assert all(j['captureWindow'] == 1 and j['captureWindows'] == 2 for j in queue)
    assert client.post(progress+'wrong', headers=HEADERS, json={'stage':'encoding'}).status_code == 409
    assert client.post('/api/recordings/session/renew?lease=wrong', headers=HEADERS).status_code == 409
    with store.connect() as con:
        con.execute('UPDATE footage SET expires=? WHERE lease=?', (time.time()+30, lease))
    assert client.post('/api/recordings/session/renew?lease='+lease, headers=HEADERS).status_code == 200
    with store.connect() as con:
        assert con.execute('SELECT MIN(expires) FROM footage WHERE lease=?', (lease,)).fetchone()[0] > time.time()+1700
        con.execute('UPDATE footage SET expires=? WHERE lease=?', (time.time()-1, lease))
    assert client.post('/api/recordings/session/renew?lease='+lease, headers=HEADERS).status_code == 409
    assert client.get(f"/api/clip-batches/{old['id']}/queue").json()[0]['state'] == 'queued'


def test_session_limit_pause_and_ready_preservation(client, store):
    snapshot = store.snapshot(DEMO, PLAYER)
    snapshot['findings'] += [dict(id='F'+str(n), round=1, t=5., detector='untraded_death', evidence={}) for n in (2, 3)]
    with store.connect() as con:
        con.execute('UPDATE snapshots SET payload=?', (encode(snapshot),))
    current = batch(client)
    queue = client.get(f"/api/clip-batches/{current['id']}/queue").json()
    ready(store, queue[0]['id'])
    jobs = client.post('/api/recordings/claim-session', headers=HEADERS, json={'limit':1}).json()
    assert len(jobs) == 1 and jobs[0]['id'] != queue[0]['id']
    client.put(f"/api/clip-batches/{current['id']}", headers=HEADERS, json={'paused':True})
    assert client.post('/api/recordings/session/renew?lease='+jobs[0]['lease'], headers=HEADERS).status_code == 200
    client.post(f"/api/recordings/{jobs[0]['id']}/fail?lease={jobs[0]['lease']}", headers=HEADERS, json={'error':'QA'})
    assert client.post('/api/recordings/claim-session', headers=HEADERS, json={}).json() is None
    assert client.post('/api/recordings/claim-session', headers=HEADERS, json={'limit':129}).status_code == 422
    assert client.post('/api/recordings/claim-session', json={}).status_code == 403


def test_pause_resume_context_changes_and_existing_batch_selection(client):
    a = batch(client, before=2, after=2)
    control = f"/api/clip-batches/{a['id']}"
    assert client.put(control, headers=HEADERS, json={'paused': True}).json()['paused']
    assert client.post('/api/recordings/claim', headers=HEADERS).json() is None
    batch(client, before=2, after=2)  # Reopen does not silently unpause.
    assert client.get(control+'?labeller=qa').json()['paused']
    b = batch(client, before=3, after=3)
    assert b['id'] != a['id']
    claimed = client.post('/api/recordings/claim', headers=HEADERS).json()
    assert claimed['batchId'] == b['id']
    batch(client, before=2, after=2)
    assert client.get(BASE+'?labeller=qa').json()['id'] == a['id']
    assert client.put(control, headers=HEADERS, json={'paused': False}).json()['paused'] is False


def test_summary_does_not_reveal_candidates_but_review_records_exposure(client):
    a = batch(client)
    assert 'findings' not in a and 'items' not in a
    assert not client.get(path(labeller='qa')).json()['candidateExposed']
    assert 'finding' not in client.get(BASE.replace('/clip-batch', '/rounds/1/footage')).json()[0]
    items(client, a['id'])
    assert client.get(path(labeller='qa')).json()['candidateExposed']
    assert not client.get(path(labeller='other')).json()['candidateExposed']
    saved = client.put(path(labeller='qa'), headers=HEADERS, json={'notes':'after seeing candidates'}).json()
    assert saved['reviewMode'] == 'candidate-exposed'


def test_labels_are_separate_versioned_and_resume_per_labeller(client, store):
    a = batch(client)
    c = items(client, a['id'])[0]
    route = f"/api/clip-batches/{a['id']}/clips/{c['id']}/label?labeller=qa"
    payload = {'status': 'complete', 'verdict': 'wrong', 'assessment': 'neutral', 'notes': 'Technical QA'}
    assert client.put(route, headers=HEADERS, json=payload).status_code == 409
    ready(store, c['id'])
    assert client.put(route, headers=HEADERS, json={'status':'complete'}).status_code == 422
    saved = client.put(route, headers=HEADERS, json=payload).json()
    assert saved['reviewMode'] == 'candidate-first' and saved['footage']['sha256'] == 'b'*64
    assert client.put(route, headers=HEADERS, json=payload).status_code == 409
    assert items(client, a['id'])[0]['label']['notes'] == 'Technical QA'
    assert items(client, a['id'], 'other')[0]['label'] is None
    assert client.get(path(labeller='qa')).json()['review'] is None
    assert client.get('/api/export?labeller=qa').text == ''
    assert client.get(BASE+'?labeller=qa').json()['completed'] == 1
    assert client.get('/api/clip-labels/export?labeller=qa&training=true').text == ''
    exported = json.loads(client.get('/api/clip-labels/export?labeller=qa').text)
    assert exported['finding']['id'] == c['finding']['id']
    assert client.put(route, headers=HEADERS, json={**payload,'previousRevision':saved['revision'],'status':'draft'}).status_code == 200
    assert client.get('/api/clip-labels/export?labeller=qa').text == ''


def test_completion_names_only_missing_steps_and_confirmation_unlocks_save(client, store):
    a = batch(client)
    c = items(client, a['id'])[0]
    ready(store, c['id'])
    with store.connect() as con:
        row = con.execute('SELECT metadata FROM footage WHERE id=?', (c['id'],)).fetchone()
        metadata = json.loads(row['metadata'])
        metadata['alignmentConfirmed'] = False
        con.execute('UPDATE footage SET metadata=? WHERE id=?', (encode(metadata), c['id']))
    route = f"/api/clip-batches/{a['id']}/clips/{c['id']}/label?labeller=qa"
    payload = {'status':'complete', 'verdict':'wrong', 'assessment':'uncertain', 'notes':'Synthetic regression fixture'}
    response = client.put(route, headers=HEADERS, json=payload)
    assert response.status_code == 422
    assert 'step 1' in response.json()['detail'] and 'step 2' not in response.json()['detail']
    assert client.post(f"/api/footage/{c['id']}/confirm", headers=HEADERS).status_code == 200
    response = client.put(route, headers=HEADERS, json={**payload, 'assessment':None})
    assert response.status_code == 422 and 'step 3' in response.json()['detail'] and 'step 1' not in response.json()['detail']
    response = client.put(route, headers=HEADERS, json=payload)
    assert response.status_code == 200
    assert response.json()['status'] == 'complete' and response.json()['notes'] == payload['notes']


def test_completed_clip_requires_alignment_and_freezes_assigned_split(client, store):
    client.put(f'/api/demos/{DEMO}/provenance', headers=HEADERS, json={'split':'train','trainingPermitted':True})
    a = batch(client); c = items(client,a['id'])[0]; ready(store,c['id'])
    route=f"/api/clip-batches/{a['id']}/clips/{c['id']}/label?labeller=qa"
    payload={'status':'complete','verdict':'correct','assessment':'mistake'}
    assert client.put(route,headers=HEADERS,json=payload).status_code==200
    assert client.get('/api/clip-labels/export?labeller=qa&training=true').text
    assert client.put(f'/api/demos/{DEMO}/provenance',headers=HEADERS,json={'split':'test'}).status_code==409


def test_failed_retry_does_not_reset_ready_clips(client, store):
    a=batch(client); c=items(client,a['id'])[0]
    claimed=client.post('/api/recordings/claim',headers=HEADERS).json()
    client.post(f"/api/recordings/{c['id']}/fail?lease={claimed['lease']}",headers=HEADERS,json={'error':'Steam closed'})
    assert client.post(f"/api/clip-batches/{a['id']}/retry-failed",headers=HEADERS).json()['counts']=={'queued':1}
    ready(store,c['id'])
    assert client.post(f"/api/clip-batches/{a['id']}/retry-failed",headers=HEADERS).json()['counts']=={'ready':1}


def test_player_prepare_can_automatically_queue_existing_snapshot(client):
    response=client.post(f'/api/demos/{DEMO}/select',headers=HEADERS,json={'playerId':PLAYER,'autoRecord':True,'before':2,'after':3})
    assert response.status_code==202
    result=client.get(BASE+'?labeller=qa').json()
    assert result['total']==1 and (result['before'],result['after'])==(2,3)


def test_new_parse_queues_after_snapshot_even_if_browser_closed(store, monkeypatch):
    snapshot=store.snapshot(DEMO,PLAYER)
    with store.connect() as con:
        con.execute('DELETE FROM snapshots')
    jobs=Jobs(store)
    job=jobs.submit('parse',{'demo':DEMO,'player':PLAYER,'autoRecord':True,'before':2,'after':3})
    class Process:
        returncode=0
        def __init__(self,*args,**kwargs):
            (store.root/'jobs'/job['id']/'result.json').write_text(encode(snapshot),encoding='utf-8')
        def poll(self): return 0
    monkeypatch.setattr('app.annotation.jobs.subprocess.Popen',Process)
    jobs.execute(job)
    assert store.job(job['id'])['state']=='complete'
    with store.connect() as con:
        assert con.execute('SELECT COUNT(*) FROM footage').fetchone()[0]==1


def test_empty_batch_and_request_protections(client, store):
    snapshot=store.snapshot(DEMO,PLAYER);snapshot['findings']=[]
    with store.connect() as con:
        con.execute('UPDATE snapshots SET payload=?',(encode(snapshot),))
    assert batch(client)['total']==0
    assert client.post(BASE,headers=HEADERS,json={'before':0,'after':0}).status_code==422
    assert client.post(BASE,json={}).status_code==403


def test_queue_visible_before_review_without_exposing_findings(client):
    a = batch(client)
    queue = client.get(f"/api/clip-batches/{a['id']}/queue").json()
    assert len(queue) == a['total']
    assert queue[0]['state'] == 'queued'
    assert queue[0]['start'] < queue[0]['end']
    assert 'finding' not in queue[0] and 'lease' not in queue[0]
    assert not client.get(path(labeller='qa')).json()['candidateExposed']


def test_recorder_presence_and_leased_stage_updates(client, store):
    assert client.get('/api/recordings/status').json()['connected'] is False
    a = batch(client)
    job = client.post('/api/recordings/claim', headers=HEADERS).json()
    route = f"/api/recordings/{job['id']}/progress?lease={job['lease']}"
    assert client.post(route, headers=HEADERS, json={'stage':'analysing'}).status_code == 200
    status = client.get('/api/recordings/status').json()
    assert status['connected'] and status['active']['stage'] == 'analysing'
    assert 'lease' not in status['active'] and 'finding' not in status['active']
    assert client.post(route.replace(job['lease'], 'wrong'), headers=HEADERS, json={'stage':'uploading'}).status_code == 409
    assert client.post(route, headers=HEADERS, json={'stage':'invented'}).status_code == 422
    with store.connect() as con:
        con.execute('UPDATE recorder_status SET seen=seen-30')
    assert client.get('/api/recordings/status').json()['connected'] is False
    assert client.post('/api/recordings/heartbeat', headers=HEADERS).status_code == 200
    assert client.get('/api/recordings/status').json()['connected'] is True
    assert client.get(f"/api/clip-batches/{a['id']}/queue").json()[0]['stage'] == 'analysing'
