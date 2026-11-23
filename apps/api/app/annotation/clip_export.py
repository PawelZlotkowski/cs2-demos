"""Export ready clips for the hosted clip labeller (round-reviewer-clips-v1), run inside Docker.

    python -m app.annotation.clip_export list [--json]
    python -m app.annotation.clip_export export /export --batch BATCH_ID [--batch BATCH_ID ...]

The destination is a host folder bind-mounted at /export. It receives clips/<footageId>.mp4
and manifest.json. Each MP4 is revalidated with ffprobe and copied in 1 MiB chunks while its
SHA-256 is recomputed and compared with the hash recorded when the footage arrived. The
manifest carries the full source evidence the notes importer needs: demo metadata and
provenance, decompressed demo SHA-256, map, sourceMatchId, player, detector snapshot, round,
finding and the original footage identity and timing. Clips recorded without a detector finding
are skipped, because a plain MP4 cannot prove what it shows. A retry reuses files that already
match their hash; the manifest is replaced atomically and always lists only verified files.
Original recordings stay in the workspace.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys

from app.annotation.media import probe_video
from app.annotation.store import Store
from app.models.annotation import CLIP_MANIFEST_FORMAT, ClipManifest

CHUNK = 1024 * 1024
ALLOWED = {'manifest.json', 'manifest.json.partial', 'clips'}


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _copy(source: Path, target: Path) -> str:
    partial = target.with_name(target.name + '.partial')
    digest = hashlib.sha256()
    try:
        with source.open('rb') as src, partial.open('wb') as dest:
            while chunk := src.read(CHUNK):
                digest.update(chunk)
                dest.write(chunk)
            dest.flush()
            os.fsync(dest.fileno())
        return digest.hexdigest()
    except BaseException:
        partial.unlink(missing_ok=True)
        raise


def _origin(store: Store) -> str | None:
    from app.annotation.transfer import transfer_schema
    with store.connect() as con:
        transfer_schema(con)
        return con.execute('SELECT id FROM workspace_identity').fetchone()[0]


def list_batches(store: Store) -> list[dict]:
    result = []
    with store.connect() as con:
        batches = con.execute('SELECT id, demo, player, snapshot, metadata FROM clip_batches ORDER BY rowid').fetchall()
        for number, row in enumerate(batches, 1):
            demo = json.loads(con.execute('SELECT metadata FROM demos WHERE id=?', (row['demo'],)).fetchone()['metadata'])
            counts = con.execute("""SELECT
                    SUM(state='ready' AND json_extract(metadata,'$.finding.id') IS NOT NULL) AS ready,
                    COUNT(*) AS total,
                    SUM(CASE WHEN state='ready' THEN json_extract(metadata,'$.bytes') ELSE 0 END) AS bytes
                FROM footage WHERE json_extract(metadata,'$.batchId')=?""", (row['id'],)).fetchone()
            player = next((p for p in demo.get('players', []) if p['id'] == row['player']), {})
            result.append({
                'number': number, 'batchId': row['id'], 'demo': row['demo'], 'map': demo['map'],
                'mapName': {'de_ancient': 'Ancient', 'de_anubis': 'Anubis'}.get(demo['map'], demo['map']),
                'demoFile': demo.get('filename', row['demo']), 'playerId': row['player'],
                'playerName': player.get('name') or row['player'], 'ready': counts['ready'] or 0,
                'total': counts['total'] or 0, 'readyBytes': counts['bytes'] or 0,
                'createdAt': json.loads(row['metadata']).get('createdAt'),
            })
    return result


def _prepare(destination: Path) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    unexpected = [p.name for p in destination.iterdir() if p.name not in ALLOWED]
    if unexpected:
        raise ValueError('Choose an empty folder or the folder of a previous clip export. '
                         f'This folder also contains: {", ".join(sorted(unexpected)[:5])}.')
    clips = destination / 'clips'
    clips.mkdir(exist_ok=True)
    for stale in clips.glob('*.partial'):
        stale.unlink()
    return clips


def export_clips(store: Store, destination: Path, batch_ids: list[str], *, probe=probe_video) -> dict:
    if not batch_ids:
        raise ValueError('Choose at least one batch to export.')
    with store.connect() as con:
        known = {r['id'] for r in con.execute('SELECT id FROM clip_batches')}
    missing = [b for b in batch_ids if b not in known]
    if missing:
        raise KeyError(f'Unknown batch: {", ".join(missing)}.')
    clips_dir = _prepare(destination)
    entries, demos, problems, skipped = [], {}, [], 0
    reused = copied = 0
    with store.connect() as con:
        rows = []
        for batch in dict.fromkeys(batch_ids):
            rows += con.execute("""SELECT * FROM footage WHERE state='ready' AND json_extract(metadata,'$.batchId')=?
                ORDER BY round, CAST(json_extract(metadata,'$.anchor') AS REAL), id""", (batch,)).fetchall()
        demo_rows = {r['id']: r for r in con.execute('SELECT id, metadata, provenance FROM demos')}
    for row in rows:
        metadata = json.loads(row['metadata'])
        finding = metadata.get('finding')
        if not finding or not metadata.get('snapshotId'):
            skipped += 1
            continue
        source = store.root / 'footage' / f"{row['id']}.mp4"
        target = clips_dir / f"{row['id']}.mp4"
        try:
            if not source.is_file():
                raise ValueError('the recording file is missing from the workspace')
            if source.stat().st_size != metadata['bytes']:
                raise ValueError('the recording size differs from its stored metadata')
            info = probe(source)
            if abs(info['duration'] - metadata['duration']) > max(0.5, metadata['duration'] * 0.05):
                raise ValueError('the recording duration differs from its stored metadata')
            if target.is_file() and target.stat().st_size == metadata['bytes'] and _hash(target) == metadata['sha256']:
                reused += 1
            else:
                actual = _copy(source, target)
                if actual != metadata['sha256']:
                    target.with_name(target.name + '.partial').unlink(missing_ok=True)
                    raise ValueError('the recording SHA-256 differs from the hash recorded when it arrived')
                target.with_name(target.name + '.partial').replace(target)
                copied += 1
        except (OSError, ValueError, KeyError) as error:
            problems.append({'footageId': row['id'], 'round': row['round'], 'problem': str(error)})
            continue
        demo = demo_rows[row['demo']]
        demos[row['demo']] = {'metadata': json.loads(demo['metadata']), 'provenance': json.loads(demo['provenance'])}
        footage = {k: v for k, v in metadata.items() if k not in ('finding', 'batchId', 'snapshotId')}
        entries.append({
            'footageId': row['id'], 'path': f"clips/{row['id']}.mp4", 'bytes': metadata['bytes'],
            'sha256': metadata['sha256'], 'contentType': 'video/mp4', 'matchId': row['demo'],
            'playerId': row['player'], 'snapshotId': metadata['snapshotId'], 'round': row['round'],
            'batchId': metadata['batchId'], 'finding': finding, 'footage': footage,
        })
    payload = {
        'format': CLIP_MANIFEST_FORMAT, 'exportedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'workspace': _origin(store), 'demos': demos, 'clips': entries,
    }
    # Validate against the contract, but write the original values so source evidence is unchanged.
    ClipManifest.model_validate(payload)
    partial = destination / 'manifest.json.partial'
    try:
        partial.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, indent=1), encoding='utf-8')
        partial.replace(destination / 'manifest.json')
    finally:
        partial.unlink(missing_ok=True)
    listed = {e['path'].split('/', 1)[1] for e in entries}
    extra = sorted(p.name for p in clips_dir.glob('*.mp4') if p.name not in listed)
    return {'folder': str(destination), 'clips': len(entries), 'bytes': sum(e['bytes'] for e in entries),
            'copied': copied, 'reused': reused, 'skippedWithoutFinding': skipped,
            'problems': problems, 'filesNotInManifest': len(extra)}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=['list', 'export'])
    parser.add_argument('path', nargs='?', type=Path)
    parser.add_argument('--batch', action='append', default=[])
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    root = Path(os.getenv('RR_ANNOTATION_DIR', '.local/annotation'))
    try:
        store = Store(root)
        if args.command == 'list':
            batches = list_batches(store)
            if args.json:
                print(json.dumps(batches))
            else:
                for b in batches:
                    print(f"{b['number']:>3}  {b['mapName']}, {b['demoFile']}, {b['playerName']}: "
                          f"{b['ready']} ready of {b['total']} ({b['readyBytes'] / 1e6:.0f} MB)  [{b['batchId']}]")
            return
        if not args.path:
            parser.error('export needs a destination folder')
        result = export_clips(store, args.path, args.batch)
        print(json.dumps(result))
        if result['problems']:
            sys.exit(2)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'Clip export failed: {error}\n')


if __name__ == '__main__':
    main()
