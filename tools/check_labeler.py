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
            player = meta['players'][0]['id']  # Technical verification only; never assume this is the owner.
            print('Roster ready:', meta['map'], len(meta['players']), 'players; selecting first for technical QA', flush=True)
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
                            'playerSelection': 'First roster player, technical QA only'})
            print('Verified', meta['map'], len(rounds['rounds']), 'rounds; saved draft revision', review['revision'], flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2), encoding='utf-8')
    print('Report:', args.output)


if __name__ == '__main__':
    main()
