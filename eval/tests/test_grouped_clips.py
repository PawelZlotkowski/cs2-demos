"""One selected-player play, one MP4/review, all original detector evidence."""
import hashlib
import json

import pytest

from test_annotation import client, store, DEMO, PLAYER, HEADERS
from test_annotation_batches import batch, items, ready
from test_clip_export import ready_with_file, probe
from app.annotation.batches import Batches, BatchRequest
from app.annotation.clip_export import export_clips
from app.annotation.grouping import group_moments
from app.annotation.store import Store, encode
from app.annotation.transfer import export_notes, import_notes, validate_notes
from app.models.annotation import ClipManifest


def four_findings(store):
    snapshot = store.snapshot(DEMO, PLAYER)
    snapshot['findings'] += [dict(id=f'F{i}', round=1, t=5+i/2,
        detector='unused_utility', evidence={'grenadeList':'flashbang'}) for i in (2, 3, 4)]
    with store.connect() as con:
        con.execute('UPDATE snapshots SET payload=?', (encode(snapshot),))


def test_four_remarks_are_one_recording_and_one_resumable_note(client, store, tmp_path):
    four_findings(store)
    current = batch(client, before=2, after=2)
    assert current['total'] == 1
    [clip] = items(client, current['id'])
    assert (clip['start'], clip['end'], clip['reviewKey']) == (3, 9, 'F1+F2+F3+F4')
    assert [f['id'] for f in clip['findings']] == ['F1','F2','F3','F4']
    [job] = client.post('/api/recordings/claim-session', headers=HEADERS, json={}).json()
    assert job['player'] == PLAYER and job['id'] == clip['id']
    assert 'finding' not in job and 'findings' not in job
    ready(store, clip['id'])
    route = f"/api/clip-batches/{current['id']}/clips/{clip['id']}/label?labeller=qa"
    note = 'First observation.\nSecond observation.\nThird observation.\nFourth observation.'
    saved = client.put(route, headers=HEADERS, json={'status':'complete','inputMode':'note','notes':note}).json()
    assert saved['footage']['findings'] == clip['findings']
    assert items(client,current['id'])[0]['label']['notes'] == note
    assert client.get('/api/next-ready-clip?labeller=qa').json() is None
    assert client.get(f"/api/clip-batches/{current['id']}?labeller=qa").json()['completed'] == 1
    assert len(client.get('/api/clip-labels/export?labeller=qa').text.splitlines()) == 1
    # A second PC imports the whole play once, and can retrieve the non-lead signal.
    client.put(f'/api/demos/{DEMO}/provenance', headers=HEADERS, json={'split':'train','trainingPermitted':True})
    export_notes(store, tmp_path/'notes.json', 'qa')
    target = Store(tmp_path/'other')
    assert import_notes(target,tmp_path/'notes.json')['imported'] == 1
    assert import_notes(target,tmp_path/'notes.json')['unchanged'] == 1
    with target.connect() as con:
        assert con.execute('SELECT finding FROM clip_labels').fetchone()[0] == 'F1+F2+F3+F4'
    examples = client.post('/api/coach-examples', headers=HEADERS, json={
        'demoHash':'b'*64,'map':'de_ancient','detectors':['unused_utility'],'language':'en'}).json()
    assert len(examples) == 1 and examples[0]['note'] == note


def test_group_manifest_preserves_every_finding_and_rejects_wrong_context(client, store, tmp_path):
    four_findings(store)
    current = batch(client, before=2, after=2)
    [clip] = items(client,current['id'])
    ready_with_file(store, clip['id'])
    out = tmp_path/'export'
    assert export_clips(store,out,[current['id']],probe=probe)['clips'] == 1
    manifest = json.loads((out/'manifest.json').read_text('utf-8'))
    assert len(ClipManifest.model_validate(manifest).clips[0].footage.findings) == 4
    for field,value in [('round',2), ('t',99), ('id','F1')]:
        invalid = json.loads(encode(manifest))
        invalid['clips'][0]['footage']['findings'][1][field] = value
        with pytest.raises(ValueError):
            ClipManifest.model_validate(invalid)


def test_old_batch_and_its_label_are_preserved_when_grouping_is_introduced(client, store):
    four_findings(store)
    snapshot = store.snapshot(DEMO, PLAYER)
    old = hashlib.sha256(encode([DEMO,PLAYER,snapshot['id'],10.,5.]).encode()).hexdigest()[:32]
    with store.connect() as con:
        con.execute('INSERT INTO clip_batches VALUES(?,?,?,?,?,0)', (old,DEMO,PLAYER,snapshot['id'],encode({})))
        con.execute('INSERT INTO clip_labels(demo,player,snapshot,finding,labeller,payload,created) VALUES(?,?,?,?,?,?,?)',
                    (DEMO,PLAYER,snapshot['id'],'F1','qa',encode({'status':'complete','notes':'old individual note'}),'now'))
    new = batch(client)
    assert new['id'] != old and Batches(store).get(old)['paused']
    assert items(client,new['id'])[0]['label'] is None
    with store.connect() as con:
        assert con.execute('SELECT COUNT(*) FROM clip_labels').fetchone()[0] == 1


def test_grouping_is_scoped_to_the_selected_player(client, store):
    four_findings(store)
    first = batch(client)
    other = '76561198000000002'
    snapshot = store.snapshot(DEMO,PLAYER)
    snapshot.update(id='other-snapshot',findings=[dict(id='F1',round=1,t=4.,detector='untraded_death',evidence={})])
    store.add_snapshot(DEMO,other,snapshot)
    second = Batches(store).create(DEMO,other,BatchRequest())
    a,b = items(client,first['id'])[0], items(client,second['id'])[0]
    assert (a['player'], b['player']) == (PLAYER, other)
    assert a['id'] != b['id'] and a['findingCount'] == 4 and b['findingCount'] == 1


def test_overlap_boundaries_long_windows_and_separate_rounds():
    def moment(n,start,end,rnd=1):
        return dict(start=start,end=end,startTick=int(start*64),endTick=int(end*64),
                    finding=dict(id=f'F{n}',round=rnd,t=(start+end)/2))
    groups = group_moments([moment(1,0,20),moment(2,15,35),moment(3,30,50),moment(4,45,65),
                           moment(5,80,90),moment(6,0,20,2)])
    assert [g['reviewKey'] for g in groups] == ['F1+F2+F3','F4','F5','F6']
    assert all(g['end']-g['start']<=60 for g in groups)
    [long] = group_moments([moment(1,0,100),moment(2,40,50)])
    assert long['end']==100 and long['reviewKey']=='F1+F2'


def test_portable_notes_reject_forged_group_keys(client,store,tmp_path):
    four_findings(store)
    current=batch(client); [clip]=items(client,current['id']); ready(store,clip['id'])
    route=f"/api/clip-batches/{current['id']}/clips/{clip['id']}/label?labeller=qa"
    client.put(route,headers=HEADERS,json={'status':'complete','inputMode':'note','notes':'Several observations.'}).raise_for_status()
    export_notes(store,tmp_path/'notes.json','qa')
    payload=json.loads((tmp_path/'notes.json').read_text('utf-8'))
    payload['labels'][0]['label']['footage']['reviewKey']='F1'
    with pytest.raises(ValueError,match='review key'):
        validate_notes(payload)
