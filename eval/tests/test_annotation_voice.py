"""Voice transport limits, local-only setup and cleanup on success/failure."""
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from test_annotation import client, store, HEADERS


def enabled(client):
    return patch.object(client.app.state.voice, 'status', return_value={'ready': True})


def test_voice_unavailable_is_explicit(client, monkeypatch, tmp_path):
    monkeypatch.setenv('RR_ANNOTATION_VOICE_MODEL', str(tmp_path/'missing'))
    assert client.get('/api/voice/status').json()['ready'] is False
    assert client.post('/api/voice/transcribe', headers=HEADERS, content=b'audio').status_code == 503


def test_voice_text_language_and_temporary_cleanup(client):
    voice = client.app.state.voice
    def transcribe(source, target, language):
        assert source.read_bytes() == b'test-audio' and language == 'pl'
        return {'text': 'Gracz powinien poczekać.', 'language': language}
    with enabled(client), patch.object(voice, 'transcribe', side_effect=transcribe):
        response = client.post('/api/voice/transcribe?language=pl', headers=HEADERS, content=b'test-audio')
        assert response.json()['text'] == 'Gracz powinien poczekać.'
    assert list(voice.root.iterdir()) == [] and not voice.lock.locked()


def test_voice_failure_cleanup_and_retry(client):
    voice = client.app.state.voice
    with enabled(client), patch.object(voice, 'transcribe', side_effect=HTTPException(422, 'bad audio')):
        assert client.post('/api/voice/transcribe', headers=HEADERS, content=b'bad').status_code == 422
    assert list(voice.root.iterdir()) == [] and not voice.lock.locked()


def test_voice_limits_busy_and_request_protection(client):
    voice = client.app.state.voice
    with enabled(client):
        assert client.post('/api/voice/transcribe', content=b'audio').status_code == 403
        assert client.post('/api/voice/transcribe?language=xx', headers=HEADERS, content=b'a').status_code == 422
        assert client.post('/api/voice/transcribe', headers=HEADERS, content=b'').status_code == 422
        assert client.post('/api/voice/transcribe', headers=HEADERS, content=b'x'*(20*1024*1024+1)).status_code == 413
        voice.lock.acquire()
        try:
            assert client.post('/api/voice/transcribe', headers=HEADERS, content=b'a').status_code == 409
        finally:
            voice.lock.release()
    assert list(voice.root.iterdir()) == []
