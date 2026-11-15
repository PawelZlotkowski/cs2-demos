"""Optional host recorder for the Docker labeler. Python standard library only.

Run on the machine with CS2, Steam and configured CS Demo Manager. This process
claims explicit requests, records their context window and uploads actual MP4s.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time
import threading
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class CaptureStartupError(RuntimeError):
    """The game launched without beginning any requested capture window."""


@contextmanager
def recorder_lock(cache):
    """An OS-owned lock is released even if Windows terminates the worker."""
    cache.mkdir(parents=True, exist_ok=True)
    with (cache / 'worker.lock').open('a+b') as handle:
        if os.fstat(handle.fileno()).st_size == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise RuntimeError('A recorder already owns this cache. Keep only one host recorder running.') from None
        try:
            yield
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def call(base, route, payload=None, file=None):
    headers = {'X-Annotation-Request': '1'}
    if file:
        headers.update({'Content-Type': 'video/mp4', 'Content-Length': str(file.stat().st_size)})
        with file.open('rb') as body:
            with urlopen(Request(base + route, data=body, headers=headers, method='POST'), timeout=180) as response:
                return json.load(response)
    headers['Content-Type'] = 'application/json'
    body = json.dumps(payload or {}).encode()
    try:
        with urlopen(Request(base + route, data=body, headers=headers, method='POST'), timeout=30) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(exc.read().decode()[:2000]) from exc


def capture_job(proc):
    """Keep HLAE's orphaned CS2/encoder children owned until capture finishes."""
    if os.name != 'nt':
        return lambda: None
    import ctypes
    from ctypes import wintypes

    class Basic(ctypes.Structure):
        _fields_ = [('process_time', ctypes.c_int64), ('job_time', ctypes.c_int64),
                    ('flags', wintypes.DWORD), ('min_working', ctypes.c_size_t),
                    ('max_working', ctypes.c_size_t), ('active', wintypes.DWORD),
                    ('affinity', ctypes.c_size_t), ('priority', wintypes.DWORD),
                    ('scheduling', wintypes.DWORD)]

    class Limits(ctypes.Structure):
        _fields_ = [('basic', Basic), ('io', ctypes.c_uint64 * 6),
                    ('process_memory', ctypes.c_size_t), ('job_memory', ctypes.c_size_t),
                    ('peak_process', ctypes.c_size_t), ('peak_job', ctypes.c_size_t)]

    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    job = kernel.CreateJobObjectW(None, None)
    if not job:
        raise ctypes.WinError(ctypes.get_last_error())
    limits = Limits()
    limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not (kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits))
            and kernel.AssignProcessToJobObject(job, int(proc._handle))):
        error = ctypes.get_last_error()
        kernel.CloseHandle(job)
        raise ctypes.WinError(error)
    return lambda: kernel.CloseHandle(job)


def run(command, timeout=600, env=None, log_path=None, startup_ready=None, startup_timeout=90):
    # Only executable paths and validated/generated arguments reach the batch shim.
    if os.name == 'nt' and command[0].lower().endswith(('.cmd', '.bat')):
        if any(any(c in arg for c in '&|<>^%!\r\n') for arg in command):
            raise ValueError('Use recorder paths without shell metacharacters.')
        command = ['cmd.exe', '/d', '/s', '/c', *command]
    log = log_path.open('w', encoding='utf-8') if log_path else None
    proc = subprocess.Popen(command, stdout=log or subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    release_job = lambda: None
    try:
        if log:
            release_job = capture_job(proc)
            started = time.monotonic()
            ready = startup_ready is None
            while proc.poll() is None:
                elapsed = time.monotonic() - started
                ready = ready or startup_ready()
                if not ready and elapsed > startup_timeout:
                    raise CaptureStartupError('CS2 started but no capture window opened within 90 seconds. '
                                       'Check CS Demo Manager/HLAE compatibility with the installed CS2 build; '
                                       'the demo may play normally while the recording plugin is stalled. '
                                       'See capture.log, then retry after fixing the capture setup.')
                if elapsed > timeout:
                    raise subprocess.TimeoutExpired(command, timeout)
                time.sleep(.5)
            log.close()
            output = log_path.read_text('utf-8', errors='replace')
        else:
            output, _ = proc.communicate(timeout=timeout)
    except (subprocess.TimeoutExpired, KeyboardInterrupt, RuntimeError, OSError) as exc:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True,
                           creationflags=subprocess.CREATE_NO_WINDOW)
        else:
            proc.kill()
        proc.communicate()
        if isinstance(exc, (RuntimeError, OSError)):
            raise
        raise RuntimeError('Recording timed out or was interrupted. Check CS2 and retry.') from None
    finally:
        release_job()
        if log:
            log.close()
    if 'econnrefused' in output.lower() and '5432' in output:
        raise RuntimeError('CS Demo Manager cannot connect to PostgreSQL at localhost:5432. Start its configured database and retry.')
    if proc.returncode or 'steam is not running' in output.lower() or re.search(r'^\s*(?:Error:|error:)', output, re.MULTILINE):
        raise RuntimeError(output[-1800:] or 'CS Demo Manager failed.')
    return output


