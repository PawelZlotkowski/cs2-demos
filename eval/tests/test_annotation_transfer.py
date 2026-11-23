"""Two independent labellers exchange notes without replacing recordings or edits."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

import pytest

from test_annotation import seed, DEMO, PLAYER
from test_annotation_batches import ready
from app.annotation.batches import Batches, BatchRequest, ClipLabel
from app.annotation.examples import coach_examples, ExampleQuery
from app.annotation.store import Store, Conflict
from app.annotation.transfer import export_notes, import_notes, backup, restore
from app.models.annotation import Provenance, ReviewSave


def workspace(folder):
    store = Store(folder)
    seed(store)
    store.set_provenance(DEMO, Provenance(split='train', trainingPermitted=True, sourceMatchId='match-one'))
    batches = Batches(store)
    batch = batches.create(DEMO, PLAYER, BatchRequest())
    clip = batches.review(batch['id'], 'alice')[0]
    ready(store, clip['id'])
    return store, batches, batch, clip


def save(batches, batch, clip, notes='Check the approach.', **changes):
    values = dict(inputMode='note', status='complete', notes=notes)
    values.update(changes)
    return batches.save(batch['id'], clip['id'], 'alice',
                        ClipLabel(**values))


def test_roundtrip_idempotency_updates_and_local_edit_conflict(tmp_path):
    origin, batches, batch, clip = workspace(tmp_path/'origin')
    saved = save(batches, batch, clip)
    target = Store(tmp_path/'collector')
    exchange = tmp_path/'alice.json'
    export_notes(origin, exchange, 'alice')
    assert import_notes(target, exchange) == {'imported':1,'unchanged':0}
    assert import_notes(target, exchange) == {'imported':0,'unchanged':1}
    assert target.demos() == []  # No fake playable demos from a note-only import.
    query = ExampleQuery(demoHash='c'*64, map='de_ancient', detectors=['untraded_death'], language='en')
    assert coach_examples(target, query)[0]['note'] == 'Check the approach.'
    newer = save(batches, batch, clip, notes='Need more context.', previousRevision=saved['revision'])
    export_notes(origin, exchange, 'alice')
    assert import_notes(target, exchange)['imported'] == 1
    assert coach_examples(target, query)[0]['note'] == 'Need more context.'
    save(batches, batch, clip, notes='Still reviewing.', previousRevision=newer['revision'], status='draft')


def test_export_draft_withdraws_and_older_export_cannot_restore_it(tmp_path):
    origin, batches, batch, clip = workspace(tmp_path/'origin')
    target = Store(tmp_path/'collector')
    saved = save(batches, batch, clip)
    original, updated = tmp_path/'old.json', tmp_path/'new.json'
    export_notes(origin, original, 'alice')
    import_notes(target, original)
    batches.save(batch['id'], clip['id'], 'alice', ClipLabel(previousRevision=saved['revision'],
        inputMode='note', status='draft', notes='Reconsidering.'))
    export_notes(origin, updated, 'alice')
    assert import_notes(target, updated)['imported'] == 1
    assert import_notes(target, original)['unchanged'] == 1
    query = ExampleQuery(demoHash='c'*64,map='de_ancient',detectors=['untraded_death'],language='en')
    assert not coach_examples(target, query)


def test_conflicts_rollback_and_recording_can_arrive_later(tmp_path):
    origin, batches, batch, clip = workspace(tmp_path/'origin')
    saved = save(batches, batch, clip)
    export = tmp_path/'alice.json'
    export_notes(origin, export, 'alice')
    target = Store(tmp_path/'collector')
    import_notes(target, export)
    # Importing the source demo subsequently upgrades its metadata and retains permissions.
    target.register(origin.demo(DEMO) | {'notesOnly':False})
    assert target.demos() and target.demo(DEMO)['provenance']['split'] == 'train'
    with target.connect() as con:
        row = con.execute('SELECT * FROM clip_labels').fetchone()
        con.execute('INSERT INTO clip_labels(demo,player,snapshot,finding,labeller,payload,created) VALUES(?,?,?,?,?,?,?)',
                    tuple(row[k] for k in ('demo','player','snapshot','finding','labeller','payload','created')))
    save(batches, batch, clip, notes='New opinion.', previousRevision=saved['revision'])
    export_notes(origin, export, 'alice')
    with pytest.raises(Conflict, match='local edit'):
        import_notes(target, export)
    with target.connect() as con:
        assert con.execute('SELECT COUNT(*) FROM clip_labels').fetchone()[0] == 2
    other = Store(tmp_path/'other')
    metadata = origin.demo(DEMO)
    other.register(metadata)
    other.set_provenance(DEMO, Provenance(split='test'))
    with pytest.raises(Conflict, match='different dataset split'):
        import_notes(other, export)


def test_backup_restores_recordings_and_revisions_to_empty_workspace(tmp_path):
    original, batches, batch, clip = workspace(tmp_path/'origin')
    save(batches, batch, clip)
    (original.root/'footage'/f"{clip['id']}.mp4").write_bytes(b'synthetic media')
    archive = tmp_path/'backup.zip'
    result = backup(original.root, archive)
    restored = tmp_path/'restored'
    assert restore(restored, archive)['restored'] == result['files']
    assert (restored/'footage'/f"{clip['id']}.mp4").read_bytes() == b'synthetic media'
    reopened = Store(restored)
    assert Batches(reopened).review(batch['id'],'alice')[0]['label']['notes'] == 'Check the approach.'
    with pytest.raises(Conflict, match='empty workspace'):
        restore(restored, archive)


def test_corrupt_backup_leaves_destination_empty(tmp_path):
    original, _, _, _ = workspace(tmp_path/'origin')
    archive = tmp_path/'backup.zip'
    backup(original.root, archive)
    bad = tmp_path/'bad.zip'
    with ZipFile(archive) as source, ZipFile(bad, 'w', compression=ZIP_DEFLATED) as dest:
        for name in source.namelist():
            value = source.read(name)
            if name == 'backup-manifest.json':
                manifest = json.loads(value)
                manifest['files']['annotations.sqlite3']['sha256'] = '0'*64
                value = json.dumps(manifest).encode()
            dest.writestr(name, value)
    restored = tmp_path/'restored'
    with pytest.raises(ValueError, match='checksum'):
        restore(restored, bad)
    assert not list(restored.iterdir())


def test_round_notes_and_permission_withdrawal(tmp_path):
    origin, batches, batch, clip = workspace(tmp_path/'origin')
    save(batches, batch, clip)
    origin.save(DEMO, PLAYER, 2, 'alice', ReviewSave(status='complete', notes='Hold the angle.',
                fullRoundReviewed=True, independentComplete=True))
    exchange = tmp_path/'notes.json'
    target = Store(tmp_path/'collector')
    export_notes(origin, exchange, 'alice')
    assert import_notes(target, exchange)['imported'] == 2
    assert target.current(DEMO, PLAYER, 2, 'alice')['notes'] == 'Hold the angle.'
    origin.set_provenance(DEMO, Provenance(split='train', sourceMatchId='match-one', trainingPermitted=False))
    export_notes(origin, exchange, 'alice')
    assert import_notes(target, exchange)['unchanged'] == 2
    assert target.demo(DEMO)['provenance']['trainingPermitted'] is False


def test_modified_revision_rolls_back_entire_bundle(tmp_path):
    origin, batches, batch, clip = workspace(tmp_path/'origin')
    save(batches, batch, clip)
    exchange = tmp_path/'notes.json'
    target = Store(tmp_path/'collector')
    export_notes(origin, exchange, 'alice')
    import_notes(target, exchange)
    payload = json.loads(exchange.read_text('utf-8'))
    payload['labels'][0]['label']['notes'] = 'Tampered revision.'
    payload['demos'][DEMO]['provenance']['trainingPermitted'] = False
    exchange.write_text(json.dumps(payload), encoding='utf-8')
    with pytest.raises(Conflict, match='previously imported revision was changed'):
        import_notes(target, exchange)
    assert target.demo(DEMO)['provenance']['trainingPermitted'] is True
    with target.connect() as con:
        assert con.execute('SELECT COUNT(*) FROM clip_labels').fetchone()[0] == 1


def test_backup_rejects_path_traversal(tmp_path):
    bad = tmp_path/'bad.zip'
    from app.annotation.transfer import BACKUP_FORMAT
    with ZipFile(bad, 'w') as archive:
        manifest = {'format': BACKUP_FORMAT, 'files': {'annotations.sqlite3': {}, '../escape': {}}}
        archive.writestr('backup-manifest.json', json.dumps(manifest))
        archive.writestr('annotations.sqlite3', b'')
        archive.writestr('../escape', b'')
    with pytest.raises(ValueError, match='invalid path'):
        restore(tmp_path/'restore', bad)
    assert not (tmp_path/'escape').exists()
