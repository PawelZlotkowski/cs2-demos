"""Local, bounded speech transcription. Audio is temporary; only inserted text is saved."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import wave

from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool


def model_path():
    return Path(os.getenv('RR_ANNOTATION_VOICE_MODEL', '/opt/voice-model'))


class Voice:
    def __init__(self, root):
        self.root = root / 'voice-temp'
        self.root.mkdir(exist_ok=True)
        self.lock = threading.Lock()

    def status(self):
        ready = (model_path() / 'model.bin').is_file() and importlib.util.find_spec('faster_whisper') is not None
        return {'ready': ready, 'busy': self.lock.locked(), 'maxSeconds': 180,
                'languages': ['en', 'pl'], 'localOnly': True,
                'detail': 'Local speech recognition is ready.' if ready else 'Local voice model is unavailable. Rebuild the Docker labeler with voice support; see the voice setup instructions.'}

    def transcribe(self, source, target, language):
        flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        try:
            decoded = subprocess.run([os.getenv('RR_FFMPEG_BIN', 'ffmpeg'), '-v', 'error', '-nostdin',
                                      '-protocol_whitelist', 'file,pipe', '-i', str(source), '-t', '181',
                                      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(target)],
                                     capture_output=True, timeout=30, creationflags=flags)
            if decoded.returncode:
                raise HTTPException(422, 'Cannot decode this microphone recording. Try recording again.')
            with wave.open(str(target), 'rb') as wav:
                duration = wav.getnframes() / wav.getframerate()
            if duration > 180:
                raise HTTPException(413, 'Voice notes are limited to three minutes. Record a shorter note.')
            if duration < .2:
                raise HTTPException(422, 'The recording is too short. Speak before stopping.')
            result = subprocess.run([sys.executable, '-m', 'app.annotation.voice_worker', str(target),
                                     str(model_path()), language], capture_output=True, text=True,
                                    encoding='utf-8', timeout=240, creationflags=flags)
            if result.returncode:
                raise HTTPException(503, 'Local transcription failed. Check the installed voice model and retry.')
            return {**json.loads(result.stdout), 'duration': duration}
        except subprocess.TimeoutExpired:
            raise HTTPException(504, 'Local transcription took too long. Try a shorter voice note.') from None
        except FileNotFoundError:
            raise HTTPException(503, 'FFmpeg is required for voice notes. The Docker image includes it.') from None


def install_voice(app, store):
    voice = Voice(store.root)
    app.state.voice = voice

    @app.get('/api/voice/status')
    def status():
        return voice.status()

    @app.post('/api/voice/transcribe')
    async def transcribe(request: Request, language: str = 'en'):
        if language not in ('en', 'pl'):
            raise HTTPException(422, 'Choose English or Polish for this voice note.')
        if not voice.status()['ready']:
            raise HTTPException(503, voice.status()['detail'])
        if not voice.lock.acquire(blocking=False):
            raise HTTPException(409, 'Another voice note is being transcribed. Please try again shortly.')
        try:
            with tempfile.TemporaryDirectory(dir=voice.root) as directory:
                source, target = Path(directory)/'microphone', Path(directory)/'audio.wav'
                size = 0
                with source.open('wb') as output:
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > 20 * 1024 * 1024:
                            raise HTTPException(413, 'Voice recording exceeds 20 MB. Record a shorter note.')
                        output.write(chunk)
                if not size:
                    raise HTTPException(422, 'The microphone recording is empty.')
                return await run_in_threadpool(voice.transcribe, source, target, language)
        finally:
            voice.lock.release()
