"""Portable note exchange and complete workspace backups, run inside Docker."""
from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import tempfile
import uuid
from zipfile import BadZipFile, ZipFile, ZIP_DEFLATED, ZIP_STORED

from app.annotation.batches import ClipLabel
from app.annotation.grouping import review_key
from app.annotation.store import Conflict, Store, encode, now
from app.models.annotation import Provenance, ReviewSave, validate_clip_group

NOTE_FORMAT = 'round-reviewer-notes-v1'
BACKUP_FORMAT = 'round-reviewer-workspace-v1'


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def transfer_schema(con):
    con.executescript("""
        CREATE TABLE IF NOT EXISTS workspace_identity (
            singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS note_imports (
            origin TEXT NOT NULL, kind TEXT NOT NULL, label_key TEXT NOT NULL,
            remote_revision INTEGER NOT NULL, local_revision INTEGER NOT NULL,
            digest TEXT NOT NULL, PRIMARY KEY(origin,kind,label_key)
        );
    """)
    con.execute('INSERT OR IGNORE INTO workspace_identity VALUES(1,?)', (uuid.uuid4().hex,))
    con.commit()


def export_notes(store: Store, output: Path, labeller: str):
    store.labeller(labeller)
    labels = []
    with store.connect() as con:
        transfer_schema(con)
        con.execute('BEGIN')
        origin = con.execute('SELECT id FROM workspace_identity').fetchone()[0]
        for kind, table, group in (
            ('clip', 'clip_labels', 'demo,player,snapshot,finding,labeller'),
            ('round', 'revisions', 'demo,player,round,labeller'),
        ):
            rows = con.execute(f"""SELECT id,payload,created FROM {table} WHERE id IN (
                SELECT MAX(id) FROM {table} WHERE labeller=? GROUP BY {group})""", (labeller,)).fetchall()
            for row in rows:
                value = json.loads(row['payload'])
                if value.get('importOrigin'):
                    continue
                labels.append({'kind': kind, 'revision': row['id'], 'savedAt': row['created'], 'label': value})
        identities = sorted({entry['label']['matchId'] for entry in labels})
        demos = {}
        for identity in identities:
            row = con.execute('SELECT metadata,provenance FROM demos WHERE id=?', (identity,)).fetchone()
            demos[identity] = {'metadata': json.loads(row['metadata']), 'provenance': json.loads(row['provenance'])}
    payload = {'format': NOTE_FORMAT, 'origin': origin, 'labeller': labeller,
               'exportedAt': now(), 'demos': demos, 'labels': labels}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.partial')
    try:
        temporary.write_text(encode(payload), encoding='utf-8')
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return {'file': str(output), 'reviews': len(labels), 'demos': len(demos)}


def validate_notes(payload):
    if payload.get('format') != NOTE_FORMAT or not re.fullmatch(r'[a-f0-9]{32}', payload.get('origin', '')):
        raise ValueError('Choose a Round Reviewer notes export.')
    Store.labeller(payload['labeller'])
    demos = payload['demos']
    for identity, demo in demos.items():
        metadata = demo['metadata']
        if (not re.fullmatch(r'demo-[a-f0-9]{64}', identity)
                or metadata['id'] != identity or metadata['sha256'] != identity[5:]
                or metadata['map'] not in ('de_ancient', 'de_anubis')):
            raise ValueError('Invalid source demo identity in notes.')
        demo['provenance'] = Provenance.model_validate(demo['provenance']).model_dump()
    seen = set()
    for entry in payload['labels']:
        label = entry['label']
        if entry['kind'] not in ('clip', 'round') or type(entry['revision']) is not int or entry['revision'] < 1:
            raise ValueError('Invalid note revision.')
        if label['labeller'] != payload['labeller'] or label['matchId'] not in demos:
            raise ValueError('The reviewer or source demo is missing from this notes export.')
        roster = demos[label['matchId']]['metadata']['players']
        if label['playerId'] not in {p['id'] for p in roster} or type(label['round']) is not int or label['round'] < 1:
            raise ValueError('The note belongs to a player or round outside its source.')
        if not isinstance(label['snapshotId'], str) or not label['snapshotId']:
            raise ValueError('The note has no detector snapshot identity.')
        if entry['kind'] == 'clip':
            request = ClipLabel.model_validate({k: label[k] for k in ClipLabel.model_fields if k in label})
            if label['finding']['round'] != label['round'] or not re.fullmatch(r'F\d+', label['finding']['id']):
                raise ValueError('The finding and clip round disagree.')
            if not isinstance(label['finding']['evidence'], dict) or not isinstance(label['finding']['detector'], str):
                raise ValueError('The note is missing detector evidence.')
            if not re.fullmatch(r'[a-f0-9]{32}', label['footage']['id']):
                raise ValueError('Invalid clip identity.')
            validate_clip_group(label['finding'], label['footage'], label['round'])
            if request.status == 'complete' and (
                label['footage'].get('alignmentConfirmed') is not True
                or (not request.notes.strip() and not (request.verdict and request.assessment))
            ):
                raise ValueError('A completed note needs confirmed footage and a note or both ratings.')
        else:
            fields = {k: label[k] for k in ReviewSave.model_fields if k in label}
            fields['moments'] = [{k: v for k, v in moment.items() if k != 'ticks'} for moment in fields.get('moments', [])]
            review = ReviewSave.model_validate(fields)
            if review.status == 'complete' and not (review.fullRoundReviewed and review.independentComplete):
                raise ValueError('A completed round needs its review confirmations.')
        key = label_key(entry)
        if (entry['kind'], key) in seen:
            raise ValueError('Duplicate review in the notes export.')
        seen.add((entry['kind'], key))


