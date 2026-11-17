"""Idempotent selected-player capture batches and separate candidate-first labels."""
from __future__ import annotations

from collections import Counter
import hashlib
import json
from typing import Literal

from fastapi.responses import Response
from pydantic import Field, model_validator

from app.annotation.media import Media, ClipRequest
from app.annotation.examples import ExampleQuery, coach_examples
from app.annotation.grouping import GROUPING_VERSION, group_moments, review_key
from app.annotation.store import Conflict, encode, now
from app.models.annotation import StrictModel


class BatchRequest(StrictModel):
    before: float = Field(default=10, ge=0, le=60)
    after: float = Field(default=5, ge=0, le=60)

    @model_validator(mode='after')
    def nonempty(self):
        if self.before + self.after <= 0:
            raise ValueError('Choose a non-empty context window.')
        return self


class BatchControl(StrictModel):
    paused: bool


class ClipLabel(StrictModel):
    previousRevision: int | None = None
    status: Literal['draft', 'complete'] = 'draft'
    verdict: Literal['correct', 'wrong', 'unsure'] | None = None
    assessment: Literal['mistake', 'good', 'neutral', 'uncertain'] | None = None
    notes: str = ''
    language: Literal['en', 'pl'] = 'en'
    inputMode: Literal['structured', 'note'] = 'structured'
    confirmFootage: bool = False


