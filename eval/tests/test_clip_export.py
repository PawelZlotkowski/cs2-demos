"""Export clips for web: verified MP4 copies plus a round-reviewer-clips-v1 manifest."""
import hashlib
import json

import pytest

from test_annotation import seed, DEMO, PLAYER
from app.annotation.batches import Batches, BatchRequest
from app.annotation.clip_export import export_clips, list_batches
from app.annotation.media import Media, ClipRequest
from app.annotation.store import Store, encode
from app.models.annotation import ClipManifest, Provenance


def probe(path):
    return {'duration': 7.0, 'width': 1280, 'height': 720, 'fps': '30/1', 'codec': 'h264'}


def ready_with_file(store, clip_id, payload=b'\x00\x00\x00\x18ftypmp42synthetic-clip-bytes'):
    path = store.root / 'footage' / f'{clip_id}.mp4'
    path.write_bytes(payload)
    with store.connect() as con:
        row = con.execute('SELECT metadata FROM footage WHERE id=?', (clip_id,)).fetchone()
        data = json.loads(row['metadata'])
        data.update(duration=7.0, width=1280, height=720, fps='30/1', codec='h264', videoEnd=data['start'] + 7,
                    sha256=hashlib.sha256(payload).hexdigest(), bytes=len(payload), alignmentConfirmed=False)
        con.execute("UPDATE footage SET state='ready',metadata=? WHERE id=?", (encode(data), clip_id))
    return path


@pytest.fixture
def workspace(tmp_path):
    store = Store(tmp_path / 'workspace')
    seed(store)
    store.set_provenance(DEMO, Provenance(split='train', trainingPermitted=True, sourceMatchId='match-one'))
    batch = Batches(store).create(DEMO, PLAYER, BatchRequest(before=2, after=5))
    clip = Batches(store).review(batch['id'], 'alice')[0]
    ready_with_file(store, clip['id'])
    return store, batch, clip


def test_lists_human_readable_batches(workspace):
    store, batch, _ = workspace
    [row] = list_batches(store)
    assert row['batchId'] == batch['id'] and row['mapName'] == 'Ancient'
    assert row['playerName'] == 'Selected player' and row['demoFile'] == 'fixture.dem'
    assert row['ready'] == 1 and row['total'] == 1


def test_exports_verified_files_with_full_source_evidence(workspace, tmp_path):
    store, batch, clip = workspace
    out = tmp_path / 'export'
    result = export_clips(store, out, [batch['id']], probe=probe)
    assert result['clips'] == 1 and result['copied'] == 1 and not result['problems']
    manifest = json.loads((out / 'manifest.json').read_text('utf-8'))
    ClipManifest.model_validate(manifest)
    [entry] = manifest['clips']
    assert entry['path'] == f"clips/{clip['id']}.mp4" and entry['footageId'] == clip['id']
    assert (out / entry['path']).read_bytes() == (store.root / 'footage' / f"{clip['id']}.mp4").read_bytes()
    assert entry['finding']['id'] == 'F1' and entry['snapshotId'] == 'frozen-snapshot' and entry['batchId'] == batch['id']
    assert 'finding' not in entry['footage'] and entry['footage']['startTick'] < entry['footage']['endTick']
    demo = manifest['demos'][DEMO]
    assert demo['metadata']['sha256'] == 'a' * 64 and demo['metadata']['map'] == 'de_ancient'
    assert demo['provenance'] == {'source': '', 'sourceMatchId': 'match-one', 'split': 'train', 'trainingPermitted': True}
    assert manifest['workspace'] and len(manifest['workspace']) == 32
    # The original recording stays in the workspace.
    assert (store.root / 'footage' / f"{clip['id']}.mp4").is_file()


def test_retry_reuses_matching_files_and_replaces_the_manifest(workspace, tmp_path):
    store, batch, _ = workspace
    out = tmp_path / 'export'
    export_clips(store, out, [batch['id']], probe=probe)
    (out / 'clips' / 'leftover.mp4.partial').write_bytes(b'half')
    again = export_clips(store, out, [batch['id']], probe=probe)
    assert again['reused'] == 1 and again['copied'] == 0
    assert not list((out / 'clips').glob('*.partial'))


def test_changed_recording_is_reported_and_left_out(workspace, tmp_path):
    store, batch, clip = workspace
    path = store.root / 'footage' / f"{clip['id']}.mp4"
    data = path.read_bytes()
    path.write_bytes(data[:-1] + b'X')  # same size, different bytes
    out = tmp_path / 'export'
    result = export_clips(store, out, [batch['id']], probe=probe)
    assert result['clips'] == 0 and 'SHA-256' in result['problems'][0]['problem']
    assert not (out / 'clips' / f"{clip['id']}.mp4").exists()
    assert json.loads((out / 'manifest.json').read_text('utf-8'))['clips'] == []


def test_clip_without_finding_is_not_exported(workspace, tmp_path):
    store, batch, _ = workspace
    loose = Media(store).queue(DEMO, PLAYER, 1, ClipRequest(anchor=5))
    with store.connect() as con:
        meta = json.loads(con.execute('SELECT metadata FROM footage WHERE id=?', (loose['id'],)).fetchone()['metadata'])
        meta['batchId'] = batch['id']  # even inside a batch, no finding means no export
        con.execute("UPDATE footage SET state='ready',metadata=? WHERE id=?", (encode(meta), loose['id']))
    result = export_clips(store, tmp_path / 'export', [batch['id']], probe=probe)
    assert result['clips'] == 1 and result['skippedWithoutFinding'] == 1


def test_refuses_unrelated_folders_and_unknown_batches(workspace, tmp_path):
    store, batch, _ = workspace
    busy = tmp_path / 'busy'
    busy.mkdir()
    (busy / 'holiday.jpg').write_bytes(b'x')
    with pytest.raises(ValueError, match='empty folder'):
        export_clips(store, busy, [batch['id']], probe=probe)
    with pytest.raises(KeyError):
        export_clips(store, tmp_path / 'other', ['0' * 32], probe=probe)
