"""Select short human judgements from the currently permitted clip labels."""
import json
import re
from typing import Literal

from pydantic import Field

from app.models.annotation import StrictModel


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
              AND json_extract(d.metadata,'$.map')=?
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
        """, (query.map, 'demo-' + query.demoHash, 'demo-' + query.demoHash, json.dumps(query.detectors))).fetchall()

    terms = set(re.findall(r'\w+', query.terms.casefold()))
    ranked = []
    for row in rows:
        label = json.loads(row['payload'])
        note = label['notes'].strip()
        if not note:
            continue
        members = label['footage'].get('findings') or [label['finding']]
        finding = min((f for f in members if f['detector'] in query.detectors),
                      key=lambda f: query.detectors.index(f['detector']))
        detector = finding['detector']
        words = ' '.join(str(v) for v in finding.get('evidence', {}).values()) + ' ' + note
        overlap = len(terms.intersection(re.findall(r'\w+', words.casefold())))
        rank = (query.detectors.index(detector), -overlap, label['language'] != query.language, -row['id'])
        metadata = json.loads(row['metadata'])
        for player in metadata.get('players', []):
            name = player.get('name', '').strip()
            if name:
                note = re.sub(r'(?<!\w)' + re.escape(name) + r'(?!\w)', 'player', note, flags=re.I)
        note = re.sub(r'\b\d{17}\b', 'player', note)
        source = json.loads(row['provenance']).get('sourceMatchId') or metadata['id']
        ranked.append((rank, source, {
            'revision': row['id'], 'detector': detector, 'language': label['language'],
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