class Batches:
    def __init__(self, store):
        self.store, self.media = store, Media(store)

    def get(self, identity):
        with self.store.connect() as con:
            row = con.execute('SELECT * FROM clip_batches WHERE id=?', (identity,)).fetchone()
        if not row:
            raise KeyError('Clip batch not found.')
        return {**dict(row), 'metadata': json.loads(row['metadata'])}

    def create(self, demo, player, value):
        snapshot = self.store.snapshot(demo, player)
        if not snapshot:
            raise Conflict('Prepare this player before recording detected moments.')
        # Identical requests converge even across tabs/restarts. A new context
        # creates a new batch and pauses unstarted work from its predecessor.
        identity = hashlib.sha256(encode([demo, player, snapshot['id'], float(value.before), float(value.after), GROUPING_VERSION]).encode()).hexdigest()[:32]
        moments = []
        for finding in sorted(snapshot['findings'], key=lambda f: (f['round'], f['t'], f['id'])):
            metadata = self.media.prepare(demo, player, finding['round'],
                                          ClipRequest(anchor=finding['t'], before=value.before, after=value.after))
            metadata.update(batchId=identity, snapshotId=snapshot['id'], finding=finding)
            moments.append(metadata)
        records = []
        for metadata in group_moments(moments):
            clip_id = hashlib.sha256(encode([identity, review_key(metadata)]).encode()).hexdigest()[:32]
            records.append((clip_id, demo, player, metadata['finding']['round'], 'queued', encode(metadata)))
        with self.store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            if not con.execute('SELECT 1 FROM clip_batches WHERE id=?', (identity,)).fetchone():
                con.execute('UPDATE clip_batches SET paused=1 WHERE demo=? AND player=?', (demo, player))
                con.execute('INSERT INTO clip_batches VALUES(?,?,?,?,?,0)',
                            (identity, demo, player, snapshot['id'], encode({**value.model_dump(), 'groupingVersion': GROUPING_VERSION, 'createdAt': now()})))
                con.executemany('INSERT INTO footage VALUES(?,?,?,?,?,?,NULL,NULL)', records)
            con.execute('INSERT INTO clip_selection VALUES(?,?,?) ON CONFLICT(demo,player) DO UPDATE SET batch=excluded.batch',
                        (demo, player, identity))
        return self.summary(identity)

    def rows(self, identity, con):
        return con.execute("SELECT * FROM footage WHERE json_extract(metadata,'$.batchId')=? ORDER BY round, json_extract(metadata,'$.anchor'), rowid", (identity,)).fetchall()

    def summary(self, identity, labeller=None):
        batch = self.get(identity)
        with self.store.connect() as con:
            self.media.expire(con)
            rows = self.rows(identity, con)
            counts = Counter(r['state'] for r in rows)
            completed = 0
            if labeller:
                self.store.labeller(labeller)
                for row in rows:
                    label = self.current(batch, review_key(json.loads(row['metadata'])), labeller, con)
                    completed += bool(label and label['status'] == 'complete')
        return {'id': identity, 'demo': batch['demo'], 'player': batch['player'], 'snapshotId': batch['snapshot'],
                **batch['metadata'], 'paused': bool(batch['paused']), 'total': len(rows),
                'counts': dict(counts), 'completed': completed}

    def current(self, batch, finding, labeller, con):
        row = con.execute('SELECT id,payload,created FROM clip_labels WHERE demo=? AND player=? AND snapshot=? AND finding=? AND labeller=? ORDER BY id DESC LIMIT 1',
                          (batch['demo'], batch['player'], batch['snapshot'], finding, labeller)).fetchone()
        return {**json.loads(row['payload']), 'revision': row['id'], 'savedAt': row['created']} if row else None

    def review(self, identity, labeller):
        self.store.labeller(labeller)
        batch = self.get(identity)
        with self.store.connect() as con:
            self.media.expire(con)
            rows = self.rows(identity, con)
            result = []
            for row in rows:
                clip = self.media.public(row, include_finding=True)
                con.execute('INSERT OR IGNORE INTO candidate_exposure VALUES(?,?,?,?,?)',
                            (batch['demo'], batch['player'], row['round'], labeller, now()))
                result.append({**clip, 'label': self.current(batch, review_key(clip), labeller, con)})
        return result

    def save(self, identity, clip_id, labeller, value):
        self.store.labeller(labeller)
        batch = self.get(identity)
        row = self.media.get(clip_id)
        clip = self.media.public(row, include_finding=True)
        if clip.get('batchId') != identity:
            raise ValueError('This clip does not belong to the selected batch.')
        if row['state'] != 'ready':
            raise Conflict('Wait until this recording is ready before labelling it.')
        if value.status == 'complete':
            missing = []
            if not clip['alignmentConfirmed'] and not value.confirmFootage:
                missing.append('confirm this clip’s player and event timing in step 1')
            if value.inputMode == 'note' and not value.notes.strip():
                missing.append('write a note about this clip')
            if value.inputMode == 'structured' and not value.verdict:
                missing.append('choose a detection verdict in step 2')
            if value.inputMode == 'structured' and not value.assessment:
                missing.append('choose a decision assessment in step 3')
            if missing:
                raise ValueError('Still needed: ' + '; '.join(missing) + '.')
        with self.store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            old = self.current(batch, review_key(clip), labeller, con)
            if value.previousRevision != (old['revision'] if old else None):
                fields = value.model_dump(exclude={'previousRevision', 'confirmFootage'})
                if (value.confirmFootage or value.inputMode == 'note') and old and old['footage']['id'] == clip_id and all(
                    old.get(k, 'structured' if k == 'inputMode' else None) == v for k, v in fields.items()
                ):
                    return old
                raise Conflict('This clip label changed in another tab. Reload its saved label before editing.')
            if value.status == 'complete' and value.confirmFootage and not clip['alignmentConfirmed']:
                con.execute("""UPDATE footage SET metadata=json_set(metadata,'$.alignmentConfirmed',json('true'))
                               WHERE id=?""", (clip_id,))
                clip['alignmentConfirmed'] = True
            metadata = self.store.demo(batch['demo'])
            payload = {**value.model_dump(exclude={'previousRevision', 'confirmFootage'}), 'schemaVersion': 2,
                       'reviewMode': 'candidate-first', 'matchId': batch['demo'], 'playerId': batch['player'],
                       'snapshotId': batch['snapshot'], 'round': row['round'], 'labeller': labeller,
                       'finding': clip['finding'], 'footage': clip, 'provenance': metadata['provenance']}
            con.execute('INSERT OR IGNORE INTO candidate_exposure VALUES(?,?,?,?,?)',
                        (batch['demo'], batch['player'], row['round'], labeller, now()))
            con.execute('INSERT INTO clip_labels(demo,player,snapshot,finding,labeller,payload,created) VALUES(?,?,?,?,?,?,?)',
                        (batch['demo'], batch['player'], batch['snapshot'], review_key(clip), labeller, encode(payload), now()))
            return self.current(batch, review_key(clip), labeller, con)


