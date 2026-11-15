"""Transactional annotation storage; each save appends an immutable revision."""
from __future__ import annotations

import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models.annotation import Provenance, ReviewSave


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


class Conflict(ValueError):
    pass


class Store:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        for name in ('uploads', 'jobs', 'matches'):
            (self.root / name).mkdir(exist_ok=True)
        self.db = self.root / 'annotations.sqlite3'
        with self.connect() as con:
            con.execute('PRAGMA journal_mode=WAL')
            con.executescript('''
                CREATE TABLE IF NOT EXISTS demos (
                  id TEXT PRIMARY KEY, metadata TEXT NOT NULL, provenance TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs (
                  id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL,
                  payload TEXT NOT NULL, result TEXT, error TEXT, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS snapshots (
                  demo TEXT NOT NULL, player TEXT NOT NULL, payload TEXT NOT NULL,
                  PRIMARY KEY(demo, player));
                CREATE TABLE IF NOT EXISTS revisions (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, demo TEXT NOT NULL,
                  player TEXT NOT NULL, round INTEGER NOT NULL, labeller TEXT NOT NULL,
                  payload TEXT NOT NULL, created TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS review_key ON revisions(demo,player,round,labeller,id);
                CREATE TABLE IF NOT EXISTS clip_batches (
                  id TEXT PRIMARY KEY, demo TEXT NOT NULL, player TEXT NOT NULL,
                  snapshot TEXT NOT NULL, metadata TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS clip_labels (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, demo TEXT NOT NULL, player TEXT NOT NULL,
                  snapshot TEXT NOT NULL, finding TEXT NOT NULL, labeller TEXT NOT NULL,
                  payload TEXT NOT NULL, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS clip_selection (
                  demo TEXT NOT NULL, player TEXT NOT NULL, batch TEXT NOT NULL,
                  PRIMARY KEY(demo,player));
                CREATE INDEX IF NOT EXISTS clip_label_key ON clip_labels(demo,player,snapshot,finding,labeller,id);
                CREATE TABLE IF NOT EXISTS candidate_exposure (
                  demo TEXT NOT NULL, player TEXT NOT NULL, round INTEGER NOT NULL,
                  labeller TEXT NOT NULL, created TEXT NOT NULL,
                  PRIMARY KEY(demo,player,round,labeller));
            ''')

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.db, timeout=20)
        con.row_factory = sqlite3.Row
        try:
            yield con
            con.commit()
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()

    @staticmethod
    def labeller(name: str) -> str:
        if not re.fullmatch(r'[A-Za-z0-9_]{1,40}', name):
            raise ValueError('Labeller must contain 1–40 letters, digits or underscores.')
        return name

    def demos(self):
        with self.connect() as con:
            return [{**json.loads(r['metadata']), 'provenance': json.loads(r['provenance'])}
                    for r in con.execute('SELECT * FROM demos ORDER BY rowid DESC')]

    def demo(self, identity: str):
        with self.connect() as con:
            r = con.execute('SELECT * FROM demos WHERE id=?', (identity,)).fetchone()
        if not r:
            raise KeyError('Demo not found.')
        return {**json.loads(r['metadata']), 'provenance': json.loads(r['provenance'])}

    def register(self, metadata: dict):
        with self.connect() as con:
            con.execute('INSERT OR IGNORE INTO demos VALUES (?,?,?)',
                        (metadata['id'], encode(metadata), encode(Provenance().model_dump())))

    def set_provenance(self, identity: str, value: Provenance):
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute('SELECT provenance FROM demos WHERE id=?', (identity,)).fetchone()
            if not row:
                raise KeyError('Demo not found.')
            old = json.loads(row['provenance'])
            # Once assigned and reviewed, the research partition is fixed.
            reviewed = con.execute('SELECT 1 FROM revisions WHERE demo=? LIMIT 1', (identity,)).fetchone()
            reviewed = reviewed or con.execute('SELECT 1 FROM clip_labels WHERE demo=? LIMIT 1', (identity,)).fetchone()
            if reviewed and old['split'] != 'unassigned' and (
                old['split'] != value.split or old['sourceMatchId'] != value.sourceMatchId
            ):
                raise Conflict('This reviewed match has a frozen split and source match identity.')
            if value.sourceMatchId:
                for other in con.execute('SELECT id,provenance FROM demos WHERE id != ?', (identity,)):
                    p = json.loads(other['provenance'])
                    if p['sourceMatchId'] == value.sourceMatchId and p['split'] != value.split:
                        raise Conflict('Another recording of this source match has a different split.')
            con.execute('UPDATE demos SET provenance=? WHERE id=?', (encode(value.model_dump()), identity))

    def snapshot(self, demo: str, player: str):
        self.demo(demo)
        with self.connect() as con:
            r = con.execute('SELECT payload FROM snapshots WHERE demo=? AND player=?', (demo, player)).fetchone()
        return json.loads(r['payload']) if r else None

    def add_snapshot(self, demo: str, player: str, snapshot: dict):
        with self.connect() as con:
            con.execute('INSERT OR IGNORE INTO snapshots VALUES (?,?,?)', (demo, player, encode(snapshot)))

    def current(self, demo: str, player: str, rnd: int, labeller: str, con=None):
        name = self.labeller(labeller)
        if con is None:
            with self.connect() as db:
                return self.current(demo, player, rnd, name, db)
        row = con.execute('SELECT id,payload,created FROM revisions WHERE demo=? AND player=? AND round=? AND labeller=? ORDER BY id DESC LIMIT 1',
                          (demo, player, rnd, name)).fetchone()
        return {**json.loads(row['payload']), 'revision': row['id'], 'savedAt': row['created']} if row else None

    def save(self, demo: str, player: str, rnd: int, labeller: str, request: ReviewSave):
        meta = self.demo(demo)
        snapshot = self.snapshot(demo, player)
        if not snapshot:
            raise ValueError('Choose a player and finish parsing first.')
        round_meta = next((r for r in snapshot['rounds'] if r['number'] == rnd), None)
        if not round_meta:
            raise ValueError('Round not found for this player.')
        replay = json.loads((self.root / 'matches' / demo / 'rounds' / f'r{rnd}.json').read_text('utf-8'))
        candidates = {f['id']: f for f in snapshot['findings'] if f['round'] == rnd}
        evidence = {e['id'] for e in replay['events']}
        value = request.model_dump(exclude={'previousRevision'})
        footage = {}
        if any(m.footageId for m in request.moments):
            from app.annotation.media import Media
            media = Media(self)
            for m in request.moments:
                if not m.footageId:
                    continue
                row = media.get(m.footageId)
                clip = media.public(row)
                if (row['demo'], row['player'], row['round'], row['state']) != (demo, player, rnd, 'ready'):
                    raise ValueError('Footage evidence must belong to this player and round and be ready.')
                if not clip['alignmentConfirmed']:
                    raise ValueError('Verify the footage player and timing before attaching it as evidence.')
                if clip['start'] > m.start + .05 or clip['start'] + clip['duration'] < m.end - .05:
                    raise ValueError('Footage evidence must cover the whole marked moment.')
                footage[m.footageId] = clip
        value['footageEvidence'] = footage
        if len({m.id for m in request.moments}) != len(request.moments):
            raise ValueError('Moment IDs must be unique within a review.')
        for m in request.moments:
            if m.end > round_meta['durationSec']:
                raise ValueError('A moment extends beyond the round.')
            if not set(m.evidence) <= evidence:
                raise ValueError('Unknown event evidence reference.')
            if m.missedDetector and m.missedDetector not in snapshot['policy']['detectors']:
                raise ValueError('A missed detector must be enabled in this snapshot; use other for general observations.')
            if request.status == 'complete':
                if not m.facts.strip() or not m.reason.strip():
                    raise ValueError('Completed moments need observed facts and a reason.')
                if m.assessment == 'mistake' and not m.alternative.strip():
                    raise ValueError('A mistake needs a feasible alternative.')
                if m.assessment == 'uncertain' and not m.unknown.strip():
                    raise ValueError('An uncertain assessment needs a missing-evidence explanation.')
        if not set(request.candidates) <= candidates.keys():
            raise ValueError('Unknown candidate in this snapshot.')
        if request.candidates and not request.independentComplete:
            raise ValueError('Finish the independent pass before judging candidates.')
        if request.independentComplete and not request.fullRoundReviewed:
            raise ValueError('Confirm full-round review before revealing candidates.')
        if request.status == 'complete' and (not request.fullRoundReviewed or not request.independentComplete):
            raise ValueError('Confirm full-round review and finish the independent pass before completing.')
        if request.status == 'complete' and set(request.candidates) != candidates.keys():
            raise ValueError('Judge every candidate, using unsure where necessary.')
        if request.status in ('blocked', 'excluded') and not request.notes.strip():
            raise ValueError('Give a reason for blocking or excluding this round.')
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            old = self.current(demo, player, rnd, labeller, con)
            exposed = con.execute('SELECT 1 FROM candidate_exposure WHERE demo=? AND player=? AND round=? AND labeller=?',
                                  (demo, player, rnd, labeller)).fetchone()
            value['reviewMode'] = 'candidate-exposed' if exposed else 'independent-round'
            if request.previousRevision != (old['revision'] if old else None):
                raise Conflict('This review changed in another tab. Reload the saved review before editing.')
            if old and old['independentComplete'] and not request.independentComplete:
                raise Conflict('Suggestions were already revealed; the independent pass cannot be reset.')
            independent = old.get('independentPass') if old else None
            if request.independentComplete and independent is None:
                independent = {'completedAt': now(), 'moments': value['moments'], 'notes': value['notes'], 'candidateExposed': bool(exposed)}
            # Calculate ticks server-side using the exact saved round mapping.
            for m in value['moments']:
                m['ticks'] = {k: min(round_meta['endTick'], round_meta['startTick'] + round(m[k] * replay['tickRate']))
                              for k in ('start', 'anchor', 'end')}
            value.update(schemaVersion=2, rubricVersion='round-v2.0', matchId=demo, playerId=player,
                         round=rnd, labeller=labeller, map=meta['map'], snapshotId=snapshot['id'],
                         independentPass=independent, provenance=meta['provenance'],
                         coverage={'startTick': round_meta['startTick'], 'endTick': round_meta['endTick']})
            con.execute('INSERT INTO revisions(demo,player,round,labeller,payload,created) VALUES(?,?,?,?,?,?)',
                        (demo, player, rnd, labeller, encode(value), now()))
            return self.current(demo, player, rnd, labeller, con)

    def progress(self, demo: str, player: str, labeller: str):
        self.labeller(labeller)
        with self.connect() as con:
            rows = con.execute('SELECT round,payload,id FROM revisions WHERE id IN '
                               '(SELECT MAX(id) FROM revisions WHERE demo=? AND player=? AND labeller=? GROUP BY round)',
                               (demo, player, labeller)).fetchall()
        return {str(r['round']): {'status': json.loads(r['payload'])['status'], 'revision': r['id']} for r in rows}

    def export(self, labeller: str, split: str | None = None, training: bool = False):
        self.labeller(labeller)
        with self.connect() as con:
            rows = con.execute('SELECT payload FROM revisions WHERE id IN '
                               '(SELECT MAX(id) FROM revisions WHERE labeller=? GROUP BY demo,player,round)', (labeller,)).fetchall()
        result = []
        for row in rows:
            r = json.loads(row['payload'])
            p = self.demo(r['matchId'])['provenance']
            if r['status'] != 'complete' or (split and p['split'] != split):
                continue
            if training and (p['split'] != 'train' or not p['trainingPermitted']):
                continue
            result.append({**r, 'provenance': p})
        return sorted(result, key=lambda r: (r['matchId'], r['playerId'], r['round']))

    def jobs(self):
        with self.connect() as con:
            return [self._job(r) for r in con.execute('SELECT * FROM jobs ORDER BY created DESC LIMIT 100')]

    @staticmethod
    def _job(row):
        return {**dict(row), 'payload': json.loads(row['payload']), 'result': json.loads(row['result']) if row['result'] else None}

    def job(self, identity: str):
        with self.connect() as con:
            row = con.execute('SELECT * FROM jobs WHERE id=?', (identity,)).fetchone()
        if not row:
            raise KeyError('Job not found.')
        return self._job(row)

    def add_job(self, identity: str, kind: str, payload: dict):
        with self.connect() as con:
            con.execute('INSERT INTO jobs(id,kind,state,payload,created) VALUES(?,?,?,?,?)',
                        (identity, kind, 'queued', encode(payload), now()))

    def job_state(self, identity: str, state: str, *, result=None, error=None):
        with self.connect() as con:
            con.execute('UPDATE jobs SET state=?,result=?,error=? WHERE id=?',
                        (state, encode(result) if result is not None else None, error, identity))
