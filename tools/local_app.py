"""Local-only supervisor. Does not rewrite .env, install software or control Steam."""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def reachable(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


def request_json(url: str):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=3) as response:
        return json.load(response)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--recording', action='store_true')
    parser.add_argument('--llm', action='store_true')
    parser.add_argument('--api-port', type=int, default=8003)
    parser.add_argument('--web-port', type=int, default=3003)
    parser.add_argument('--smoke-seconds', type=int, default=0, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if not all(1024 <= p <= 65535 for p in (args.api_port, args.web_port)) or args.api_port == args.web_port:
        raise RuntimeError('Choose two different ports between 1024 and 65535.')
    for package in ('fastapi', 'uvicorn', 'demoparser2', 'pandas', 'mcp'):
        print(f'{package}: {importlib.metadata.version(package)}', flush=True)
    node = shutil.which('node')
    next_js = ROOT / 'apps/web/node_modules/next/dist/bin/next'
    if not node or not next_js.is_file():
        raise RuntimeError('Node or Next.js is missing. Run npm ci in apps/web first.')
    print('Web dependencies: installed', flush=True)
    csdm = shutil.which('csdm')
    ffprobe = Path.home() / '.csdm/ffmpeg/bin/ffprobe.exe'
    print(f'Recorder CLI: {csdm or "not on PATH"}', flush=True)
    print(f'ffprobe: {"available" if ffprobe.is_file() or shutil.which("ffprobe") else "missing"}', flush=True)
    db_host, db_port = '127.0.0.1', 5432
    settings_file = Path.home() / '.csdm/settings.json'
    if settings_file.is_file():
        config = json.loads(settings_file.read_text(encoding='utf-8-sig'))
        database = config.get('database', {})
        db_host = database.get('hostname') or db_host
        db_port = int(database.get('port') or db_port)
    db_ready = reachable(db_host, db_port)
    print(f'Recorder database TCP {db_host}:{db_port}: {"reachable (credentials not checked)" if db_ready else "unavailable"}', flush=True)
    print('Maps: Ancient and Anubis. Model: optional. Capture: opt-in.', flush=True)
    if args.check:
        return 0
    if args.recording and (not csdm or not db_ready or not (ffprobe.is_file() or shutil.which('ffprobe'))):
        raise RuntimeError('Recording prerequisites are missing. Open CS Demo Manager and verify its database/tools; rerun -Check. The app can start without -Recording.')
    for port in (args.api_port, args.web_port):
        if reachable('127.0.0.1', port):
            raise RuntimeError(f'Port {port} is in use. Stop the previous Studio or choose different ports.')

    runtime = ROOT / '.local'
    logs = runtime / 'logs'
    logs.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update({
        'RR_DATA_DIR': str(runtime / 'data'),
        'RR_UPLOAD_DIR': str(runtime / 'data/uploads'),
        'RR_WORK_DIR': str(runtime / 'data/work'),
        'RR_MATCHES_DIR': str(runtime / 'data/matches'),
        'RR_TRACES_DIR': str(runtime / 'data/traces'),
        'RR_LABELS_DIR': str(runtime / 'data/labels'),
        'RR_DATASET_DIR': str(runtime / 'data/dataset'),
        'RR_AUTH_ENABLED': 'false',
        'RR_LOAD_SAVED_SETTINGS': 'false',
        'RR_LLM_ENABLED': str(args.llm).lower(),
        'RR_LABELER_URL': os.getenv('RR_LABELER_URL', 'http://127.0.0.1:8765'),
        'RR_CSDM_ENABLED': str(args.recording).lower(),
        'RR_CSDM_MODE': 'csdm',
        'RR_CSDM_ROUND_CLIPS': 'false',
        'RR_ANALYSIS_PROFILE': 'local-v1',
        'RR_PARSE_TIMEOUT_SECONDS': '180',
        'RR_PUBLIC_URL': f'http://127.0.0.1:{args.web_port}',
        'RR_CORS_ORIGINS': json.dumps([f'http://127.0.0.1:{args.web_port}', f'http://localhost:{args.web_port}']),
        'API_INTERNAL_URL': f'http://127.0.0.1:{args.api_port}',
        'NEXT_PUBLIC_API_URL': '/api',
        'PYTHONUNBUFFERED': '1',
    })
    if csdm:
        env['RR_CSDM_BIN'] = csdm
    if ffprobe.is_file():
        env['RR_FFPROBE_BIN'] = str(ffprobe)
    if args.llm:
        sys.path.insert(0, str(ROOT / 'apps/api'))
        from app.core.config import Settings
        from urllib.parse import urlsplit
        configured = Settings(_env_file=ROOT / 'apps/api/.env')
        if urlsplit(configured.llm_base_url).hostname not in ('127.0.0.1', 'localhost', '::1'):
            raise RuntimeError('The local launcher requires a model on loopback. Configure RR_LLM_BASE_URL locally.')
        if not request_json(configured.llm_base_url.rstrip('/') + '/models').get('data'):
            raise RuntimeError('The local model endpoint returned no models.')
    children: list[subprocess.Popen] = []
    flags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
    try:
        with (logs / 'api.log').open('w', encoding='utf-8') as api_log, (logs / 'web.log').open('w', encoding='utf-8') as web_log:
            children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(args.api_port)], cwd=ROOT / 'apps/api', env=env, stdout=api_log, stderr=subprocess.STDOUT, creationflags=flags))
            children.append(subprocess.Popen([node, str(next_js), 'dev', '--hostname', '127.0.0.1', '--port', str(args.web_port)], cwd=ROOT / 'apps/web', env=env, stdout=web_log, stderr=subprocess.STDOUT, creationflags=flags))
            deadline = time.monotonic() + 90
            while True:
                if any(p.poll() is not None for p in children):
                    raise RuntimeError(f'A server stopped. Inspect {logs}.')
                try:
                    if request_json(f'http://127.0.0.1:{args.api_port}/health').get('status') == 'ok' and request_json(f'http://127.0.0.1:{args.web_port}/api/health').get('status') == 'ok':
                        break
                except (OSError, ValueError):
                    pass
                if time.monotonic() > deadline:
                    raise RuntimeError(f'Startup timed out. Inspect {logs}.')
                time.sleep(1)
            print(f'\nStudio ready: http://127.0.0.1:{args.web_port}\nAPI docs: http://127.0.0.1:{args.api_port}/docs\nData: {runtime / "data"}\nKeep this terminal open; Ctrl+C stops these app processes.', flush=True)
            stop_at = time.monotonic() + args.smoke_seconds if args.smoke_seconds else None
            while not stop_at or time.monotonic() < stop_at:
                if any(p.poll() is not None for p in children):
                    raise RuntimeError(f'A server stopped. Inspect {logs}.')
                time.sleep(0.5)
    except KeyboardInterrupt:
        print('\nStopping Studio. Saved matches stay on disk.', flush=True)
    finally:
        for child in reversed(children):
            if child.poll() is None:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                else:
                    child.terminate()
                child.wait(timeout=10)
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f'Local Studio: {exc}', file=sys.stderr)
        raise SystemExit(1)
