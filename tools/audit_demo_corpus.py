"""Read-only corpus integrity/parser smoke; never open sealed test/validation demos.

Full normalisation/detection is optional and creates disposable technical snapshots,
not human labels, in the output folder. Originals and their manifest are unchanged.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'apps' / 'api'))
import zstandard
from demoparser2 import DemoParser
from app.annotation.worker import parse, write
from app.annotation.store import Store
from app.annotation.batches import Batches, BatchRequest
from app.processing.parse_demo import inspect_demo_roster


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--corpus', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--full', nargs='*', default=[])
    args = p.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader((args.corpus/'manifest.csv').open(encoding='utf-8-sig')))
    errors, results = [], []
    hashes, groups = set(), defaultdict(set)
    for row in rows:
        path = (args.corpus/row['file']).resolve()
        if not path.is_relative_to(args.corpus.resolve()) or not path.is_file():
            errors.append({'alias':row['matchAlias'], 'error':'Missing or out-of-corpus file'}); continue
        if row['demoSha256'] in hashes:
            errors.append({'alias':row['matchAlias'], 'error':'Repeated decompressed identity'})
        hashes.add(row['demoSha256']); groups[row['leakageGroup']].add(row['split'])
    errors.extend({'group':key,'error':'Split leakage'} for key, splits in groups.items() if len(splits)>1)
    scratch = args.output/'scratch'; scratch.mkdir(exist_ok=True)
    store = Store(args.output/'technical-workspace')
    for row in rows:
        if row['split'] != 'train':
            continue
        began = time.monotonic(); result = {'alias':row['matchAlias'], 'map':row['map']}
        try:
            if shutil.disk_usage(scratch).free < 3*1024**3:
                raise RuntimeError('Less than 3 GiB free; audit stopped safely.')
            with tempfile.TemporaryDirectory(dir=scratch) as temporary:
                demo = Path(temporary)/'source.dem'
                digest = hashlib.sha256(); size = 0
                with (args.corpus/row['file']).open('rb') as compressed, demo.open('wb') as target:
                    with zstandard.ZstdDecompressor(max_window_size=128*1024*1024).stream_reader(compressed) as source:
                        while chunk := source.read(1024*1024):
                            size += len(chunk)
                            if size > 2048*1024*1024:
                                raise ValueError('Decompressed size exceeds the labeller limit.')
                            digest.update(chunk); target.write(chunk)
                if digest.hexdigest() != row['demoSha256']:
                    raise ValueError('Decompressed SHA-256 mismatch.')
                map_name, players = inspect_demo_roster(str(demo))
                round_ends = DemoParser(str(demo)).parse_event('round_end')
                if map_name != row['map'] or not players or len(round_ends) != int(row['rounds']):
                    raise ValueError('Map, roster or round count does not agree with manifest.')
                result.update(hashVerified=True, roster=len(players), roundEnds=len(round_ends))
                if row['matchAlias'] in args.full:
                    identity = 'demo-'+row['demoSha256']; folder = store.root/'matches'/identity; folder.mkdir(exist_ok=True)
                    shutil.copyfile(demo, folder/'source.dem')
                    store.register(dict(id=identity,sha256=row['demoSha256'],map=map_name,players=players,filename=row['originalName']))
                    player = next((v for v in players if v['id']=='76561199110575629'), players[0])
                    snapshot = parse(store.root, {'demo':identity,'player':player['id']}, scratch)
                    store.add_snapshot(identity,player['id'],snapshot)
                    batch = Batches(store).create(identity,player['id'],BatchRequest())
                    result.update(full=True, player=player['id'], selection='technical only; owner if present, otherwise first roster entry',
                                  rounds=len(snapshot['rounds']),findings=len(snapshot['findings']),clips=batch['total'])
                    (folder/'source.dem').unlink()  # Scratch copy only; original remains untouched.
        except Exception as exc:
            result['error'] = str(exc); errors.append({'alias':row['matchAlias'],'error':str(exc)})
        result['seconds'] = round(time.monotonic()-began,2); results.append(result)
        report = dict(manifestRows=len(rows), splits=dict(Counter(r['split'] for r in rows)),
                      sealedFilesOpened=0, results=results, errors=errors)
        write(args.output/'corpus-report.json',report)
        print(json.dumps(result),flush=True)
    if set(args.full)-{r['alias'] for r in results if r.get('full')}:
        errors.append({'error':'Not all requested full parse cases completed.'})
        report['errors']=errors; write(args.output/'corpus-report.json',report)
    raise SystemExit(bool(errors))


if __name__ == '__main__':
    main()