def install_batches(app, store):
    batches = Batches(store)
    app.state.batches = batches
    prefix = '/api/demos/{demo}/players/{player}/clip-batch'

    @app.post('/api/coach-examples')
    def examples(value: ExampleQuery):
        return coach_examples(store, value)

    @app.get('/api/next-ready-clip')
    def next_ready(labeller: str):
        store.labeller(labeller)
        with store.connect() as con:
            row = con.execute("""
                SELECT f.demo, f.player, f.id AS clip FROM clip_selection s
                JOIN footage f ON json_extract(f.metadata,'$.batchId')=s.batch
                WHERE f.state='ready' AND COALESCE((
                    SELECT json_extract(c.payload,'$.status') FROM clip_labels c
                    WHERE c.demo=f.demo AND c.player=f.player AND c.labeller=?
                      AND c.snapshot=json_extract(f.metadata,'$.snapshotId')
                      AND c.finding=COALESCE(json_extract(f.metadata,'$.reviewKey'),json_extract(f.metadata,'$.finding.id'))
                    ORDER BY c.id DESC LIMIT 1
                ),'')!='complete'
                ORDER BY s.rowid DESC, f.round, json_extract(f.metadata,'$.anchor'), f.id LIMIT 1
            """, (labeller,)).fetchone()
        return dict(row) if row else None

    @app.post(prefix, status_code=202)
    def create(demo: str, player: str, value: BatchRequest):
        return batches.create(demo, player, value)

    @app.get(prefix)
    def latest(demo: str, player: str, labeller: str):
        store.demo(demo)
        store.labeller(labeller)
        with store.connect() as con:
            row = con.execute('SELECT batch AS id FROM clip_selection WHERE demo=? AND player=?', (demo, player)).fetchone()
        return batches.summary(row['id'], labeller) if row else None

    @app.post('/api/clip-batches/{identity}/review')
    def review(identity: str, labeller: str):
        return batches.review(identity, labeller)

    @app.get('/api/clip-batches/{identity}/queue')
    def queue(identity: str):
        batches.get(identity)
        with store.connect() as con:
            batches.media.expire(con)
            return [batches.media.public(row) for row in batches.rows(identity, con)]

    @app.get('/api/clip-batches/{identity}')
    def summary(identity: str, labeller: str):
        return batches.summary(identity, labeller)

    @app.put('/api/clip-batches/{identity}/clips/{clip}/label')
    def label(identity: str, clip: str, labeller: str, value: ClipLabel):
        return batches.save(identity, clip, labeller, value)

    @app.put('/api/clip-batches/{identity}')
    def control(identity: str, value: BatchControl):
        batches.get(identity)
        with store.connect() as con:
            con.execute('UPDATE clip_batches SET paused=? WHERE id=?', (int(value.paused), identity))
        return batches.summary(identity)

    @app.post('/api/clip-batches/{identity}/retry-failed')
    def retry_failed(identity: str):
        batches.get(identity)
        with store.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            batches.media.expire(con)
            for row in batches.rows(identity, con):
                if row['state'] == 'failed':
                    metadata = json.loads(row['metadata'])
                    metadata.pop('error', None)
                    con.execute("UPDATE footage SET state='queued',metadata=?,lease=NULL,expires=NULL WHERE id=?", (encode(metadata), row['id']))
        return batches.summary(identity)

    @app.get('/api/clip-labels/export')
    def export(labeller: str, training: bool = False, split: Literal['unassigned', 'train', 'val', 'test'] | None = None):
        store.labeller(labeller)
        with store.connect() as con:
            rows = con.execute('SELECT payload FROM clip_labels WHERE id IN (SELECT MAX(id) FROM clip_labels WHERE labeller=? GROUP BY demo,player,snapshot,finding)', (labeller,)).fetchall()
        labels = []
        for row in rows:
            label = json.loads(row['payload'])
            provenance = store.demo(label['matchId'])['provenance']
            if split and provenance['split'] != split:
                continue
            if label['status'] != 'complete' or (training and (provenance['split'] != 'train' or not provenance['trainingPermitted'])):
                continue
            labels.append({**label, 'provenance': provenance})
        return Response(''.join(encode(v)+'\n' for v in labels), media_type='application/x-ndjson',
                        headers={'Content-Disposition': f'attachment; filename="clip-labels-{labeller}.jsonl"'})
