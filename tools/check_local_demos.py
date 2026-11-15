"""Exercise uploads, parsing, replay and analysis on a running local Studio.

Creates saved matches. Selects the first parsed player for a technical check;
this is not an assumption about which player belongs to the user.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import time
from urllib.parse import urlsplit

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('demos', nargs='+', type=Path)
    parser.add_argument('--api', default='http://127.0.0.1:3003/api')
    parser.add_argument('--focus', choices=['overall', 'shooting', 'utility', 'teamwork'], default='overall')
    parser.add_argument('--report', type=Path, default=Path('qa-out/local-v1-demo-check.json'))
    args = parser.parse_args()
    if urlsplit(args.api).hostname not in ('127.0.0.1', 'localhost', '::1'):
        parser.error('This check uploads personal demos and only accepts a loopback API.')
    reports = []
    with httpx.Client(base_url=args.api.rstrip('/') + '/', timeout=240, trust_env=False) as client:
        def get(path):
            response = client.get(path)
            response.raise_for_status()
            return response.json()

        def wait(mid, wanted):
            deadline = time.monotonic() + 240
            previous = None
            while time.monotonic() < deadline:
                status = get(f'matches/{mid}/status')
                if status['status'] != previous:
                    print(f'  {status["status"]}', flush=True)
                    previous = status['status']
                if status['status'] == 'failed':
                    raise RuntimeError(status.get('error'))
                if status['status'] == wanted:
                    return
                time.sleep(1)
            raise TimeoutError(f'{mid}: did not reach {wanted}')

        assert get('analysis-policy')['profile'] == 'local-v1'
        for demo in args.demos:
            started = time.monotonic()
            print(f'Uploading {demo.name}', flush=True)
            with demo.open('rb') as source:
                response = client.post('matches/upload', files={'file': (demo.name, source, 'application/octet-stream')})
            response.raise_for_status()
            mid = response.json()['id']
            wait(mid, 'awaiting_setup')
            assert get(f'matches/{mid}/rounds') == [], 'Full parsing must wait for confirmation'
            match = get(f'matches/{mid}')
            pid = match['players'][0]['id']
            response = client.post(f'matches/{mid}/player', json={'playerId': pid, 'language': 'en', 'focus': args.focus})
            response.raise_for_status()
            wait(mid, 'complete')
            parsed_at = time.monotonic()
            match = get(f'matches/{mid}')
            assert match['reviewFocus'] == args.focus
            rounds = get(f'matches/{mid}/rounds')
            assert rounds and match['players']
            replay = get(f'matches/{mid}/rounds/{rounds[0]["id"]}/replay')
            assert replay['samples'], 'No real replay positions'
            findings = get(f'matches/{mid}/players/{pid}/findings')
            moments = get(f'matches/{mid}/players/{pid}/moments')
            clips = get(f'matches/{mid}/players/{pid}/clips')
            durations = {r['number']: r['durationSec'] for r in rounds}
            assert len(moments) <= 6
            if args.focus == 'utility':
                assert all(f['detector'] in ('team_flash', 'unused_utility') or f['template'] in ('good_plays.flash_assist', 'good_plays.utility_damage') for f in findings)
            for clip in clips:
                assert 0 <= clip['t0'] < clip['t1'] <= durations[clip['round']]
                assert clip['t1'] - clip['t0'] <= 60.000001
            report = {
                'matchId': mid, 'map': match['map'], 'focus': args.focus, 'rounds': len(rounds),
                'players': len(match['players']), 'findings': len(findings),
                'detectors': dict(Counter(f['detector'] for f in findings)),
                'moments': len(moments), 'clips': len(clips),
                'clipStatuses': dict(Counter(c['status'] for c in clips)),
                'uploadAndParseSeconds': round(parsed_at - started, 2),
                'totalSeconds': round(time.monotonic() - started, 2),
                'playerSelection': 'First parsed player for technical verification only',
            }
            reports.append(report)
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(reports, indent=2), encoding='utf-8')
            print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
