"""Cloud labeller exports through the real local notes importer and coach-example rules.

The fixtures are produced by apps/web/tests/labeler/contracts.test.ts (buildNotesExport) from
a manifest written by the Python exporter, so this test checks the TypeScript -> Python path.
"""
import json
from pathlib import Path

import pytest

import test_annotation  # noqa: F401  (adds apps/api to sys.path)
from app.annotation.examples import ExampleQuery, coach_examples
from app.annotation.store import Conflict, Store, encode
from app.annotation.transfer import import_notes, validate_notes
from app.models.annotation import ClipManifest

FIXTURES = Path(__file__).parent / 'fixtures' / 'labeller'
ANCIENT = 'demo-' + 'a' * 64
ANUBIS = 'demo-' + 'd' * 64


def fixture(name):
    return FIXTURES / f'{name}.json'


def ancient_query(demo_hash='c' * 64):
    return ExampleQuery(demoHash=demo_hash, map='de_ancient', detectors=['untraded_death'], language='en')


def test_manifest_fixture_satisfies_the_python_contract():
    manifest = ClipManifest.model_validate_json(fixture('clips-manifest').read_text('utf-8'))
    assert {d.metadata.map for d in manifest.demos.values()} == {'de_ancient', 'de_anubis'}
    for name in ('cloud-notes-1-initial', 'cloud-notes-2-later-revision', 'cloud-notes-3-withdrawn', 'cloud-notes-grouped'):
        validate_notes(json.loads(fixture(name).read_text('utf-8')))


def test_grouped_cloud_note_remains_one_review_and_matches_nonlead_detector(tmp_path):
    store = Store(tmp_path/'grouped')
    assert import_notes(store,fixture('cloud-notes-grouped')) == {'imported':2,'unchanged':0}
    assert import_notes(store,fixture('cloud-notes-grouped')) == {'imported':0,'unchanged':2}
    with store.connect() as con:
        rows = con.execute('SELECT finding,payload FROM clip_labels').fetchall()
    grouped = [json.loads(r['payload']) for r in rows if '+' in r['finding']]
    assert len(grouped)==1 and len(grouped[0]['footage']['findings'])==2
    query=ExampleQuery(demoHash='c'*64,map='de_ancient',detectors=['unused_utility'],language='en')
    assert [e['note'] for e in coach_examples(store,query)] == ['Wait for a trade.\nUse the flash before peeking.']


def test_cloud_export_imports_twice_then_updates_and_withdraws(tmp_path):
    store = Store(tmp_path / 'local')
    first = import_notes(store, fixture('cloud-notes-1-initial'))
    assert first == {'imported': 2, 'unchanged': 0}
    assert import_notes(store, fixture('cloud-notes-1-initial')) == {'imported': 0, 'unchanged': 2}
    assert store.demos() == []  # note-only import never fakes a playable demo

    examples = coach_examples(store, ancient_query())
    assert [e['note'] for e in examples] == ['Peeked alone; wait for the trade.']
    assert coach_examples(store, ancient_query('a' * 64)) == [], 'the same demo is never its own example'
    anubis = ExampleQuery(demoHash='c' * 64, map='de_anubis', detectors=['shot_while_moving'], language='pl')
    assert coach_examples(store, anubis) == [], 'validation matches without training permission stay out'

    assert import_notes(store, fixture('cloud-notes-2-later-revision')) == {'imported': 1, 'unchanged': 1}
    assert coach_examples(store, ancient_query())[0]['note'] == 'Peeked alone again; hold for the flash.'

    assert import_notes(store, fixture('cloud-notes-3-withdrawn')) == {'imported': 2, 'unchanged': 0}
    assert coach_examples(store, ancient_query()) == [], 'a withdrawn completion leaves the coach examples'
    with store.connect() as con:
        rows = con.execute("SELECT payload FROM clip_labels WHERE id IN (SELECT MAX(id) FROM clip_labels GROUP BY demo,player,snapshot,finding,labeller)").fetchall()
    latest = {json.loads(r['payload'])['matchId']: json.loads(r['payload']) for r in rows}
    assert latest[ANUBIS]['status'] == 'draft' and latest[ANUBIS]['cloud']['status'] == 'skipped'
    assert latest[ANCIENT]['labeller'] == 'alex_web' and latest[ANCIENT]['reviewMode'] == 'cloud-independent-clip'

    # An older export cannot resurrect the withdrawn completion.
    assert import_notes(store, fixture('cloud-notes-1-initial')) == {'imported': 0, 'unchanged': 2}
    assert coach_examples(store, ancient_query()) == []


