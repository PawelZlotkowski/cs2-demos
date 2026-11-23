"""Detector upgrades must neither invalidate extraction nor overwrite reviewed clocks."""
from copy import deepcopy
import json
from types import SimpleNamespace

import pytest

from app.annotation import worker
from test_annotation import store, DEMO, PLAYER


@pytest.fixture
def cache(store, monkeypatch):
    folder = store.root / 'matches' / DEMO
    rounds = store.snapshot(DEMO, PLAYER)['rounds']
    normal = dict(analysis=json.loads((folder/'analysis.json').read_text()), rounds=rounds,
                  round_replays={r['id']: json.loads((folder/'rounds'/f"{r['id']}.json").read_text()) for r in rounds},
                  match={'players': [{'id': PLAYER}]})
    current = dict(parser='test', extraction='annotation-2', extractCode='stable-extract', code='new-detectors')
    worker.write(folder/'cache.json', dict(version={'parser':'test','extraction':'annotation-1','code':'legacy'},
                                          rounds=rounds, match=normal['match'], warnings=[]))
    monkeypatch.setattr(worker, 'version_info', lambda: current)
    calls = []
    monkeypatch.setattr('app.processing.parse_demo.parse_demo_file', lambda path: calls.append(path))
    monkeypatch.setattr('app.processing.normalize.normalize_parsed', lambda *args: normal)
    monkeypatch.setattr('app.analysis.match_data.build_match_data', lambda *args: SimpleNamespace(
        rounds=[SimpleNamespace(number=r['number'], sides={PLAYER:'CT'}, is_knife=True) for r in rounds]))
    return folder, normal, current, calls


def test_legacy_cache_proved_once_and_detector_only_change_reuses_telemetry(store, cache):
    folder, normal, current, calls = cache
    payload = {'demo': DEMO, 'player': PLAYER}
    first = worker.parse(store.root, payload, store.root)
    assert len(calls) == 1 and first['version'] == current
    current['code'] = 'another-detector-change'
    second = worker.parse(store.root, payload, store.root)
    assert len(calls) == 1 and second['version'] == current


def test_changed_extraction_does_not_overwrite_old_replay_or_cache(store, cache):
    folder, normal, current, calls = cache
    before = (folder/'cache.json').read_bytes()
    replay = (folder/'rounds'/'r1.json').read_bytes()
    normal['round_replays'] = deepcopy(normal['round_replays'])
    normal['round_replays']['r1']['startTick'] += 64
    with pytest.raises(ValueError, match='differs from reviewed telemetry'):
        worker.parse(store.root, {'demo':DEMO,'player':PLAYER}, store.root)
    assert (folder/'cache.json').read_bytes() == before
    assert (folder/'rounds'/'r1.json').read_bytes() == replay
