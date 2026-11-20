"""Host bridge regression checks, without launching games or contacting services."""
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch, Mock

import record_label_clips as recorder


class RecorderTests(unittest.TestCase):
    def test_session_merges_contexts_launches_once_and_keeps_exact_cuts(self):
        self.exercise_session()

    def test_one_rejected_upload_does_not_discard_other_clips(self):
        self.exercise_session(fail_one=True)

    def test_identical_windows_encode_once_but_upload_every_identity(self):
        self.exercise_session(duplicate=True)

    def test_stalled_start_retries_once_in_a_fresh_directory(self):
        self.exercise_session(stall_first=True)

    def test_csdm_321_nested_output_is_detected_and_uploaded(self):
        self.exercise_session(nested=True)

    def test_native_capture_does_not_require_hlae_startup_directory(self):
        self.exercise_session(native=True)

    def test_repeated_hlae_startup_failure_uses_one_native_attempt(self):
        self.exercise_session(native_fallback=True)

    def exercise_session(self, fail_one=False, duplicate=False, stall_first=False, nested=False, native=False, native_fallback=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = b'QA demo bytes, not real gameplay'
            identity = 'demo-' + hashlib.sha256(source).hexdigest()
            (root / f'{identity}.dem').write_bytes(source)
            job = dict(id='a'*32, lease='b'*32, demo=identity, player='76561198000000001',
                       round=2, start=5., end=20., startTick=5551, endTick=6511)
            jobs = [job, {**job, 'id':'c'*32, 'start':10., 'end':25., 'startTick':5871, 'endTick':6831},
                    {**job, 'id':'d'*32, 'start':30., 'end':45., 'startTick':7151, 'endTick':8111}]
            args = SimpleNamespace(cache=root, recording_system='CS' if native else 'HLAE')
            if duplicate:
                jobs.append({**job, 'id': 'e'*32})
            commands = []

            def fake_run(command, **options):
                commands.append((command, options))
                if command[1] == 'json':
                    roster = Path(command[command.index('--output-folder')+1])
                    (roster/'match.json').write_text(json.dumps({'players':[{'steamId':job['player']}]}))
                elif command[1] == 'video':
                    config = json.loads(Path(command[command.index('--config-file')+1]).read_text('utf-8'))
                    output = Path(config['outputFolderPath'])
                    native_output = config['recordingSystem'] == 'CS'
                    if native_fallback and not native_output:
                        raise recorder.CaptureStartupError('QA incompatible HLAE hook')
                    if native_fallback:
                        assert output.name.endswith('-native')
                    if stall_first and sum(c[1] == 'video' for c, _ in commands) == 1:
                        raise recorder.CaptureStartupError('QA capture startup stalled')
                    if stall_first:
                        assert output.name.endswith('-retry1')
                    if nested:
                        output = output / 'abcdef01-2345-6789-abcd-ef0123456789'
                        output.mkdir()
                    assert len(config['sequences']) == 2
                    assert config['closeGameAfterRecording'] and not config['concatenateSequences']
                    for sequence in config['sequences']:
                        assert sequence['playerCameras'][0]['playerSteamId'] == job['player']
                        assert sequence['playerCameras'][0]['tick'] == sequence['startTick']-32
                        assert not sequence['showXRay'] and not sequence['showOnlyDeathNotices']
                        if not native_output:
                            (output/f"{sequence['number']}-sequence").mkdir()
                        name = f"sequence-{sequence['number']}-tick-{sequence['startTick']}-to-{sequence['endTick']}.mp4"
                        (output/name).write_bytes(b'Q'*2048)
                    if native_output:
                        assert options['startup_ready'] is None and options['timeout'] >= 900
                    else:
                        assert options['startup_ready']()
                elif command[0] == 'ffmpeg':
                    Path(command[-1]).write_bytes(b'Q'*2048)
                return 'mock success'

            def fake_call(base, route, *args, **kwargs):
                if fail_one and '/'+job['id']+'/upload?' in route:
                    raise RuntimeError('QA rejected duration')

            with patch.object(recorder, 'run', side_effect=fake_run), patch.object(recorder, 'call', side_effect=fake_call) as upload:
                assert recorder.record_session('http://127.0.0.1:8765', jobs, args, 'csdm', 'ffmpeg') is not fail_one
            command, options = next((c, o) for c, o in commands if c[1] == 'video')
            assert len([c for c, _ in commands if c[1] == 'video']) == (3 if native_fallback else 2 if stall_first else 1)
            assert int(options['env']['CSDM_WS_PORT']) > 0
            assert options['env']['CSDM_WS_PORT'] != '4574'
            uploads = [c for c in upload.call_args_list if '/upload?' in c.args[1]]
            assert len(uploads) == len(jobs)
            failures = [c for c in upload.call_args_list if '/fail?' in c.args[1]]
            assert len(failures) == int(fail_one)
            if fail_one:
                assert '/'+job['id']+'/fail?' in failures[0].args[1]
            cuts = [c for c, _ in commands if c[0] == 'ffmpeg']
            assert len(cuts) == 3
            assert cuts[1][cuts[1].index('-ss')+1] == '5.00000000'
            assert cuts[1][cuts[1].index('-t')+1] == '15.00000000'
            assert '-ss' not in cuts[2] and cuts[2][cuts[2].index('-c')+1] == 'copy'
            assert cuts[2][cuts[2].index('-t')+1] == '15.00000000'

    def test_grouping_never_merges_across_rounds(self):
        jobs = [dict(id='a', round=1, startTick=640, endTick=1280, start=0, end=10),
                dict(id='b', round=2, startTick=1280, endTick=1920, start=0, end=10)]
        assert len(recorder.group_windows(jobs)) == 2

    def test_zero_exit_database_error_is_not_success(self):
        process = SimpleNamespace(returncode=0, communicate=lambda timeout: ('Error: connect ECONNREFUSED 127.0.0.1:5432', None))
        with patch.object(recorder.subprocess, 'Popen', return_value=process):
            with self.assertRaisesRegex(RuntimeError, 'PostgreSQL'):
                recorder.run(['csdm', 'analyze', 'qa.dem'])

    def test_zero_exit_failed_analysis_is_not_success(self):
        for output in ('Failed to analyze ancient.dem\n0 analyzed / 1 failed',
                       'The demo source could not be detected, use --source to force one',
                       'Failed demos:\nancient.dem'):
            process = SimpleNamespace(returncode=0, communicate=lambda timeout: (output, None))
            with self.subTest(output=output), patch.object(recorder.subprocess, 'Popen', return_value=process):
                with self.assertRaises(RuntimeError):
                    recorder.run(['csdm', 'analyze', 'qa.dem'])

    def test_unknown_source_fallback_requires_selected_player_in_roster(self):
        player = '76561198176358539'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = []
            def fake_run(command, **options):
                commands.append(command)
                if command[1] == 'analyze' and '--source' not in command:
                    raise RuntimeError('The demo source could not be detected, use --source to force one')
                if command[1] == 'json':
                    roster = Path(command[command.index('--output-folder')+1])
                    (roster/'match.json').write_text(json.dumps({'players':[{'steamId':player,'name':'zock9'}]}))
                return 'success'
            with patch.object(recorder, 'run', side_effect=fake_run):
                recorder.prepare_recording_demo('csdm', root/'match.dem', root, player)
            self.assertEqual(commands[1][-2:], ['--source', 'valve'])
            self.assertIn('fallback', (root/'analysis.log').read_text())

    def test_failed_analysis_does_not_attempt_export_or_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(recorder, 'run', side_effect=RuntimeError('Malformed demo')) as run:
                with self.assertRaisesRegex(RuntimeError, 'Malformed demo'):
                    recorder.prepare_recording_demo('csdm', root/'match.dem', root, '76561198176358539')
                self.assertEqual(run.call_count, 1)

    def test_fallback_failure_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(recorder, 'run', side_effect=[
                RuntimeError('The demo source could not be detected'), RuntimeError('Failed to analyze match.dem')
            ]) as run:
                with self.assertRaisesRegex(RuntimeError, 'Failed to analyze'):
                    recorder.prepare_recording_demo('csdm', root/'match.dem', root, '76561198176358539')
                self.assertEqual(run.call_count, 2)

    def test_mixed_players_never_start_a_session(self):
        with tempfile.TemporaryDirectory() as directory:
            job = dict(id='a'*32, lease='b'*32, demo='demo-'+'c'*64, player='76561198176358539',
                       round=1, start=0, end=10, startTick=1000, endTick=1640)
            with patch.object(recorder, 'run') as run:
                with self.assertRaisesRegex(ValueError, 'one demo, player and lease'):
                    recorder.record_session('unused', [job, {**job, 'id':'d'*32, 'player':'76561198000000001'}],
                                            SimpleNamespace(cache=Path(directory)), 'csdm', 'ffmpeg')
                run.assert_not_called()

    def test_missing_selected_player_rejects_other_players_roster(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def fake_run(command, **options):
                if command[1] == 'json':
                    (root/'roster'/'match.json').write_text(json.dumps({'players':[{'steamId':'76561198000000001'}]}))
                return 'success'
            with patch.object(recorder, 'run', side_effect=fake_run):
                with self.assertRaisesRegex(RuntimeError, 'selected player is missing'):
                    recorder.prepare_recording_demo('csdm', root/'match.dem', root, '76561198176358539')

    def test_ambiguous_outputs_are_not_substituted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            group = dict(number=2, startTick=300, endTick=600)
            for name in ('first', 'second'):
                (root/name).mkdir()
                (root/name/'sequence-2-tick-300-to-600.mp4').write_bytes(b'video')
            with self.assertRaisesRegex(RuntimeError, 'ambiguous'):
                recorder.captured_sequence(root, group)

    def test_worker_lock_is_exclusive_and_released(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            with recorder.recorder_lock(cache):
                with self.assertRaisesRegex(RuntimeError, 'already owns'):
                    with recorder.recorder_lock(cache):
                        self.fail('Second recorder acquired the same cache')
            with recorder.recorder_lock(cache):
                pass

    def test_missing_capture_fails_fast_and_cleans_up_owned_process(self):
        process = Mock(pid=1234)
        process.poll.return_value = None
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory)/'capture.log'
            with patch.object(recorder.subprocess, 'Popen', return_value=process), \
                 patch.object(recorder, 'capture_job', return_value=lambda: None), \
                 patch.object(recorder.subprocess, 'run') as terminate, \
                 patch.object(recorder.time, 'monotonic', side_effect=[0, 91]):
                with self.assertRaisesRegex(RuntimeError, 'no capture window'):
                    recorder.run(['csdm', 'video'], log_path=log, startup_ready=lambda: False)
                if recorder.os.name == 'nt':
                    self.assertEqual(terminate.call_args.args[0], ['taskkill', '/PID', '1234', '/T', '/F'])
                else:
                    process.kill.assert_called_once()
                self.assertTrue(log.exists())

    @unittest.skipUnless(recorder.os.name == 'nt', 'Windows capture ownership')
    def test_job_closes_child_even_after_launcher_exits(self):
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        code = ('import subprocess,sys,time; '
                'p=subprocess.Popen([sys.executable,"-c","import time; time.sleep(30)"]); '
                'print(p.pid,flush=True); time.sleep(.5)')
        proc = subprocess.Popen([sys.executable, '-c', code], stdout=subprocess.PIPE, text=True)
        release = recorder.capture_job(proc)
        handle = None
        try:
            child = int(proc.stdout.readline())
            handle = kernel.OpenProcess(0x100000, False, child)
            self.assertTrue(handle)
            proc.wait(timeout=5)
            self.assertEqual(kernel.WaitForSingleObject(handle, 0), 258)
        finally:
            release()
            proc.stdout.close()
        try:
            self.assertEqual(kernel.WaitForSingleObject(handle, 5000), 0)
        finally:
            if handle:
                kernel.CloseHandle(handle)


if __name__ == '__main__':
    unittest.main()