def label_key(entry):
    label = entry['label']
    parts = [label['matchId'], label['playerId'], label['labeller']]
    parts += [label['snapshotId'], review_key(label['footage'], label['finding'])] if entry['kind'] == 'clip' else [label['round']]
    return encode(parts)


def import_notes(store: Store, source: Path):
    if source.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('This notes file exceeds 64 MB. Export reviewers separately.')
    payload = json.loads(source.read_text(encoding='utf-8-sig'))
    validate_notes(payload)
    counts = {'imported': 0, 'unchanged': 0}
    with store.connect() as con:
        transfer_schema(con)
        con.execute('BEGIN IMMEDIATE')
        for identity, incoming in payload['demos'].items():
            existing = con.execute('SELECT metadata,provenance FROM demos WHERE id=?', (identity,)).fetchone()
            provenance = incoming['provenance']
            if existing:
                current = json.loads(existing['provenance'])
                if (current['split'] != 'unassigned' and provenance['split'] != 'unassigned'
                        and current['split'] != provenance['split']):
                    raise Conflict('The source match has a different dataset split on this PC.')
                if current['sourceMatchId'] and provenance['sourceMatchId'] and current['sourceMatchId'] != provenance['sourceMatchId']:
                    raise Conflict('The source match identity differs on this PC.')
                if current['trainingPermitted'] and not provenance['trainingPermitted']:
                    current['trainingPermitted'] = False
                    con.execute('UPDATE demos SET provenance=? WHERE id=?', (encode(current), identity))
            else:
                for other in con.execute('SELECT provenance FROM demos'):
                    p = json.loads(other[0])
                    if provenance['sourceMatchId'] and p['sourceMatchId'] == provenance['sourceMatchId'] and p['split'] != provenance['split']:
                        raise Conflict('Another recording of this source match has a different split.')
                metadata = {**incoming['metadata'], 'notesOnly': True}
                con.execute('INSERT INTO demos VALUES(?,?,?)', (identity, encode(metadata), encode(provenance)))
        for entry in payload['labels']:
            label = entry['label']
            key = label_key(entry)
            checksum = hashlib.sha256(encode(label).encode()).hexdigest()
            origin = payload['origin']
            known = con.execute('SELECT * FROM note_imports WHERE origin=? AND kind=? AND label_key=?',
                                (origin, entry['kind'], key)).fetchone()
            if known and entry['revision'] <= known['remote_revision']:
                if entry['revision'] == known['remote_revision'] and checksum != known['digest']:
                    raise Conflict('A previously imported revision was changed. Export again from its source.')
                counts['unchanged'] += 1
                continue
            table = 'clip_labels' if entry['kind'] == 'clip' else 'revisions'
            clause = 'demo=? AND player=? AND labeller=?'
            args = [label['matchId'], label['playerId'], label['labeller']]
            if entry['kind'] == 'clip':
                clause += ' AND snapshot=? AND finding=?'
                args += [label['snapshotId'], review_key(label['footage'], label['finding'])]
            else:
                clause += ' AND round=?'
                args += [label['round']]
            current = con.execute(f'SELECT id FROM {table} WHERE {clause} ORDER BY id DESC LIMIT 1', args).fetchone()
            if current and (known is None or current['id'] != known['local_revision']):
                raise Conflict('This reviewer has a newer or independent local edit. Keep their handle unique across PCs.')
            value = {**label, 'importOrigin': {'workspace': origin, 'revision': entry['revision'],
                                             'receivedAt': now()}}
            columns = 'demo,player,labeller,snapshot,finding' if entry['kind'] == 'clip' else 'demo,player,labeller,round'
            placeholders = ','.join('?' for _ in args)
            cursor = con.execute(f'INSERT INTO {table}({columns},payload,created) VALUES({placeholders},?,?)',
                                 (*args, encode(value), entry['savedAt']))
            con.execute("""INSERT INTO note_imports VALUES(?,?,?,?,?,?) ON CONFLICT(origin,kind,label_key)
                DO UPDATE SET remote_revision=excluded.remote_revision,local_revision=excluded.local_revision,digest=excluded.digest""",
                        (origin, entry['kind'], key, entry['revision'], cursor.lastrowid, checksum))
            counts['imported'] += 1
    return counts


