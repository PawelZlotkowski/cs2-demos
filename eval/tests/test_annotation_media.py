"""Footage persistence, timing, queue ownership, invalid inputs and HTTP ranges."""
import json
from pathlib import Path
import shutil
import subprocess
import time

import pytest

from test_annotation import client, store, seed, DEMO, PLAYER, HEADERS, path
from app.annotation.media import ClipRequest, Media, probe_video
from app.annotation.media import validate_recording_duration
from app.annotation.store import Conflict, Store
from app.models.annotation import ReviewSave

BASE = f'/api/demos/{DEMO}/players/{PLAYER}/rounds/1/footage'


def test_context_clamps_to_round_and_uses_saved_ticks(client):
    response = client.post(BASE, headers=HEADERS, json={'anchor': 1, 'before': 10, 'after': 5})
    assert response.status_code == 202
    clip = response.json()
    assert (clip['start'], clip['end'], clip['startTick'], clip['endTick']) == (0, 6, 640, 1024)
    assert client.get(BASE).json()[0]['state'] == 'queued'
    assert 'lease' not in clip
    assert client.post(BASE, headers=HEADERS, json={'anchor': 9, 'before': 3, 'after': 10}).json()['end'] == 10


@pytest.mark.parametrize('body', [dict(anchor=11), dict(anchor=0, before=0, after=0),
                                dict(anchor=-1), dict(anchor=5, before=61)])
def test_invalid_context_rejected(client, body):
    assert client.post(BASE, headers=HEADERS, json=body).status_code == 422


def test_lease_exclusivity_expiry_and_retry(client, store):
    a = client.post(BASE, headers=HEADERS, json={'anchor': 5}).json()
    client.post(BASE, headers=HEADERS, json={'anchor': 6})
    claimed = client.post('/api/recordings/claim', headers=HEADERS).json()
    assert claimed['id'] == a['id']
    assert client.post('/api/recordings/claim', headers=HEADERS).json() is None
    route = f"/api/recordings/{a['id']}"
    assert client.post(route + '/fail?lease=wrong', headers=HEADERS, json={'error': 'failure'}).status_code == 409
    with store.connect() as con:
        con.execute('UPDATE footage SET expires=? WHERE id=?', (time.time()-1, a['id']))
    assert client.post(route + '/upload?lease='+claimed['lease'], headers=HEADERS, content=b'bad').status_code == 409
    assert client.post(route+'/retry', headers=HEADERS).json()['state'] == 'queued'
    assert client.post(route+'/retry', headers=HEADERS).status_code == 409


@pytest.fixture
def video(tmp_path):
    ffmpeg = shutil.which('ffmpeg')
    bundled = Path.home() / '.csdm/ffmpeg/bin/ffmpeg.exe'
    if not ffmpeg and bundled.is_file():
        ffmpeg = str(bundled)
    if not ffmpeg:
        pytest.skip('ffmpeg unavailable; Docker test image includes it')
    target = tmp_path / 'synthetic-test-pattern.mp4'
    subprocess.run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=30',
                    '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target)],
                   check=True, timeout=30)
    return target.read_bytes()


def test_upload_real_encoded_video_range_and_restart(client, store, video):
    response = client.post(BASE+'/upload?start=-1', content=video, headers=HEADERS)
    assert response.status_code == 201, response.text
    clip = response.json()
    assert clip['duration'] == 10 and clip['start'] == -1 and not clip['alignmentConfirmed']
    response = client.get(clip['url'], headers={'Range': 'bytes=0-99'})
    assert response.status_code == 206 and response.content == video[:100]
    assert response.headers['content-range'] == f'bytes 0-99/{len(video)}'
    reopened = Media(Store(store.root)).list(DEMO, PLAYER, 1)
    assert reopened[0]['sha256'] == clip['sha256']
    assert client.post('/api/footage/'+clip['id']+'/confirm', headers=HEADERS).json()['alignmentConfirmed']
    assert client.get('/api/footage/missing.mp4').status_code == 404


def test_bad_uploads_leave_no_partial_files(client, store):
    assert client.post(BASE+'/upload', content=b'not an mp4', headers=HEADERS).status_code == 422
    assert client.post(BASE+'/upload?start=nan', content=b'bad', headers=HEADERS).status_code == 422
    assert client.get(BASE).json() == []
    assert list((store.root/'footage').iterdir()) == []


