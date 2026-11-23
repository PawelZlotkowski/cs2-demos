"""Explicit local annotation entry point using existing application Python services."""
from __future__ import annotations

from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
import shutil
from urllib.parse import unquote, urlsplit
import uuid

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.annotation.jobs import Jobs
from app.annotation.media import install_media
from app.annotation.voice import install_voice
from app.annotation.batches import install_batches, BatchRequest
from app.annotation.store import Store, Conflict, encode
from app.annotation.worker import version_info
from app.models.annotation import Provenance, ReviewSave, SelectPlayer


def create_app(data_dir: Path | None = None, *, run_worker: bool = True):
    root = data_dir or Path(os.getenv('RR_ANNOTATION_DIR', '.local/annotation'))
    store = Store(root)
    jobs = Jobs(store)

    @asynccontextmanager
    async def lifespan(app):
        if run_worker:
            jobs.start()
        yield
        if run_worker:
            jobs.close()

    app = FastAPI(title='Round Reviewer Label Tool', version='1.0.0', lifespan=lifespan)
    app.state.store, app.state.jobs = store, jobs
    install_media(app, store)
    install_voice(app, store)
    install_batches(app, store)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', '[::1]', 'testserver'])

    @app.exception_handler(Conflict)
    async def conflict(_request, exc):
        return JSONResponse({'detail': str(exc)}, status_code=409)

    @app.exception_handler(ValueError)
    async def invalid(_request, exc):
        return JSONResponse({'detail': str(exc)}, status_code=422)

    @app.exception_handler(KeyError)
    async def missing(_request, exc):
        return JSONResponse({'detail': str(exc.args[0])}, status_code=404)

    @app.middleware('http')
    async def local_requests(request: Request, call_next):
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('origin')
            if request.headers.get('x-annotation-request') != '1' or (origin and urlsplit(origin).netloc != request.headers.get('host')):
                return JSONResponse({'detail': 'Use the local annotation page or the documented API request header.'}, status_code=403)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        return response

    static = Path(__file__).resolve().parents[1] / 'annotation_static'
    app.mount('/static', StaticFiles(directory=static), name='static')

    @app.get('/')
    def index():
        return FileResponse(static / 'index.html')

    @app.get('/health')
    def health():
        return {'status': 'ok', 'schemaVersion': 2}

    @app.get('/api/config')
    def config():
        from app.analysis.policy import policy_description
        return {'maxUploadMB': int(os.getenv('RR_ANNOTATION_MAX_UPLOAD_MB', '2048')), 'maps': ['Ancient', 'Anubis'],
                'reviewSchemaVersion': 3, 'policy': policy_description('local-v1'), 'detectorVersion': version_info()}

    @app.get('/api/demos')
    def demos():
        return store.demos()

    @app.post('/api/import', status_code=202)
    async def upload(request: Request):
        filename = unquote(request.headers.get('x-filename', ''))
        # Browsers supply the file basename, never a server-side path.
        if not filename or len(filename) > 250 or '/' in filename or '\\' in filename or not filename.lower().endswith(('.dem', '.dem.zst')):
            raise HTTPException(400, 'Choose a .dem or .dem.zst file. Extract ZIP/RAR archives first.')
        limit = int(os.getenv('RR_ANNOTATION_MAX_UPLOAD_MB', '2048')) * 1024 * 1024
        if int(request.headers.get('content-length', '0')) > limit:
            raise HTTPException(413, 'File exceeds the upload size limit.')
        identity = uuid.uuid4().hex
        path = store.root / 'uploads' / identity
        total = 0
        try:
            with path.open('wb') as target:
                async for chunk in request.stream():
                    total += len(chunk)
                    if total > limit:
                        raise HTTPException(413, 'File exceeds the upload size limit.')
                    if shutil.disk_usage(store.root).free < len(chunk) + 512 * 1024 * 1024:
                        raise HTTPException(507, 'Not enough free disk space for the import.')
                    target.write(chunk)
            if not total:
                raise HTTPException(400, 'The selected file is empty.')
            return jobs.submit('inspect', {'upload': identity, 'filename': filename})
        except BaseException:
            path.unlink(missing_ok=True)
            raise

    @app.get('/api/jobs')
    def job_list():
        return store.jobs()

    @app.post('/api/jobs/{identity}/cancel')
    def cancel(identity: str):
        return jobs.cancel(identity)

    @app.post('/api/jobs/{identity}/retry')
    def retry(identity: str):
        return jobs.retry(identity)

    @app.put('/api/demos/{demo}/provenance')
    def provenance(demo: str, value: Provenance):
        store.set_provenance(demo, value)
        return store.demo(demo)

    @app.post('/api/demos/{demo}/select', status_code=202)
    def select(demo: str, value: SelectPlayer):
        metadata = store.demo(demo)
        if value.playerId not in {p['id'] for p in metadata['players']}:
            raise ValueError('Choose a player from this demo roster.')
        snapshot = store.snapshot(demo, value.playerId)
        if snapshot and store.snapshot_is_current(demo, value.playerId, snapshot, version_info()):
            if value.autoRecord:
                app.state.batches.create(demo, value.playerId, BatchRequest(before=value.before, after=value.after))
            return {'state': 'complete', 'result': {'demo': demo, 'player': value.playerId}}
        return jobs.submit('parse', {'demo': demo, 'player': value.playerId,
                                    'expectedSnapshot': snapshot['id'] if snapshot else None,
                                    'autoRecord': value.autoRecord, 'before': value.before, 'after': value.after})

    @app.get('/api/demos/{demo}/players/{player}/rounds')
    def rounds(demo: str, player: str, labeller: str = Query(min_length=1, max_length=40)):
        snapshot = store.snapshot(demo, player)
        if not snapshot:
            raise HTTPException(409, 'This player has not finished parsing yet.')
        return {'rounds': snapshot['rounds'], 'progress': store.progress(demo, player, labeller),
                'warnings': snapshot['warnings'], 'policy': snapshot['policy'], 'snapshotId': snapshot['id'],
                'stale': not store.snapshot_is_current(demo, player, snapshot, version_info())}

    @app.get('/api/demos/{demo}/players/{player}/rounds/{rnd}')
    def round_detail(demo: str, player: str, rnd: int, labeller: str):
        snapshot = store.snapshot(demo, player)
        if not snapshot or rnd not in {r['number'] for r in snapshot['rounds']}:
            raise KeyError('Round not found for this player.')
        folder = store.root / 'matches' / demo
        replay = json.loads((folder / 'rounds' / f'r{rnd}.json').read_text('utf-8'))
        analysis = json.loads((folder / 'analysis.json').read_text('utf-8'))
        rd = next(r for r in analysis['rounds'] if r['number'] == rnd)
        review = store.current(demo, player, rnd, labeller)
        candidates = [f for f in snapshot['findings'] if f['round'] == rnd] if review and review['independentComplete'] else []
        with store.connect() as con:
            exposed = con.execute('SELECT 1 FROM candidate_exposure WHERE demo=? AND player=? AND round=? AND labeller=?',
                                  (demo, player, rnd, labeller)).fetchone()
        return {'replay': replay, 'context': rd, 'review': review, 'candidates': candidates,
                'candidateExposed': bool(exposed), 'snapshotId': snapshot['id']}

    @app.put('/api/demos/{demo}/players/{player}/rounds/{rnd}')
    def save(demo: str, player: str, rnd: int, labeller: str, value: ReviewSave):
        return store.save(demo, player, rnd, labeller, value)

    @app.get('/api/export')
    def export(labeller: str, split: str | None = None, training: bool = False):
        if split and split not in ('train', 'val', 'test', 'unassigned'):
            raise ValueError('Unknown split.')
        records = store.export(labeller, split, training)
        return Response(''.join(encode(r) + '\n' for r in records), media_type='application/x-ndjson',
                        headers={'Content-Disposition': f'attachment; filename="labels-{store.labeller(labeller)}.jsonl"'})

    return app
