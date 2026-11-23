"""Durable single-worker queue with cancellable, bounded parser subprocesses."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import uuid
import json

import psutil

from app.annotation.store import Store, Conflict
from app.annotation.worker import write


class Jobs:
    def __init__(self, store: Store):
        self.store = store
        self.stop_event = threading.Event()
        self.wake = threading.Event()
        self.lock = threading.RLock()
        self.thread = None
        self.lockfile = None

    def start(self):
        # OS lock is released even if the interpreter/container crashes.
        self.lockfile = (self.store.root / 'server.lock').open('a+b')
        self.lockfile.seek(0)
        if os.name == 'nt':
            import msvcrt
            self.lockfile.write(b'0')
            self.lockfile.flush()
            self.lockfile.seek(0)
            try:
                msvcrt.locking(self.lockfile.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                self.lockfile.close()
                raise RuntimeError('This annotation workspace already has a running server.') from None
        else:
            import fcntl
            try:
                fcntl.flock(self.lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                self.lockfile.close()
                raise RuntimeError('This annotation workspace already has a running server.') from None
        with self.store.connect() as con:
            con.execute("UPDATE jobs SET state='failed',error='Interrupted by a previous shutdown. Retry to continue.' WHERE state='running'")
        self.thread = threading.Thread(target=self.run, name='annotation-jobs', daemon=True)
        self.thread.start()

    def close(self):
        self.stop_event.set()
        self.wake.set()
        if self.thread:
            self.thread.join(timeout=10)
        if self.lockfile and not self.lockfile.closed:
            self.lockfile.close()

    def submit(self, kind: str, payload: dict):
        with self.lock:
            active = [j for j in self.store.jobs() if j['state'] in ('queued', 'running')]
            if len(active) >= 20:
                raise Conflict('The import queue is full. Wait for a job to finish.')
            if kind == 'parse':
                for job in active:
                    if job['kind'] == kind and job['payload'] == payload:
                        return job
            identity = uuid.uuid4().hex
            self.store.add_job(identity, kind, payload)
            self.wake.set()
            return self.store.job(identity)

    def cancel(self, identity: str):
        with self.lock:
            job = self.store.job(identity)
            if job['state'] in ('running', 'queued'):
                self.store.job_state(identity, 'cancelled', error='Cancelled. Retry when ready.')
            self.wake.set()
        return self.store.job(identity)

    def retry(self, identity: str):
        with self.lock:
            job = self.store.job(identity)
            if job['state'] not in ('failed', 'cancelled'):
                raise Conflict('Only failed or cancelled jobs can be retried.')
            # A cancelled subprocess must finish exiting before the same job restarts.
            if getattr(self, 'running_id', None) == identity:
                raise Conflict('The cancelled worker is still stopping. Retry in a moment.')
            self.store.job_state(identity, 'queued')
            self.wake.set()
            return self.store.job(identity)

    def run(self):
        while not self.stop_event.is_set():
            with self.lock:
                with self.store.connect() as con:
                    row = con.execute("SELECT id FROM jobs WHERE state='queued' ORDER BY created,rowid LIMIT 1").fetchone()
                if row:
                    job = self.store.job(row['id'])
                    self.running_id = job['id']
                    self.store.job_state(job['id'], 'running')
            if not row:
                self.wake.wait(1)
                self.wake.clear()
                continue
            try:
                self.execute(job)
            except Exception as exc:
                with self.lock:
                    if self.store.job(job['id'])['state'] != 'cancelled':
                        self.store.job_state(job['id'], 'failed', error=str(exc)[:2000])
            finally:
                with self.lock:
                    self.running_id = None

    def execute(self, job):
        folder = self.store.root / 'jobs' / job['id']
        folder.mkdir(exist_ok=True)
        for name in ('result.json', 'error.json'):
            (folder / name).unlink(missing_ok=True)
        request = folder / 'request.json'
        write(request, {'root': str(self.store.root), 'kind': job['kind'], 'payload': job['payload']})
        env = {**os.environ, 'PYTHONPATH': str(Path(__file__).resolve().parents[2]),
               'RR_LLM_ENABLED': 'false', 'RR_CSDM_ENABLED': 'false', 'PYTHONUNBUFFERED': '1',
               'POLARS_MAX_THREADS': '2', 'OMP_NUM_THREADS': '2'}
        flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        timeout = float(os.getenv('RR_ANNOTATION_TIMEOUT_SECONDS', '900'))
        memory = int(os.getenv('RR_ANNOTATION_WORKER_MB', '4096')) * 1024 * 1024
        with (folder / 'worker.log').open('wb') as log:
            proc = subprocess.Popen([sys.executable, '-m', 'app.annotation.worker', str(request)],
                                    env=env, stdout=log, stderr=subprocess.STDOUT, creationflags=flags)
            start = time.monotonic()
            try:
                while proc.poll() is None:
                    if self.stop_event.is_set():
                        raise RuntimeError('Interrupted by shutdown. Retry to continue.')
                    if self.store.job(job['id'])['state'] == 'cancelled':
                        raise RuntimeError('Cancelled.')
                    if time.monotonic() - start > timeout:
                        raise RuntimeError('Parsing exceeded the time limit. Try a shorter recording or raise the configured limit.')
                    try:
                        if psutil.Process(proc.pid).memory_info().rss > memory:
                            raise RuntimeError('Parser memory limit exceeded. Raise RR_ANNOTATION_WORKER_MB if your machine has enough RAM.')
                    except psutil.NoSuchProcess:
                        pass
                    self.stop_event.wait(0.25)
                if proc.returncode != 0:
                    error_file = folder / 'error.json'
                    error = json.loads(error_file.read_text('utf-8'))['error'] if error_file.exists() else 'Parser process failed. Try another recording.'
                    raise RuntimeError(error)
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=3)
                (folder / 'demo.dem').unlink(missing_ok=True)
        with self.lock:
            if self.store.job(job['id'])['state'] == 'cancelled':
                return
            result = json.loads((folder / 'result.json').read_text('utf-8'))
            if job['kind'] == 'inspect':
                self.store.register(result)
                self.store.job_state(job['id'], 'complete', result={'demo': result['id']})
                (self.store.root / 'uploads' / job['payload']['upload']).unlink(missing_ok=True)
            else:
                expected = job['payload'].get('expectedSnapshot')
                if expected:
                    self.store.accept_reanalysis(job['payload']['demo'], job['payload']['player'], result, expected_id=expected)
                else:
                    self.store.add_snapshot(job['payload']['demo'], job['payload']['player'], result)
                if job['payload'].get('autoRecord'):
                    from app.annotation.batches import Batches, BatchRequest
                    Batches(self.store).create(job['payload']['demo'], job['payload']['player'],
                                              BatchRequest(before=job['payload'].get('before', 10), after=job['payload'].get('after', 5)))
                self.store.job_state(job['id'], 'complete', result={'demo': job['payload']['demo'], 'player': job['payload']['player']})
