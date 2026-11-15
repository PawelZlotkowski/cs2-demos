"""One disposable parser subprocess. No recording, model, account or cloud services."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import sys

from app.annotation.store import encode


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write(path: Path, value):
    temp = path.with_suffix(path.suffix + '.tmp')
    with temp.open('w', encoding='utf-8') as stream:
        stream.write(encode(value))
        stream.flush()
        os.fsync(stream.fileno())
    temp.replace(path)


def inspect(root: Path, payload: dict, work: Path):
    import zstandard
    from app.processing.parse_demo import inspect_demo_roster

    src = root / 'uploads' / payload['upload']
    dest = work / 'demo.dem'
    limit = int(os.getenv('RR_ANNOTATION_MAX_DEMO_MB', '2048')) * 1024 * 1024
    with src.open('rb') as source, dest.open('wb') as target:
        if payload['filename'].lower().endswith('.zst'):
            # python-zstandard's streaming decoder limit is in bytes. A 128 KiB
            # limit rejects ordinary FACEIT frames with a 2 MiB window.
            reader = zstandard.ZstdDecompressor(max_window_size=128 * 1024 * 1024).stream_reader(source)
        else:
            reader = source
        try:
            count = 0
            while chunk := reader.read(1024 * 1024):
                count += len(chunk)
                if count > limit:
                    raise ValueError('Decompressed demo exceeds the size limit.')
                target.write(chunk)
        finally:
            if reader is not source:
                reader.close()
    with dest.open('rb') as stream:
        if stream.read(8) != b'PBDEMS2\0':
            raise ValueError('This is not a CS2 demo. Extract a .dem from archives first.')
    sha = digest(dest)
    match_id = 'demo-' + sha
    map_name, players = inspect_demo_roster(str(dest))
    if map_name not in ('de_ancient', 'de_anubis'):
        raise ValueError(f'{map_name} is outside the current Ancient/Anubis scope.')
    match_dir = root / 'matches' / match_id
    match_dir.mkdir(exist_ok=True)
    saved_demo = match_dir / 'source.dem'
    if not saved_demo.exists():
        dest.replace(saved_demo)
    return {'id': match_id, 'sha256': sha, 'filename': payload['filename'], 'map': map_name,
            'players': players, 'parserVersion': importlib.metadata.version('demoparser2'),
            'originalSha256': digest(src)}


def parse(root: Path, payload: dict, work: Path):
    from app.processing.parse_demo import parse_demo_file
    from app.processing.normalize import normalize_parsed
    from app.analysis.match_data import build_match_data
    from app.analysis.detectors import DETECTORS
    from app.analysis.policy import LOCAL_V1_DETECTORS, policy_description
    from app.analysis.run import to_finding

    match_id, player = payload['demo'], payload['player']
    folder = root / 'matches' / match_id
    cache = folder / 'cache.json'
    parser_version = importlib.metadata.version('demoparser2')
    code_root = Path(__file__).resolve().parents[1]
    code_hash = hashlib.sha256()
    for subfolder in ('processing', 'analysis', 'maps', 'coach/templates'):
        for file in sorted((code_root / subfolder).rglob('*')):
            if file.suffix in ('.py', '.json'):
                code_hash.update(file.relative_to(code_root).as_posix().encode())
                code_hash.update(file.read_bytes())
    version = {'parser': parser_version, 'code': code_hash.hexdigest(), 'extraction': 'annotation-1'}
    if cache.exists():
        saved = json.loads(cache.read_text('utf-8'))
        if saved['version'] != version:
            raise ValueError('Cached parser version differs. Keep this workspace for its existing reviews; use a new workspace to reparse with changed code.')
        analysis = json.loads((folder / 'analysis.json').read_text('utf-8'))
        replays = {r['id']: json.loads((folder / 'rounds' / (r['id'] + '.json')).read_text('utf-8')) for r in saved['rounds']}
    else:
        parsed = parse_demo_file(str(folder / 'source.dem'))
        normal = normalize_parsed(match_id, parsed)
        analysis, replays = normal['analysis'], normal['round_replays']
        (folder / 'rounds').mkdir(exist_ok=True)
        write(folder / 'analysis.json', analysis)
        for key, replay in replays.items():
            write(folder / 'rounds' / f'{key}.json', replay)
        saved = {'version': version, 'rounds': normal['rounds'], 'match': normal['match'],
                 'warnings': ['Round times use the normaliser freeze-end mapping; verify anchors against playback.',
                              'Optional telemetry may be missing. Radar positions do not establish player knowledge.']}
        write(cache, saved)  # Last file is the cache commit marker.
    match = build_match_data(analysis, replays)
    if player not in {p['id'] for p in saved['match']['players']}:
        raise ValueError('The selected player was not found in the parsed demo.')
    drafts = []
    rounds = []
    for rd in match.rounds:
        if player not in rd.sides:
            continue
        meta = next(r for r in saved['rounds'] if r['number'] == rd.number)
        rounds.append({**meta, 'side': rd.sides[player], 'knifeRound': rd.is_knife})
        if not rd.is_knife:
            for detector in LOCAL_V1_DETECTORS:
                drafts.extend(DETECTORS[detector](match, rd.number, player))
    if not rounds:
        raise ValueError('No reviewable rounds were found for this player.')
    drafts.sort(key=lambda d: (d.round, d.t, d.detector))
    findings = [to_finding(d, f'F{i}').model_dump(by_alias=True, mode='json') for i, d in enumerate(drafts, 1)]
    snapshot = {'playerId': player, 'rounds': rounds, 'findings': findings, 'policy': policy_description('local-v1'),
                'version': version, 'warnings': saved['warnings'], 'analysisSha256': digest(folder / 'analysis.json')}
    snapshot['id'] = hashlib.sha256(encode(snapshot).encode()).hexdigest()
    return snapshot


def main():
    request = Path(sys.argv[1])
    data = json.loads(request.read_text('utf-8'))
    work, root = request.parent, Path(data['root'])
    try:
        result = (inspect if data['kind'] == 'inspect' else parse)(root, data['payload'], work)
        write(work / 'result.json', result)
    except Exception as exc:
        write(work / 'error.json', {'error': str(exc)[:2000] or type(exc).__name__})
        raise
    finally:
        (work / 'demo.dem').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
