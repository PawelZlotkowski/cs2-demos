"""Persistent footage and a leased queue for an optional host-side CS:DM recorder.

The container validates and serves real MP4s; it never pretends to render CS2.
Times are elapsed seconds from the saved replay's startTick, including freeze-end.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import time
import uuid

from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import Field
from starlette.concurrency import run_in_threadpool

from app.annotation.store import Conflict, encode, now
from app.models.annotation import StrictModel


class ClipRequest(StrictModel):
    anchor: float = Field(ge=0)
    before: float = Field(default=10, ge=0, le=60)
    after: float = Field(default=5, ge=0, le=60)


class Failure(StrictModel):
    error: str = Field(min_length=1, max_length=2000)


class RecordingProgress(StrictModel):
    stage: str = Field(pattern='^(preparing|analysing|capturing|encoding|uploading)$')
    captureWindow: int | None = Field(default=None, ge=0, le=128)
    captureWindows: int | None = Field(default=None, ge=1, le=128)


class SessionRequest(StrictModel):
    limit: int = Field(default=128, ge=1, le=128)


def probe_video(path: Path):
    probe = os.getenv('RR_FFPROBE_BIN') or shutil.which('ffprobe')
    if not probe:
        candidate = Path.home() / '.csdm/ffmpeg/bin/ffprobe.exe'
        if candidate.is_file():
            probe = str(candidate)
    if not probe:
        raise ValueError('ffprobe is required to validate footage. Docker includes it; native users can set RR_FFPROBE_BIN.')
    try:
        result = subprocess.run([probe, '-v', 'error', '-protocol_whitelist', 'file,pipe',
                                 '-show_streams', '-show_format', '-of', 'json', str(path)],
                                capture_output=True, text=True, timeout=30,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        raise ValueError('Footage validation could not finish. Check ffprobe and the selected MP4.') from None
    try:
        data = json.loads(result.stdout)
        streams = [s for s in data['streams'] if s.get('codec_type') == 'video']
        duration = float(data['format']['duration'])
        video = streams[0]
        if (result.returncode or not math.isfinite(duration) or duration <= 0
                or video['width'] <= 0 or video['height'] <= 0 or video['codec_name'] != 'h264'
                or video.get('pix_fmt') not in ('yuv420p', 'yuvj420p')
                or 'mp4' not in data['format'].get('format_name', '')):
            raise ValueError()
        return {'duration': duration, 'width': video['width'], 'height': video['height'],
                'fps': video.get('avg_frame_rate', '30/1'), 'codec': 'h264'}
    except (ValueError, KeyError, IndexError, TypeError):
        raise ValueError('Choose a readable H.264 MP4 with 8-bit 4:2:0 video (yuv420p).') from None


class Media:
    def __init__(self, store):
        self.store = store
        self.folder = store.root / 'footage'
        self.folder.mkdir(exist_ok=True)
        with store.connect() as con:
            con.execute('''CREATE TABLE IF NOT EXISTS footage (
              id TEXT PRIMARY KEY, demo TEXT NOT NULL, player TEXT NOT NULL, round INTEGER NOT NULL,
              state TEXT NOT NULL, metadata TEXT NOT NULL, lease TEXT, expires REAL)''')
            con.execute('CREATE TABLE IF NOT EXISTS recorder_status (id INTEGER PRIMARY KEY, seen REAL NOT NULL)')

    def heartbeat(self):
        with self.store.connect() as con:
            con.execute('INSERT INTO recorder_status VALUES(1,?) ON CONFLICT(id) DO UPDATE SET seen=excluded.seen', (time.time(),))
        return {'ok': True}

    def recorder_status(self):
        with self.store.connect() as con:
            row = con.execute('SELECT seen FROM recorder_status WHERE id=1').fetchone()
            active = con.execute("SELECT * FROM footage WHERE state='recording' AND expires>? LIMIT 1", (time.time(),)).fetchone()
        age = max(0, time.time()-row['seen']) if row else None
        return {'connected': age is not None and age < 20, 'lastSeenSeconds': round(age) if age is not None else None,
                'active': self.public(active) if active else None}

    def round(self, demo, player, rnd):
        snapshot = self.store.snapshot(demo, player)
        if not snapshot or rnd not in {r['number'] for r in snapshot['rounds']}:
            raise KeyError('Round not found for this player.')
        return json.loads((self.store.root / 'matches' / demo / 'rounds' / f'r{rnd}.json').read_text('utf-8'))

    @staticmethod
    def public(row, *, include_finding=False):
        metadata = json.loads(row['metadata'])
        if not include_finding:
            metadata.pop('finding', None)
        return {**metadata, 'id': row['id'], 'state': row['state'],
                'demo': row['demo'], 'player': row['player'], 'round': row['round'],
                'url': f"/api/footage/{row['id']}.mp4" if row['state'] == 'ready' else None}

    def get(self, identity):
        with self.store.connect() as con:
            row = con.execute('SELECT * FROM footage WHERE id=?', (identity,)).fetchone()
        if not row:
            raise KeyError('Footage not found.')
        return row

    def expire(self, con):
        con.execute("UPDATE footage SET state='failed',lease=NULL WHERE state='recording' AND expires<?", (time.time(),))

    def list(self, demo, player, rnd):
        self.round(demo, player, rnd)
        with self.store.connect() as con:
            self.expire(con)
            return [self.public(r) for r in con.execute(
                'SELECT * FROM footage WHERE demo=? AND player=? AND round=? ORDER BY rowid DESC', (demo, player, rnd))]

    def prepare(self, demo, player, rnd, value):
        replay = self.round(demo, player, rnd)
        if value.anchor > replay['durationSec']:
            raise ValueError('The decision is outside this round.')
        start = max(0., value.anchor - value.before)
        end = min(replay['durationSec'], value.anchor + value.after)
        ticks = [min(replay['endTick'], replay['startTick'] + round(t * replay['tickRate'])) for t in (start, end)]
        if ticks[1] <= ticks[0]:
            raise ValueError('Choose a non-empty context window.')
        metadata = {'source': 'csdm', 'anchor': value.anchor, 'requestedBefore': value.before,
                    'requestedAfter': value.after, 'startTick': ticks[0], 'endTick': ticks[1],
                    'start': (ticks[0] - replay['startTick']) / replay['tickRate'],
                    'end': (ticks[1] - replay['startTick']) / replay['tickRate'], 'createdAt': now(),
                    'alignmentConfirmed': False}
        return metadata

    def queue(self, demo, player, rnd, value):
        metadata = self.prepare(demo, player, rnd, value)
        identity = uuid.uuid4().hex
        with self.store.connect() as con:
            con.execute('INSERT INTO footage VALUES(?,?,?,?,?,?,NULL,NULL)',
                        (identity, demo, player, rnd, 'queued', encode(metadata)))
        return self.public(self.get(identity))

    def claim(self, limit=1, *, session=False):
        self.heartbeat()
        with self.store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            self.expire(con)
            # Only one CS2 capture may run, including across competing workers.
            if con.execute("SELECT 1 FROM footage WHERE state='recording'").fetchone():
                return None
            row = con.execute("""SELECT * FROM footage WHERE state='queued' AND
                (json_extract(metadata,'$.batchId') IS NULL OR EXISTS
                 (SELECT 1 FROM clip_batches b WHERE b.id=json_extract(footage.metadata,'$.batchId') AND b.paused=0))
                ORDER BY rowid LIMIT 1""").fetchone()
            if not row:
                return None
            rows = [row]
            batch = json.loads(row['metadata']).get('batchId')
            if session and batch:
                rows = con.execute("""SELECT * FROM footage WHERE state='queued' AND demo=? AND player=?
                    AND json_extract(metadata,'$.batchId')=?
                    ORDER BY CAST(json_extract(metadata,'$.startTick') AS INTEGER), rowid LIMIT ?""",
                    (row['demo'], row['player'], batch, limit)).fetchall()
            lease = uuid.uuid4().hex
            jobs = []
            for row in rows:
                metadata = {**json.loads(row['metadata']), 'stage': 'preparing', 'startedAt': now(),
                            'stageUpdatedAt': now(), 'sessionSize': len(rows)}
                metadata.pop('captureWindow', None)
                metadata.pop('captureWindows', None)
                con.execute("UPDATE footage SET state='recording',lease=?,expires=?,metadata=? WHERE id=?",
                            (lease, time.time() + 1800, encode(metadata), row['id']))
                jobs.append({**self.public(row), **{k: metadata[k] for k in ('stage', 'sessionSize')},
                             'state': 'recording', 'lease': lease,
                             'demoUrl': f"/api/recordings/{row['id']}/demo"})
            return jobs if session else jobs[0]

    def leased(self, identity, lease):
        row = self.get(identity)
        if row['state'] != 'recording' or row['lease'] != lease or row['expires'] < time.time():
            raise Conflict('Recording lease expired or was replaced. Retry this request.')
        return row


def install_media(app, store):
    media = Media(store)
    app.state.media = media
    prefix = '/api/demos/{demo}/players/{player}/rounds/{rnd}/footage'

    @app.get(prefix)
    def listing(demo: str, player: str, rnd: int):
        return media.list(demo, player, rnd)

    @app.post(prefix, status_code=202)
    def queue(demo: str, player: str, rnd: int, value: ClipRequest):
        return media.queue(demo, player, rnd, value)

    async def receive(request):
        path = media.folder / (uuid.uuid4().hex + '.upload')
        limit = int(os.getenv('RR_ANNOTATION_MAX_UPLOAD_MB', '2048')) * 1024 * 1024
        total, digest = 0, hashlib.sha256()
        try:
            with path.open('wb') as target:
                async for chunk in request.stream():
                    total += len(chunk)
                    if total > limit:
                        raise HTTPException(413, 'Footage exceeds the upload limit.')
                    if shutil.disk_usage(media.folder).free < len(chunk) + 512 * 1024 * 1024:
                        raise HTTPException(507, 'Not enough disk space for footage.')
                    target.write(chunk)
                    digest.update(chunk)
            info = await run_in_threadpool(probe_video, path)
            return path, {**info, 'sha256': digest.hexdigest(), 'bytes': total}
        except BaseException:
            path.unlink(missing_ok=True)
            raise

    @app.post(prefix + '/upload', status_code=201)
    async def upload(demo: str, player: str, rnd: int, request: Request, start: float = 0):
        replay = media.round(demo, player, rnd)
        if not math.isfinite(start) or start >= replay['durationSec']:
            raise ValueError('Video start must be a finite elapsed round time before its end.')
        path, info = await receive(request)
        identity = uuid.uuid4().hex
        try:
            if start + info['duration'] <= 0:
                raise ValueError('This footage does not overlap the round. Check the start offset.')
            metadata = {**info, 'source': 'upload', 'start': start, 'end': start + info['duration'],
                        'createdAt': now(), 'alignmentConfirmed': False}
            with store.connect() as con:
                con.execute('INSERT INTO footage VALUES(?,?,?,?,?,?,NULL,NULL)',
                            (identity, demo, player, rnd, 'ready', encode(metadata)))
                path.replace(media.folder / f'{identity}.mp4')
        finally:
            path.unlink(missing_ok=True)
        return media.public(media.get(identity))

    @app.get('/api/footage/{identity}.mp4')
    def video(identity: str):
        row = media.get(identity)
        path = media.folder / f"{row['id']}.mp4"
        if row['state'] != 'ready' or not path.is_file():
            raise KeyError('Footage is not ready.')
        return FileResponse(path, media_type='video/mp4')

    @app.post('/api/footage/{identity}/confirm')
    def confirm(identity: str):
        with store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = media.get(identity)
            if row['state'] != 'ready':
                raise Conflict('Wait for footage before confirming its player and timing.')
            metadata = {**json.loads(row['metadata']), 'alignmentConfirmed': True}
            con.execute('UPDATE footage SET metadata=? WHERE id=?', (encode(metadata), identity))
        return media.public(media.get(identity))

    @app.post('/api/recordings/claim')
    def claim():
        return media.claim()

    @app.post('/api/recordings/claim-session')
    def claim_session(value: SessionRequest):
        return media.claim(value.limit, session=True)

    @app.post('/api/recordings/session/renew')
    def renew(lease: str):
        with store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            result = con.execute("""UPDATE footage SET expires=?
                WHERE lease=? AND state='recording' AND expires>?""", (time.time()+1800, lease, time.time()))
            if not result.rowcount:
                raise Conflict('Recording session expired or finished.')
        return {'ok': True}

    @app.post('/api/recordings/session/progress')
    def session_progress(lease: str, value: RecordingProgress):
        with store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            rows = con.execute("SELECT * FROM footage WHERE lease=? AND state='recording' AND expires>?",
                               (lease, time.time())).fetchall()
            if not rows:
                raise Conflict('Recording session expired or finished.')
            for row in rows:
                metadata = {**json.loads(row['metadata']), **value.model_dump(exclude_none=True), 'stageUpdatedAt': now()}
                con.execute('UPDATE footage SET metadata=? WHERE id=?', (encode(metadata), row['id']))
        return {'ok': True}

    @app.post('/api/recordings/heartbeat')
    def heartbeat():
        return media.heartbeat()

    @app.get('/api/recordings/status')
    def recorder_status():
        return media.recorder_status()

    @app.post('/api/recordings/{identity}/progress')
    def progress(identity: str, lease: str, value: RecordingProgress):
        with store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = media.leased(identity, lease)
            metadata = {**json.loads(row['metadata']), **value.model_dump(exclude_none=True), 'stageUpdatedAt': now()}
            con.execute('UPDATE footage SET metadata=? WHERE id=?', (encode(metadata), identity))
        return {'ok': True}

    @app.get('/api/recordings/{identity}/demo')
    def demo_file(identity: str):
        row = media.get(identity)
        path = store.root / 'matches' / row['demo'] / 'source.dem'
        if not path.is_file():
            raise KeyError('The decompressed source demo is missing.')
        return FileResponse(path, media_type='application/octet-stream')

    @app.post('/api/recordings/{identity}/upload')
    async def recorded(identity: str, lease: str, request: Request):
        media.leased(identity, lease)
        path, info = await receive(request)
        try:
            with store.connect() as con:
                con.execute('BEGIN IMMEDIATE')
                row = media.leased(identity, lease)
                metadata = json.loads(row['metadata'])
                expected = metadata['end'] - metadata['start']
                if abs(info['duration'] - expected) > max(1., expected * .05):
                    raise ValueError('Recorded duration differs from the requested window. Check capture timing before retrying.')
                metadata.update(info)
                metadata['videoEnd'] = metadata['start'] + info['duration']
                con.execute("UPDATE footage SET state='ready',metadata=?,lease=NULL,expires=NULL WHERE id=?", (encode(metadata), identity))
                path.replace(media.folder / f'{identity}.mp4')
        finally:
            path.unlink(missing_ok=True)
        return media.public(media.get(identity))

    @app.post('/api/recordings/{identity}/fail')
    def failed(identity: str, lease: str, value: Failure):
        with store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = media.leased(identity, lease)
            metadata = {**json.loads(row['metadata']), 'error': value.error}
            con.execute("UPDATE footage SET state='failed',metadata=?,lease=NULL,expires=NULL WHERE id=?", (encode(metadata), identity))
        return media.public(media.get(identity))

    @app.post('/api/recordings/{identity}/retry')
    def retry(identity: str):
        with store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            media.expire(con)
            row = con.execute('SELECT * FROM footage WHERE id=?', (identity,)).fetchone()
            if not row:
                raise KeyError('Recording not found.')
            if row['state'] != 'failed' or json.loads(row['metadata'])['source'] != 'csdm':
                raise Conflict('Only failed recordings can be retried.')
            metadata = json.loads(row['metadata'])
            metadata.pop('error', None)
            con.execute("UPDATE footage SET state='queued',metadata=?,lease=NULL,expires=NULL WHERE id=?", (encode(metadata), identity))
        return media.public(media.get(identity))
