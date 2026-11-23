"""Local-only supervisor. Does not rewrite .env, install software or control Steam.

With --llm it starts llama-server when nothing answers at RR_LLM_BASE_URL (model file from
RR_LLAMA_MODEL_FILE in apps/api/.env). With --recording it starts Docker Desktop and the CS:DM
database container when the recorder database is down. Both keep running after Studio stops.
"""
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


def wait_for(ready, seconds: int) -> bool:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if ready():
            return True
        time.sleep(2)
    return False


def detached() -> int:
    return subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0


def serving(models_url: str) -> bool:
    try:
        return bool(request_json(models_url).get('data'))
    except (OSError, ValueError):
        return False


def ensure_model(base_url: str, alias: str, logs: Path) -> None:
    models_url = base_url.rstrip('/') + '/models'
    if serving(models_url):
        return
    from dotenv import dotenv_values
    from urllib.parse import urlsplit

    values = {**dotenv_values(ROOT / 'apps/api/.env'), **os.environ}
    server = Path(values.get('RR_LLAMA_SERVER') or Path.home() / 'llama.cpp/llama-server.exe')
    model = Path(values.get('RR_LLAMA_MODEL_FILE') or '')
    if not server.is_file() or not model.is_file():
        raise RuntimeError('No model is running and RR_LLAMA_MODEL_FILE / RR_LLAMA_SERVER in apps/api/.env do not point at files.')
    print(f'Starting the model {alias} (about 30 s)...', flush=True)
    # Keep 4 GB of VRAM free so CS2 can record next to the model (26B on a 16 GB card: about 2x slower calls).
    command = [str(server), '-m', str(model), '--alias', alias, '--jinja', '-c', '16384', '-ctk', 'q8_0', '-ctv', 'q8_0',
               '--fit-target', '4096', '--host', '127.0.0.1', '--port', str(urlsplit(base_url).port or 8080)]
    with (logs / 'llama.log').open('w', encoding='utf-8') as log:
        subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, creationflags=detached())
    if not wait_for(lambda: serving(models_url), 240):
        raise RuntimeError(f'The model did not start. Inspect {logs / "llama.log"}.')


TAILNET_PORT = 8443  # The Mac opens https://<pc>.<tailnet>.ts.net:8443, as in the run sheet


def share_on_tailnet(web_port: int) -> None:
    """Keep Studio reachable from the owner's Mac through Tailscale Serve (tailnet only, never Funnel)."""
    ts = shutil.which('tailscale') or str(Path(os.environ.get('ProgramFiles', r'C:\Program Files')) / 'Tailscale/tailscale.exe')
    target = f'http://127.0.0.1:{web_port}'

    def shared_host() -> str | None:
        try:
            web = json.loads(subprocess.run([ts, 'serve', 'status', '--json'], capture_output=True, text=True).stdout or '{}').get('Web') or {}
        except (OSError, ValueError):
            return None
        return next((host for host, cfg in web.items() if host.endswith(f':{TAILNET_PORT}')
                     and ((cfg.get('Handlers') or {}).get('/') or {}).get('Proxy') == target), None)

    if not Path(ts).is_file():
        print('Tailscale not found: Studio is only reachable on this PC.', flush=True)
        return
    host = shared_host()
    if host is None:
        subprocess.run([ts, 'serve', '--bg', f'--https={TAILNET_PORT}', target], capture_output=True)
        host = shared_host()
    print(f'On your Mac (tailnet only): https://{host}' if host
          else f'Studio is not shared on the tailnet. Run: tailscale serve --bg --https={TAILNET_PORT} {target}', flush=True)


def ensure_recorder_db(host: str, port: int) -> bool:
    docker = shutil.which('docker')
    if host not in ('127.0.0.1', 'localhost') or not docker:
        return False
    docker_up = lambda: subprocess.run([docker, 'info'], capture_output=True).returncode == 0
    if not docker_up():
        desktop = Path(os.environ.get('ProgramFiles', r'C:\Program Files')) / 'Docker/Docker/Docker Desktop.exe'
        if not desktop.is_file():
            return False
        print('Starting Docker Desktop for the recorder database...', flush=True)
        subprocess.Popen([str(desktop)], creationflags=detached())
        if not wait_for(docker_up, 180):
            return False
    names = subprocess.run([docker, 'ps', '-a', '--format', '{{.Names}}'], capture_output=True, text=True).stdout.split()
    for name in (n for n in names if 'csdm' in n):
        print(f'Starting container {name}...', flush=True)
        subprocess.run([docker, 'start', name], capture_output=True)
    return wait_for(lambda: reachable(host, port), 60)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--recording', action='store_true')
    parser.add_argument('--llm', action='store_true')
    parser.add_argument('--prod', action='store_true', help='build once and serve the production web app (faster over a network, no dev badge)')
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
    print(f'Maps: Ancient and Anubis. Model: {"on" if args.llm else "off"}. Recording: {"on" if args.recording else "off"}.', flush=True)
    if args.check:
        return 0
    if args.recording and not db_ready:
        db_ready = ensure_recorder_db(db_host, db_port)
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
        ensure_model(configured.llm_base_url, configured.llm_model, logs)
    if args.prod:
        # API_INTERNAL_URL is baked into the /api rewrite at build time, so build with this run's env
        subprocess.run([node, str(next_js), 'build'], cwd=ROOT / 'apps/web', env=env, check=True)
    children: list[subprocess.Popen] = []
    flags = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
    try:
        with (logs / 'api.log').open('w', encoding='utf-8') as api_log, (logs / 'web.log').open('w', encoding='utf-8') as web_log:
            children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(args.api_port)], cwd=ROOT / 'apps/api', env=env, stdout=api_log, stderr=subprocess.STDOUT, creationflags=flags))
            children.append(subprocess.Popen([node, str(next_js), 'start' if args.prod else 'dev', '--hostname', '127.0.0.1', '--port', str(args.web_port)], cwd=ROOT / 'apps/web', env=env, stdout=web_log, stderr=subprocess.STDOUT, creationflags=flags))
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
            share_on_tailnet(args.web_port)
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
