"""Server-side timelapse state machine regression tests without printer hardware."""
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from server.timelapse_service import TimelapseService


class FakeCapture:
    def __init__(self):
        self.ended = False

    def poll(self):
        return 0 if self.ended else None

    def terminate(self):
        self.ended = True

    def wait(self, timeout=None):
        self.ended = True
        return 0

    def kill(self):
        self.ended = True


def fake_ffmpeg(command, **kwargs):
    assert '-c:v' in command and command[command.index('-c:v') + 1] == 'libx264'
    assert '-movflags' in command and command[command.index('-movflags') + 1] == '+faststart'
    assert '-pix_fmt' in command and command[command.index('-pix_fmt') + 1] == 'yuv420p'
    Path(command[-1]).write_bytes(b'mock mp4 payload' * 10)
    return subprocess.CompletedProcess(command, 0, stderr=b'')


class TimelapseChecks(unittest.TestCase):
    def test_print_completion_finalizes_mp4_without_browser(self):
        with tempfile.TemporaryDirectory() as work:
            service = TimelapseService(Path(work), interval=0.01, check_interval=0.01)
            camera = FakeCapture()
            states = iter(['BUILDING', 'PAUSED', 'BUILDING', 'READY', 'READY'])
            with patch('server.timelapse_service.TimelapseService.require_encoder', return_value='ffmpeg'), \
                    patch('server.timelapse_service.subprocess.Popen', return_value=camera), \
                    patch('server.timelapse_service.subprocess.run', side_effect=fake_ffmpeg):
                service.start(['ffadv4manager'], status_reader=lambda: {
                    'machine_status': next(states, 'READY')}, auto=True)
                recording = service.folder
                (recording / 'frame-20261026T155000-000000.jpg').write_bytes(b'\xff\xd8mock\xff\xd9')
                deadline = time.monotonic() + 3
                # The MP4 is published atomically before frame cleanup finishes.
                # Wait for the entire worker operation before checking cleanup or
                # letting TemporaryDirectory remove the recording beneath it.
                while (not service.list()[0]['video_ready'] or service.state()['encoding']) and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertFalse(service.state()['encoding'])
                self.assertFalse(service.state()['running'])
                self.assertTrue(service.list()[0]['video_ready'])
                self.assertTrue((recording / 'timelapse.mp4').is_file())
                self.assertEqual(list(recording.glob('frame-*.jpg')), [])
                self.assertEqual(service.list()[0]['reason'], 'print_finished')
                self.assertEqual(service.list()[0]['frames'], 1)

    def test_failed_encode_keeps_all_source_frames_and_recovers(self):
        with tempfile.TemporaryDirectory() as work:
            service = TimelapseService(Path(work))
            camera = FakeCapture()
            with patch('server.timelapse_service.TimelapseService.require_encoder', return_value='ffmpeg'), \
                    patch('server.timelapse_service.subprocess.Popen', return_value=camera):
                service.start(['ffadv4manager'])
                folder = service.folder
                still = folder / 'frame-20261026T155000-000000.jpg'
                still.write_bytes(b'\xff\xd8mock\xff\xd9')
                with patch('server.timelapse_service.subprocess.run',
                           return_value=subprocess.CompletedProcess([], 1, stderr=b'bad frame')):
                    service.stop('manual')
                self.assertTrue(still.exists())
                self.assertFalse(service.list()[0]['video_ready'])
                self.assertIn('bad frame', service.list()[0]['error'])
                with patch('server.timelapse_service.subprocess.run', side_effect=fake_ffmpeg):
                    service.recover()
                self.assertTrue((folder / 'timelapse.mp4').exists())
                self.assertFalse(still.exists())

    def test_recording_cannot_be_deleted_before_finalization(self):
        with tempfile.TemporaryDirectory() as work:
            service = TimelapseService(Path(work))
            with patch('server.timelapse_service.TimelapseService.require_encoder', return_value='ffmpeg'), \
                    patch('server.timelapse_service.subprocess.Popen', return_value=FakeCapture()):
                service.start(['ffadv4manager'])
                identifier = service.folder.name
                with self.assertRaises(ValueError):
                    service.delete(identifier)
                service.stop()
                service.delete(identifier)
                self.assertEqual(service.list(), [])


    def test_custom_fps_and_interval_are_used_for_capture_and_encoding(self):
        with tempfile.TemporaryDirectory() as work:
            service = TimelapseService(Path(work))
            capture = FakeCapture()
            commands = []
            def ffmpeg_spy(argv, **kwargs):
                commands.append(argv)
                return fake_ffmpeg(argv, **kwargs)
            with patch('server.timelapse_service.TimelapseService.require_encoder', return_value='ffmpeg'), \
                    patch('server.timelapse_service.subprocess.Popen', return_value=capture) as popen, \
                    patch('server.timelapse_service.subprocess.run', side_effect=ffmpeg_spy):
                service.start(['ffadv4manager'], fps=24, interval=15)
                self.assertEqual(service.state()['fps'], 24)
                self.assertEqual(service.state()['interval'], 15)
                argv = popen.call_args.args[0]
                self.assertEqual(argv[argv.index('--interval') + 1], '15')
                folder = service.folder
                self.assertEqual(service._metadata(folder)['fps'], 24)
                (folder / 'frame-20261030T155000-000000.jpg').write_bytes(b'\xff\xd8mock\xff\xd9')
                service.stop('manual')
                self.assertEqual(commands[0][commands[0].index('-framerate') + 1], '24')
                self.assertEqual(service.list()[0]['fps'], 24)
                self.assertEqual(service.list()[0]['interval'], 15)

    def test_rejects_invalid_fps_and_interval_before_start(self):
        with tempfile.TemporaryDirectory() as work:
            service = TimelapseService(Path(work))
            for kwargs in ({'fps': 0}, {'fps': 61}, {'fps': '24'}, {'interval': 1}, {'interval': 301}):
                with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                    service.start(['ffadv4manager'], **kwargs)


if __name__ == '__main__':
    unittest.main()