def test_current_footage_list_hides_archived_snapshot_but_retains_history(client, store):
    old = client.post(BASE, headers=HEADERS, json={'anchor': 4}).json()
    current = client.post(BASE, headers=HEADERS, json={'anchor': 6}).json()
    with store.connect() as con:
        con.execute("UPDATE footage SET metadata=json_set(metadata,'$.snapshotId','old-snapshot') WHERE id=?", (old['id'],))
        con.execute("UPDATE footage SET metadata=json_set(metadata,'$.snapshotId','frozen-snapshot') WHERE id=?", (current['id'],))
    assert [c['id'] for c in client.get(BASE).json()] == [current['id']]
    assert {c['id'] for c in client.get(BASE+'?history=true').json()} == {old['id'], current['id']}
    assert Media(store).get(old['id'])['id'] == old['id']


def test_recording_round_trip(client, video):
    clip = client.post(BASE, headers=HEADERS, json={'anchor': 5}).json()
    claimed = client.post('/api/recordings/claim', headers=HEADERS).json()
    route = f"/api/recordings/{clip['id']}/upload?lease={claimed['lease']}"
    response = client.post(route, content=video, headers=HEADERS)
    assert response.status_code == 200, response.text
    assert response.json()['state'] == 'ready'
    assert client.post(route, content=video, headers=HEADERS).status_code == 409


def test_short_or_long_recording_is_not_silently_aligned(client, video):
    clip = client.post(BASE, headers=HEADERS, json={'anchor': 5, 'before': 1, 'after': 1}).json()
    claimed = client.post('/api/recordings/claim', headers=HEADERS).json()
    route = f"/api/recordings/{clip['id']}/upload?lease={claimed['lease']}"
    assert client.post(route, content=video, headers=HEADERS).status_code == 422
    assert client.get(BASE).json()[0]['state'] == 'recording'


def test_footage_evidence_requires_matching_verified_coverage(client, video):
    clip = client.post(BASE+'/upload?start=0', content=video, headers=HEADERS).json()
    payload = {'moments': [{'id': 'm1', 'start': 1, 'anchor': 5, 'end': 8, 'footageId': clip['id']}]}
    assert client.put(path(), headers=HEADERS, json=payload).status_code == 422
    client.post('/api/footage/'+clip['id']+'/confirm', headers=HEADERS)
    saved = client.put(path(), headers=HEADERS, json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()['footageEvidence'][clip['id']]['sha256'] == clip['sha256']
    assert client.put(path(rnd=2), headers=HEADERS, json=payload).status_code == 422


def test_media_requests_retain_csrf_protection(client):
    assert client.post(BASE, json={'anchor': 1}).status_code == 403
    assert client.post('/api/recordings/claim').status_code == 403
    assert client.post(BASE, headers={**HEADERS, 'Origin': 'https://evil.example'}, json={'anchor': 1}).status_code == 403


def test_map_assets_are_packaged(client):
    for name in ('ancient', 'anubis'):
        response = client.get(f'/static/maps/de_{name}_radar.png')
        assert response.status_code == 200 and response.content.startswith(b'\x89PNG')


@pytest.mark.parametrize('duration', [14.2, 15.8])
def test_recording_cannot_hide_a_second_of_missing_or_repeated_action(duration):
    with pytest.raises(ValueError, match='duration differs'):
        validate_recording_duration({'start':0,'end':15,'anchor':14.8}, {'duration':duration,'fps':'30/1'})


def test_frame_quantisation_is_allowed_but_last_grouped_event_must_be_present():
    validate_recording_duration({'start':0,'end':15,'anchor':8}, {'duration':14.9667,'fps':'30/1'})
    with pytest.raises(ValueError, match='stops before'):
        validate_recording_duration({'start':0,'end':15,'findings':[{'t':8},{'t':15}]}, {'duration':14.91,'fps':'30/1'})


def test_readable_header_with_corrupt_frames_never_becomes_ready(client, store, video, monkeypatch):
    def reject(_): raise ValueError('The video contains unreadable frames.')
    monkeypatch.setattr('app.annotation.media.validate_video_frames', reject)
    response = client.post(BASE+'/upload', headers=HEADERS, content=video)
    assert response.status_code == 422 and 'unreadable frames' in response.text
    assert client.get(BASE).json() == []
    assert list((store.root/'footage').iterdir()) == []