def group_windows(jobs):
    """Union overlapping contexts within a round, retaining every label identity."""
    groups = []
    for job in sorted(jobs, key=lambda j: (j['startTick'], j['endTick'])):
        start, end = int(job['startTick']), int(job['endTick'])
        rate = (end-start)/(job['end']-job['start'])
        if groups and groups[-1]['round'] == job['round'] and start <= groups[-1]['endTick']:
            group = groups[-1]
            if abs(group['tickRate']-rate) > .001:
                raise ValueError('Inconsistent tick rate in overlapping windows.')
            group['endTick'] = max(group['endTick'], end)
            group['jobs'].append(job)
        else:
            groups.append(dict(number=len(groups)+1, round=job['round'], startTick=start,
                               endTick=end, tickRate=rate, jobs=[job]))
    return groups


def capture_config(demo, output, groups, player, recording_system, ffmpeg):
    return dict(demoPath=str(demo), outputFolderPath=str(output), recordingSystem=recording_system,
                recordingOutput='video', encoderSoftware='FFmpeg', framerate=30, width=1280, height=720,
                closeGameAfterRecording=True, concatenateSequences=False,
                ffmpegSettings=dict(audioBitrate=256, constantRateFactor=20,
                    customLocationEnabled=True, customExecutableLocation=ffmpeg,
                    videoContainer='mp4', videoCodec='libx264', audioCodec='aac',
                    inputParameters='', outputParameters='-preset fast -crf 20 -pix_fmt yuv420p'),
                sequences=[dict(number=g['number'], startTick=g['startTick'], endTick=g['endTick'],
                    showXRay=False, showAssists=True, showOnlyDeathNotices=False,
                    playersOptions=[], cameras=[], recordAudio=True, playerVoicesEnabled=True,
                    deathNoticesDuration=5,
                    playerCameras=[dict(tick=g['startTick'], playerSteamId=player, playerName=player)])
                    for g in groups])


