"""Read-only preflight for every current labeller batch, not a coaching judge.

Run in the container with --root /data, or against a consistent local copy.
--decode checks every video frame; output contains private IDs and stays local.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps' / 'api'))
from app.annotation.media import probe_video, validate_recording_duration


def audit(root: Path, *, decode=False, ffmpeg='ffmpeg'):
    con = sqlite3.connect((root / 'annotations.sqlite3').resolve().as_uri() + '?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    errors, warnings, videos = [], [], []
    def issue(target, code, identity, detail):
        target.append(dict(code=code, id=identity, detail=detail))
    try:
        integrity = con.execute('PRAGMA integrity_check').fetchone()[0]
        if integrity != 'ok':
            issue(errors, 'database_integrity', 'workspace', integrity)
        snapshots = {(r['demo'], r['player']): json.loads(r['payload']) for r in con.execute('SELECT * FROM snapshots')}
        selected = list(con.execute('SELECT * FROM clip_selection'))
        for (demo, player), snapshot in snapshots.items():
            ids = set()
            rounds = {r['number']: r for r in snapshot['rounds']}
            for f in snapshot['findings']:
                if f['id'] in ids:
                    issue(errors, 'repeated_finding', snapshot['id'], f['id'])
                ids.add(f['id'])
                if f['round'] not in rounds or not 0 <= f['t'] <= rounds[f['round']]['durationSec']:
                    issue(errors, 'finding_clock', snapshot['id'], f['id'])
                if f.get('playerId', player) != player:
                    issue(errors, 'wrong_player', snapshot['id'], f['id'])
                if f['detector'] in ('shot_while_moving', 'untraded_death') and f.get('kind') == 'mistake':
                    issue(errors, 'obsolete_automatic_judgement', snapshot['id'], f['id'])
        counts = Counter()
        for selection in selected:
            batch = con.execute('SELECT * FROM clip_batches WHERE id=?', (selection['batch'],)).fetchone()
            snapshot = snapshots.get((selection['demo'], selection['player']))
            if not batch or not snapshot or batch['snapshot'] != snapshot['id']:
                issue(errors, 'stale_selection', selection['batch'], 'Selected batch does not match current analysis.')
                continue
            rows = con.execute("SELECT * FROM footage WHERE json_extract(metadata,'$.batchId')=? ORDER BY round, json_extract(metadata,'$.start')", (batch['id'],)).fetchall()
            seen, previous = set(), {}
            expected = {f['id']: f for f in snapshot['findings']}
            for row in rows:
                m = json.loads(row['metadata']); identity = row['id']; counts[row['state']] += 1
                if (row['demo'], row['player']) != (batch['demo'], batch['player']):
                    issue(errors, 'wrong_clip_owner', identity, 'Clip and batch identify different demo/player.')
                findings = m.get('findings') or [m['finding']]
                for f in findings:
                    if f['id'] in seen:
                        issue(errors, 'repeated_evidence', identity, f['id'])
                    seen.add(f['id'])
                    # Finding seconds are rounded to milliseconds; clip bounds
                    # retain exact ticks. Accept that representation difference.
                    if expected.get(f['id']) != f or f['round'] != row['round'] or not m['start'] - .001 <= f['t'] <= m['end'] + .001:
                        issue(errors, 'wrong_clip_evidence', identity, f['id'])
                end = m.get('videoEnd', m['end']) if row['state'] == 'ready' else m['end']
                if row['round'] in previous and previous[row['round']][0] > m['start'] + 1e-6:
                    issue(errors, 'overlapping_action', identity, previous[row['round']][1])
                previous[row['round']] = (end, identity)
                if row['state'] != 'ready':
                    issue(warnings, 'not_ready', identity, row['state'])
                    continue
                path = root / 'footage' / f'{identity}.mp4'
                try:
                    info = probe_video(path)
                    validate_recording_duration(m, info)
                    with path.open('rb') as source:
                        sha = hashlib.file_digest(source, 'sha256').hexdigest()
                    if sha != m.get('sha256') or path.stat().st_size != m.get('bytes'):
                        raise ValueError('Media size/hash missing or different from saved metadata.')
                    if decode:
                        result = subprocess.run([ffmpeg, '-v', 'error', '-xerror', '-i', str(path), '-map', '0:v:0', '-f', 'null', '-'], capture_output=True, timeout=180)
                        if result.returncode:
                            raise ValueError(result.stderr.decode(errors='replace')[-500:])
                    videos.append({'id': identity, 'sha256': sha, 'duration': info['duration'], 'decoded': decode})
                    if not m.get('alignmentConfirmed'):
                        issue(warnings, 'pov_not_human_confirmed', identity, 'Codec/clock checks cannot establish whose view is shown.')
                    if m.get('contextClamped'):
                        issue(warnings, 'round_boundary_context', identity, 'Requested context reaches a round boundary.')
                except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
                    issue(errors, 'invalid_media', identity, str(exc))
            if seen != expected.keys():
                issue(errors, 'incomplete_batch_evidence', batch['id'], sorted(expected.keys() - seen))
        return dict(format='rr-label-preflight-v1', snapshots=len(snapshots), batches=len(selected),
                    states=dict(counts), verifiedVideos=videos, errors=errors, warnings=warnings,
                    checks='Current snapshots, identities, windows, hashes, codecs; optional full decode. No semantic correctness claim.')
    finally:
        con.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--decode', action='store_true')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    args = parser.parse_args()
    result = audit(args.root, decode=args.decode, ffmpeg=args.ffmpeg)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps({k: result[k] for k in ('snapshots', 'batches', 'states')}))
    print(f"Verified videos: {len(result['verifiedVideos'])}; errors: {len(result['errors'])}; warnings: {len(result['warnings'])}")
    raise SystemExit(bool(result['errors']))


if __name__ == '__main__':
    main()