def backup(root: Path, output: Path):
    root = root.resolve()
    if output.resolve().is_relative_to(root):
        raise ValueError('Save the backup outside the data directory.')
    if not (root / 'annotations.sqlite3').is_file():
        raise ValueError('No labeller workspace to back up.')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.partial')
    try:
        with ZipFile(temporary, 'w', compression=ZIP_DEFLATED, compresslevel=1, allowZip64=True) as archive:
            files = {}
            for path in sorted(root.rglob('*')):
                if path.is_symlink():
                    raise ValueError('Workspace backups do not follow symlinks.')
                if not path.is_file() or 'voice-temp' in path.relative_to(root).parts:
                    continue
                name = path.relative_to(root).as_posix()
                before = path.stat()
                files[name] = {'sha256': digest(path), 'bytes': before.st_size}
                archive.write(path, name, compress_type=ZIP_STORED if path.suffix in ('.mp4', '.zst') else ZIP_DEFLATED)
                after = path.stat()
                if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns:
                    raise Conflict('The workspace changed during backup. Stop the labeller and recorder first.')
            archive.writestr('backup-manifest.json', encode({'format': BACKUP_FORMAT, 'createdAt': now(), 'files': files}))
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return {'file': str(output), 'files': len(files), 'bytes': output.stat().st_size}


def restore(root: Path, source: Path):
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    if any(root.iterdir()):
        raise Conflict('Restore into an empty workspace. Select a new LABELER_PROJECT to keep the current workspace.')
    with ZipFile(source) as archive:
        manifest = json.loads(archive.read('backup-manifest.json'))
        if manifest['format'] != BACKUP_FORMAT or 'annotations.sqlite3' not in manifest['files']:
            raise ValueError('Choose a Round Reviewer workspace backup.')
        names = [entry.filename for entry in archive.infolist()]
        if len(names) != len(set(names)) or set(names) != set(manifest['files']) | {'backup-manifest.json'}:
            raise ValueError('The backup file list is inconsistent.')
        for name in manifest['files']:
            path = PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name or path.as_posix() != name:
                raise ValueError('The backup contains an invalid path.')
        required = sum(entry['bytes'] for entry in manifest['files'].values())
        if required > shutil.disk_usage(root).free:
            raise ValueError('There is insufficient disk space to restore this workspace.')
        with tempfile.TemporaryDirectory(prefix='label-restore-', dir=root) as temporary:
            stage = Path(temporary)
            for name, expected in manifest['files'].items():
                info = archive.getinfo(name)
                if info.file_size != expected['bytes']:
                    raise ValueError('The backup size does not match its manifest.')
                target = stage / name
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(name) as src, target.open('wb') as dest:
                    shutil.copyfileobj(src, dest, length=1024*1024)
                if digest(target) != expected['sha256']:
                    raise ValueError('The backup checksum failed.')
            with closing(sqlite3.connect((stage / 'annotations.sqlite3').as_uri() + '?mode=ro', uri=True)) as con:
                if con.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise ValueError('The backup database failed its integrity check.')
            # Activation is last. A failed validation leaves the destination empty.
            activated = []
            try:
                for path in stage.iterdir():
                    target = root / path.name
                    path.replace(target)
                    activated.append(target)
            except OSError:
                for path in reversed(activated):
                    path.replace(stage / path.name)
                raise
    return {'restored': len(manifest['files'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['export-notes', 'import-notes', 'backup', 'restore'])
    parser.add_argument('path', type=Path)
    parser.add_argument('--labeller')
    args = parser.parse_args()
    root = Path(os.getenv('RR_ANNOTATION_DIR', '.local/annotation'))
    try:
        if args.command == 'backup':
            result = backup(root, args.path)
        elif args.command == 'restore':
            result = restore(root, args.path)
        elif args.command == 'export-notes':
            if not args.labeller:
                parser.error('export-notes needs --labeller NAME')
            result = export_notes(Store(root), args.path, args.labeller)
        else:
            result = import_notes(Store(root), args.path)
        print(json.dumps(result))
    except (OSError, ValueError, KeyError, TypeError, BadZipFile, sqlite3.Error) as error:
        parser.exit(1, f'Label transfer failed: {error}\n')


if __name__ == '__main__':
    main()