def record_session(base, jobs, args, csdm, ffmpeg, *, _retry=False):
    first = jobs[0]
    for job in jobs:
        if (not re.fullmatch(r'[a-f0-9]{32}', job['lease'])
                or not re.fullmatch(r'[a-f0-9]{32}', job['id'])
                or not re.fullmatch(r'demo-[a-f0-9]{64}', job['demo'])
                or not re.fullmatch(r'\d{1,20}', job['player'])):
            raise ValueError('Invalid recording identity from server.')
        if any(job[k] != first[k] for k in ('demo', 'player', 'lease')):
            raise ValueError('A recording session must have one demo, player and lease.')
        if job['startTick'] < 0 or job['endTick'] <= job['startTick'] or job['end'] <= job['start']:
            raise ValueError('Invalid recording window.')
    groups = group_windows(jobs)
    root = args.cache.resolve()
    root.mkdir(parents=True, exist_ok=True)
    output = root / 'sessions' / (first['lease'] + ('-retry1' if _retry else ''))
    output.mkdir(parents=True, exist_ok=False)
    pending = {j['id']: j for j in jobs}
    stop = threading.Event()

    def progress(stage, subset=None, **details):
        routes = ([f"/api/recordings/session/progress?lease={first['lease']}"] if subset is None else
                  [f"/api/recordings/{j['id']}/progress?lease={j['lease']}" for j in subset])
        for route in routes:
            try:
                call(base, route, {'stage': stage, **details})
            except (URLError, OSError, RuntimeError) as exc:
                print(f'Progress update unavailable: {exc}', flush=True)

    def renew():
        while not stop.wait(15):
            try:
                call(base, f"/api/recordings/session/renew?lease={first['lease']}")
            except (URLError, OSError, RuntimeError) as exc:
                print(f'Session renewal unavailable: {exc}', flush=True)

    def fail(job, error):
        try:
            call(base, f"/api/recordings/{job['id']}/fail?lease={job['lease']}", {'error': str(error)[:2000]})
        except (URLError, OSError, RuntimeError) as exc:
            print(f'Could not report failure; lease will expire: {exc}', flush=True)
        pending.pop(job['id'], None)

    threading.Thread(target=renew, daemon=True).start()
    began = time.monotonic()
    try:
        demo = root / f"{first['demo']}.dem"
        checksum = None
        if demo.is_file():
            with demo.open('rb') as source:
                checksum = hashlib.file_digest(source, 'sha256').hexdigest()
        if checksum != first['demo'][5:]:
            temporary = demo.with_suffix('.download')
            with urlopen(base + f"/api/recordings/{first['id']}/demo", timeout=180) as response, temporary.open('wb') as target:
                shutil.copyfileobj(response, target)
            with temporary.open('rb') as source:
                checksum = hashlib.file_digest(source, 'sha256').hexdigest()
            if checksum != first['demo'][5:]:
                temporary.unlink()
                raise ValueError('Downloaded demo checksum does not match the request.')
            temporary.replace(demo)
        duration = sum((g['endTick']-g['startTick'])/g['tickRate'] for g in groups)
        requested = sum(j['end']-j['start'] for j in jobs)
        print(f"Session: {len(jobs)} clips, {len(groups)} capture windows, {duration:.1f}s gameplay "
              f"instead of {requested:.1f}s; one CS2 launch; player {first['player']}.", flush=True)
        progress('analysing')
        (output/'analysis.log').write_text(run([csdm, 'analyze', str(demo)]), encoding='utf-8')
        config = capture_config(demo, output, groups, first['player'], args.recording_system, ffmpeg)
        config_path = output/'capture.json'
        config_path.write_text(json.dumps(config, indent=2), encoding='utf-8')
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            capture_port = listener.getsockname()[1]
        capture_env = {**os.environ, 'CSDM_WS_PORT': str(capture_port)}
        progress('capturing', captureWindow=0, captureWindows=len(groups))
        capture_done = threading.Event()

        def watch_windows():
            last = 0
            while not capture_done.wait(2):
                current = max((g['number'] for g in groups if (output/f"{g['number']}-sequence").is_dir()), default=0)
                if current > last:
                    last = current
                    print(f'Capturing window {current}/{len(groups)} in the same CS2 session.', flush=True)
                    progress('capturing', captureWindow=current, captureWindows=len(groups))

        watcher = threading.Thread(target=watch_windows, daemon=True)
        watcher.start()
        print('Starting CS2 once for all session windows. Capture log: '+str(output/'capture.log'), flush=True)
        capture_error = None
        try:
            capture_log = run([csdm, 'video', '--config-file', str(config_path),
                               '--ffmpeg-executable-path', ffmpeg],
                              timeout=max(900, int(duration*8+len(groups)*45+180)), env=capture_env,
                              log_path=output/'capture.log',
                              startup_ready=lambda: any((output/f"{g['number']}-sequence").is_dir() for g in groups))
        except Exception as exc:
            capture_error = exc
            capture_log = ((output/'capture.log').read_text('utf-8', errors='replace')
                           if (output/'capture.log').exists() else '') + '\n' + str(exc)
        finally:
            capture_done.set()
            watcher.join()
        (output/'capture.log').write_text(capture_log, encoding='utf-8')
        if isinstance(capture_error, CaptureStartupError) and not _retry:
            # A transient game/plugin launch can recover on a clean second launch.
            # run() has already closed the owned process tree; keep the same lease
            # and requested windows, but never reuse the failed attempt's media.
            stop.set()
            print('Capture did not start. Retrying once with a clean CS2 session.', flush=True)
            return record_session(base, jobs, args, csdm, ffmpeg, _retry=True)
        progress('encoding')
        failures = 0
        prepared = {}
        for group in groups:
            source = output/f"sequence-{group['number']}-tick-{group['startTick']}-to-{group['endTick']}.mp4"
            for job in group['jobs']:
                try:
                    if not source.is_file() or source.stat().st_size < 1024:
                        raise RuntimeError(str(capture_error or 'CS:DM did not produce this sequence. See capture.log.'))
                    key = (group['number'], job['startTick'], job['endTick'])
                    ready = prepared.get(key, output/f"{job['id']}.mp4")
                    exact = (job['startTick'], job['endTick']) == (group['startTick'], group['endTick'])
                    if exact:
                        # CS:DM already produced H.264/AAC. Only move the MP4 index for browser seeking.
                        options = ['-i', str(source), '-map', '0:v:0', '-map', '0:a?', '-c', 'copy']
                    else:
                        offset = (job['startTick']-group['startTick'])/group['tickRate']
                        length = (job['endTick']-job['startTick'])/group['tickRate']
                        # Decode at the cut to retain exact context, rather than rounding to a keyframe.
                        options = ['-ss', f'{offset:.8f}', '-i', str(source), '-t', f'{length:.8f}',
                                   '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'fast',
                                   '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac']
                    if key not in prepared:
                        run([ffmpeg, '-v', 'error', *options, '-movflags', '+faststart', str(ready)], timeout=180)
                        prepared[key] = ready
                    progress('uploading', [job])
                    call(base, f"/api/recordings/{job['id']}/upload?lease={job['lease']}", file=ready)
                    pending.pop(job['id'])
                    print(f"Saved clip {len(jobs)-len(pending)}/{len(jobs)}, round {job['round']}, "
                          f"{job['start']:.2f}-{job['end']:.2f}s.", flush=True)
                except Exception as exc:
                    failures += 1
                    fail(job, exc)
        print(f'Session finished in {time.monotonic()-began:.1f}s; {failures} failed clips.', flush=True)
        return failures == 0
    except BaseException as exc:
        for job in list(pending.values()):
            fail(job, exc)
        raise
    finally:
        stop.set()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8765')
    parser.add_argument('--cache', type=Path, default=Path('.local/label-recordings'))
    parser.add_argument('--csdm', default='csdm')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--recording-system', choices=['HLAE', 'CS'], default='HLAE' if os.name == 'nt' else 'CS')
    parser.add_argument('--once', action='store_true', help='Process at most one recording session, then exit.')
    parser.add_argument('--session-size', type=int, default=128, help='Maximum clips per CS2 session (1-128).')
    parser.add_argument('--check', action='store_true', help='Check prerequisites without claiming work or opening CS2.')
    args = parser.parse_args()
    with recorder_lock(args.cache.resolve()):
        serve(args, parser)