def test_split_and_permission_decisions_are_preserved(tmp_path):
    store = Store(tmp_path / 'local')
    import_notes(store, fixture('cloud-notes-1-initial'))
    assert store.demo(ANCIENT)['provenance'] == {'source': '', 'sourceMatchId': 'match-ancient', 'split': 'train', 'trainingPermitted': True}
    assert store.demo(ANUBIS)['provenance']['split'] == 'val'
    # A workspace that already put this match in a different split refuses the import.
    other = Store(tmp_path / 'other')
    payload = json.loads(fixture('cloud-notes-1-initial').read_text('utf-8'))
    metadata = payload['demos'][ANCIENT]['metadata']
    other.register(metadata)
    from app.models.annotation import Provenance
    other.set_provenance(ANCIENT, Provenance(split='test', sourceMatchId='match-ancient'))
    with pytest.raises(Conflict, match='different dataset split'):
        import_notes(other, fixture('cloud-notes-1-initial'))


def test_same_handle_used_locally_and_in_the_cloud_conflicts(tmp_path):
    store = Store(tmp_path / 'local')
    payload = json.loads(fixture('cloud-notes-1-initial').read_text('utf-8'))
    label = payload['labels'][0]['label']
    import_notes(store, fixture('cloud-notes-1-initial'))
    with store.connect() as con:  # an independent local edit under the same handle
        con.execute('INSERT INTO clip_labels(demo,player,snapshot,finding,labeller,payload,created) VALUES(?,?,?,?,?,?,?)',
                    (label['matchId'], label['playerId'], label['snapshotId'], label['finding']['id'], 'alex_web',
                     encode({**label, 'notes': 'local edit'}), '2026-11-17T12:30:00+00:00'))
    with pytest.raises(Conflict, match='handle unique'):
        import_notes(store, fixture('cloud-notes-2-later-revision'))
    # A distinct local handle (for example alex) never collides with the cloud handle alex_web.
    clean = Store(tmp_path / 'clean')
    import_notes(clean, fixture('cloud-notes-1-initial'))
    with clean.connect() as con:
        con.execute('INSERT INTO clip_labels(demo,player,snapshot,finding,labeller,payload,created) VALUES(?,?,?,?,?,?,?)',
                    (label['matchId'], label['playerId'], label['snapshotId'], label['finding']['id'], 'alex',
                     encode({**label, 'labeller': 'alex', 'notes': 'local opinion'}), '2026-11-17T12:30:00+00:00'))
    assert import_notes(clean, fixture('cloud-notes-2-later-revision'))['imported'] == 1


def test_exported_notes_take_provenance_from_the_newest_export(tmp_path):
    from app.annotation.examples import file_examples
    demo = 'demo-' + 'b' * 64

    def export(name, exported, split, permitted=True):
        label = {'status': 'complete', 'verdict': 'correct', 'assessment': 'mistake', 'notes': 'Wait for the trade.',
                 'language': 'en', 'matchId': demo, 'playerId': 'P', 'snapshotId': 's', 'labeller': 'L',
                 'finding': {'id': 'F1', 'detector': 'untraded_death', 'evidence': {}},
                 'footage': {'alignmentConfirmed': True, 'findings': [{'id': 'F1', 'detector': 'untraded_death', 'evidence': {}}]}}
        (tmp_path / name).write_text(json.dumps({
            'format': 'round-reviewer-notes-v1', 'labeller': 'L', 'exportedAt': exported,
            'demos': {demo: {'metadata': {'id': demo, 'map': 'de_ancient', 'players': []},
                             'provenance': {'split': split, 'trainingPermitted': permitted, 'sourceMatchId': ''}}},
            'labels': [{'kind': 'clip', 'revision': 5, 'savedAt': exported, 'label': label}]}), encoding='utf-8')

    # The newer export moved the demo to test; its file name sorts first, so file order alone would keep train.
    export('L-notes-2026-11-25.json', '2026-11-25T00:00:00+00:00', 'test')
    export('L-notes.json', '2026-11-18T00:00:00+00:00', 'train')
    assert file_examples(ancient_query('a' * 64), [tmp_path]) == []
    # On the same export time the stricter provenance wins, in either file order.
    export('L-notes-2026-11-25.json', '2026-11-25T00:00:00+00:00', 'train', permitted=False)
    export('L-notes.json', '2026-11-25T00:00:00+00:00', 'train')
    assert file_examples(ancient_query('a' * 64), [tmp_path]) == []
