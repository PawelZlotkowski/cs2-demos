import json
from types import SimpleNamespace

import pytest

from app.models.contracts import SelectedMoment
from app.processing.moment_clips import moment_window
from app.processing.video_clips import validate_recorded_media


def moment(t0=4.0, t1=10.0):
    return SelectedMoment(id='m1', round=1, t0=t0, t1=t1, findingIds=['F1'], kind='mistake', pickedBecause='Review evidence')


def test_recording_never_rounds_up_past_round_end():
    start, end = moment_window(moment(), 10.04)
    assert start >= 0 and end == 10.04


@pytest.mark.parametrize('t0,t1,duration', [(20, 21, 10), (2, 1, 10), (0, float('nan'), 10), (0, 1, 0)])
def test_invalid_recording_window_is_rejected(t0, t1, duration):
    with pytest.raises(ValueError):
        moment_window(moment(t0, t1), duration)


@pytest.mark.parametrize('streams,duration,exit_code', [([], 1, 0), ([{'codec_type': 'audio'}], 1, 0), ([{'codec_type': 'video', 'width': 1280, 'height': 720}], 0, 0), ([], 1, 1)])
def test_unreadable_or_audio_only_capture_cannot_be_ready(tmp_path, monkeypatch, streams, duration, exit_code):
    from app.processing import video_clips

    monkeypatch.setattr(video_clips.shutil, 'which', lambda _: 'ffprobe')
    monkeypatch.setattr(video_clips.subprocess, 'run', lambda *a, **kw: SimpleNamespace(returncode=exit_code, stdout=json.dumps({'streams': streams, 'format': {'duration': duration}})))
    with pytest.raises(RuntimeError, match='not a readable video'):
        validate_recorded_media(tmp_path / 'capture.mp4')