def serve(args, parser):
    if not 1 <= args.session_size <= 128:
        parser.error('--session-size must be between 1 and 128.')
    base = args.url.rstrip('/')
    address = urlsplit(base)
    if address.scheme != 'http' or address.hostname not in ('127.0.0.1', 'localhost', '::1') or address.path or address.query:
        parser.error('Use the local labeler URL (http://127.0.0.1:8765).')
    csdm = shutil.which(args.csdm)
    ffmpeg = shutil.which(args.ffmpeg)
    bundled = Path.home() / '.csdm/ffmpeg/bin/ffmpeg.exe'
    if not ffmpeg and bundled.is_file():
        ffmpeg = str(bundled)
    if not csdm or not ffmpeg:
        parser.error('Install/configure CS Demo Manager and FFmpeg; use --csdm / --ffmpeg for explicit paths.')
    print(run([csdm, 'video', '--help'])[:100], flush=True)
    with urlopen(base + '/health', timeout=10) as response:
        if json.load(response).get('status') != 'ok':
            parser.error('The labeler is not ready.')
    if os.name == 'nt':
        output = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq steam.exe', '/FO', 'CSV'],
                                capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW).stdout
        if 'steam.exe' not in output.lower():
            parser.error('Steam is not running. Open Steam, sign in and then restart this recorder.')
    if args.check:
        print('CLI, FFmpeg, labeler and Steam process checks passed. CS2, database and capture still need a real recording test.')
        return
    print('Waiting for Record context requests from the labeler. Ctrl+C stops the worker.', flush=True)
    def heartbeat():
        while True:
            try:
                call(base, '/api/recordings/heartbeat')
            except (URLError, OSError, RuntimeError):
                pass
            time.sleep(5)
    threading.Thread(target=heartbeat, daemon=True).start()
    disconnected = False
    while True:
        try:
            jobs = call(base, '/api/recordings/claim-session', {'limit': args.session_size})
            if disconnected:
                print('Labeler reconnected; resuming the recording queue.', flush=True)
            disconnected = False
        except (URLError, OSError, RuntimeError) as exc:
            if args.once:
                raise
            if not disconnected:
                print(f'Labeler unavailable; waiting to reconnect: {exc}', flush=True)
            disconnected = True
            time.sleep(5)
            continue
        if jobs:
            try:
                success = record_session(base, jobs, args, csdm, ffmpeg)
                if args.once and not success:
                    raise SystemExit(1)
            except Exception as exc:
                print(f'Recording failed: {exc}', flush=True)
                if args.once:
                    raise SystemExit(1)
        if args.once:
            return
        # Drain another demo immediately; idle clicks are picked up within 0.5 s.
        if not jobs:
            time.sleep(.5)


if __name__ == '__main__':
    main()
