"""Real-demo HTTP smoke check. Writes a clearly marked qa_smoke draft, never a coaching label."""
import argparse
import json
from pathlib import Path
import time

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('demos', nargs='+', type=Path)
    parser.add_argument('--url', default='http://127.0.0.1:8765')
    parser.add_argument('--output', type=Path, default=Path('qa-out/labeler-smoke.json'))
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument('--player', help='Exact Steam ID or roster name. Never falls back to another player.')
    selection.add_argument('--technical-first-player', action='store_true', help='Explicitly test the first roster entry (technical QA only).')
    args = parser.parse_args()
    results = []
    with httpx.Client(base_url=args.url, timeout=120, trust_env=False, headers={'X-Annotation-Request': '1'}) as client:
        def request(method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()

        def wait(job):
            if job['state'] == 'complete':
                return job['result']
            deadline = time.monotonic() + 960
            while time.monotonic() < deadline:
                row = next(j for j in request('GET', '/api/jobs') if j['id'] == job['id'])
                if row['state'] == 'complete':
                    return row['result']
                if row['state'] in ('failed', 'cancelled'):
                    raise RuntimeError(row['error'])
                time.sleep(.5)
            raise TimeoutError('Job did not finish.')

        for demo in args.demos:
            started = time.monotonic()
            print('Importing', demo.name, flush=True)
            with demo.open('rb') as source:
                job = request('POST', '/api/import', content=source,
                              headers={'X-Filename': demo.name, 'Content-Length': str(demo.stat().st_size)})
            imported = wait(job)
            identity = imported['demo']
            meta = next(d for d in request('GET', '/api/demos') if d['id'] == identity)
            candidates = meta['players'][:1] if args.technical_first_player else [
                p for p in meta['players'] if p['id'] == args.player or p['name'].casefold() == args.player.casefold()]
            if len(candidates) != 1:
                raise ValueError('Choose one exact player from this roster: ' + ', '.join(
                    f"{p['name']} ({p['id']})" for p in meta['players']))
            player = candidates[0]['id']
            print('Roster ready:', meta['map'], len(meta['players']), 'players; selected', candidates[0]['name'], player, flush=True)
            wait(request('POST', f'/api/demos/{identity}/select', json={'playerId': player}))
            rounds = request('GET', f'/api/demos/{identity}/players/{player}/rounds?labeller=qa_smoke')
            rnd = rounds['rounds'][0]['number']
            path = f'/api/demos/{identity}/players/{player}/rounds/{rnd}?labeller=qa_smoke'
            detail = request('GET', path)
            assert not detail['candidates'], 'Candidates leaked before independent review'
            review = request('PUT', path, json={'previousRevision': detail['review']['revision'] if detail['review'] else None,
                                               'notes': 'Automated smoke test draft. Not a human coaching annotation.'})
            assert request('GET', path)['review']['revision'] == review['revision']
            results.append({'demo': identity, 'map': meta['map'], 'player': player, 'round': rnd,
                            'rounds': len(rounds['rounds']), 'eventsInFirstRound': len(detail['replay']['events']),
                            'revision': review['revision'], 'seconds': round(time.monotonic()-started, 2),
                            'playerName': candidates[0]['name'],
                            'playerSelection': 'First roster player, technical QA only' if args.technical_first_player else 'Explicit selected player'})
            print('Verified', meta['map'], len(rounds['rounds']), 'rounds; saved draft revision', review['revision'], flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2), encoding='utf-8')
    print('Report:', args.output)


if __name__ == '__main__':
    main()
