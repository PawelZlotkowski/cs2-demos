"""Select short human judgements from the currently permitted clip labels."""
import json
import re
from pathlib import Path
from typing import Literal

from pydantic import Field

from app.models.annotation import StrictModel

NOTE_FORMAT = 'round-reviewer-notes-v1'


class ExampleQuery(StrictModel):
    demoHash: str = Field(pattern=r'^[a-f0-9]{64}$')
    map: Literal['de_ancient', 'de_anubis']
    detectors: list[str] = Field(min_length=1, max_length=6)
    language: Literal['en', 'pl', 'nl']
    terms: str = Field(default='', max_length=500)


def coach_examples(store, query: ExampleQuery):
    # Apply the permission and completion checks to the latest revision, including withdrawals.
    with store.connect() as con:
        rows = con.execute("""
            WITH latest AS (
                SELECT MAX(id) AS id FROM clip_labels GROUP BY demo,player,snapshot,finding,labeller
            )
            SELECT c.id, c.payload, d.metadata, d.provenance
            FROM latest JOIN clip_labels c USING(id) JOIN demos d ON d.id=c.demo
            WHERE json_extract(c.payload,'$.status')='complete'
              AND json_extract(c.payload,'$.footage.alignmentConfirmed')=1
              AND json_extract(d.provenance,'$.split')='train'
              AND json_extract(d.provenance,'$.trainingPermitted')=1
              AND d.id!=?
              AND NOT EXISTS (
                SELECT 1 FROM demos current WHERE current.id=?
                AND json_extract(current.provenance,'$.sourceMatchId')!=''
                AND json_extract(current.provenance,'$.sourceMatchId')=json_extract(d.provenance,'$.sourceMatchId')
              )
              AND EXISTS (
                SELECT 1 FROM json_each(COALESCE(json_extract(c.payload,'$.footage.findings'),
                    json_array(json_extract(c.payload,'$.finding')))) member
                WHERE json_extract(member.value,'$.detector') IN (SELECT value FROM json_each(?))
              )
        """, ('demo-' + query.demoHash, 'demo-' + query.demoHash, json.dumps(query.detectors))).fetchall()
    return rank_examples(({'id': row['id'], 'label': json.loads(row['payload']),
                           'metadata': json.loads(row['metadata']), 'provenance': json.loads(row['provenance'])}
                          for row in rows), query)


def file_examples(query: ExampleQuery, folders):
    """The same choice from exported note files (``<labeller>-notes.json``) when no labeller runs."""
    latest, demos, ranks = {}, {}, {}
    for folder in folders:
        for path in sorted(Path(folder).glob('*.json')):
            try:
                export = json.loads(path.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                continue
            if not isinstance(export, dict) or export.get('format') != NOTE_FORMAT:
                continue
            for demo_id, demo in (export.get('demos') or {}).items():
                provenance = demo.get('provenance') or {}
                # The newest export holds the current provenance; on a tie, test or not permitted wins.
                rank = (str(export.get('exportedAt') or ''), provenance.get('split') == 'test',
                        provenance.get('trainingPermitted') is not True)
                if rank >= ranks.get(demo_id, rank):
                    ranks[demo_id], demos[demo_id] = rank, demo
            for entry in export.get('labels') or []:
                label = entry.get('label') or {}
                if entry.get('kind') != 'clip' or not isinstance(label.get('finding'), dict):
                    continue
                key = (label.get('matchId'), label.get('playerId'), label.get('snapshotId'),
                       label['finding'].get('id'), label.get('labeller'))
                # Exports overlap; the newest save is the current revision, withdrawals included.
                if key not in latest or entry.get('savedAt', '') >= latest[key].get('savedAt', ''):
                    latest[key] = entry
    current = 'demo-' + query.demoHash
    source = ((demos.get(current) or {}).get('provenance') or {}).get('sourceMatchId')
    rows = []
    for entry in latest.values():
        label = entry['label']
        demo = demos.get(label.get('matchId'))
        if demo is None or label['matchId'] == current:
            continue
        provenance = demo.get('provenance') or {}
        footage = label.get('footage') or {}
        members = footage.get('findings') or [label['finding']]
        if (label.get('status') == 'complete' and footage.get('alignmentConfirmed') is True
                and provenance.get('split') == 'train' and provenance.get('trainingPermitted') is True
                and not (source and provenance.get('sourceMatchId') == source)
                and any(f.get('detector') in query.detectors for f in members)):
            rows.append({'id': entry.get('revision') or 0, 'label': label,
                         'metadata': demo.get('metadata') or {}, 'provenance': provenance})
    return rank_examples(rows, query)


def rank_examples(rows, query: ExampleQuery):
    """Up to two notes from different demos: closest detector first, then the same map, then shared words."""
    terms = set(re.findall(r'\w+', query.terms.casefold()))
    ranked = []
    for row in rows:
        label, metadata = row['label'], row['metadata']
        note = (label.get('notes') or '').strip()
        if not note:
            continue
        members = label['footage'].get('findings') or [label['finding']]
        finding = min((f for f in members if f['detector'] in query.detectors),
                      key=lambda f: query.detectors.index(f['detector']))
        detector = finding['detector']
        words = ' '.join(str(v) for v in finding.get('evidence', {}).values()) + ' ' + note
        overlap = len(terms.intersection(re.findall(r'\w+', words.casefold())))
        # Coaching judgement carries across maps; callouts do not, so the map travels with the note.
        rank = (query.detectors.index(detector), metadata.get('map') != query.map, -overlap,
                label['language'] != query.language, -row['id'])
        for player in metadata.get('players', []):
            name = player.get('name', '').strip()
            if name:
                note = re.sub(r'(?<!\w)' + re.escape(name) + r'(?!\w)', 'player', note, flags=re.I)
        note = re.sub(r'\b\d{17}\b', 'player', note)
        source = row['provenance'].get('sourceMatchId') or metadata['id']
        ranked.append((rank, source, {
            'revision': row['id'], 'detector': detector, 'language': label['language'], 'map': metadata.get('map'),
            # Group-level ratings cannot establish whether each signal was correct.
            'signal': next((r['verdict'] for r in label.get('signalReviews', []) if r['findingId'] == finding['id']),
                           label.get('verdict') if len(members) == 1 else None),
            'decision': label.get('assessment'), 'note': note[:600],
            **({'selection': label['selectionVerdict']} if label.get('selectionVerdict') else {}),
        }))
    chosen = []
    seen = set()
    for _, source, example in sorted(ranked, key=lambda entry: entry[0]):
        if source not in seen:
            seen.add(source)
            chosen.append(example)
        if len(chosen) == 2:
            break
    return chosen
