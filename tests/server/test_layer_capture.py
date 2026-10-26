import json
from pathlib import Path
import subprocess
import tempfile
import time
from unittest.mock import patch

from server.layer_capture import LayerCapture, layer_from_position
from server.ad4_bridge import estimated_layer_height


def test_layer_estimates_require_valid_z_and_height():
    assert layer_from_position({'Z': 0.20}, 0.2) == 1
    assert layer_from_position({'z': 0.40}, 0.2) == 2
    assert layer_from_position({'X': 42}, 0.2) is None
    assert layer_from_position({'Z': None}, 0.2) is None
    assert layer_from_position({'Z': 250.5}, 0.2) == 1252


def test_cura_layer_height_metadata_and_fallback():
    assert estimated_layer_height(b'; layer_height: 0.16\nG1 X10\n') == 0.16
    assert estimated_layer_height(b'; layer_height: 2.0\n') == 0.2
    assert estimated_layer_height(b'M114\n') == 0.2


def test_real_layer_snapshot_worker_is_one_capture_per_stable_z():
    with tempfile.TemporaryDirectory() as work:
        count = {'position': 0, 'camera': 0}
        heights = [0.2,0.2,0.2,0.4,0.4,0.4]
        def fake_command(argv, **kwargs):
            if 'position' in argv:
                idx = min(count['position'],len(heights)-1)
                count['position'] += 1
                return subprocess.CompletedProcess(argv, 0,
                    stdout=json.dumps({'Z':heights[idx]}))
            if 'snapshot' in argv:
                count['camera'] += 1
                Path(argv[-1]).write_bytes(b'\xff\xd8data\xff\xd9')
                return subprocess.CompletedProcess(argv, 0, stdout='ok')
            raise AssertionError(argv)
        with patch('server.layer_capture.subprocess.run', side_effect=fake_command):
            worker = LayerCapture(['ffadv4manager'], Path(work),
                                  lambda:{'machine_status':'BUILDING'},
                                  height=0.2,poll_interval=0.005)
            deadline=time.monotonic()+3
            while count['position']<6 and time.monotonic()<deadline:
                time.sleep(0.01)
            worker.terminate()
            worker.wait(timeout=3)
        assert count['camera']==2
        assert len(list(Path(work).glob('frame-*.jpg')))==2


def test_no_frame_when_printer_ready():
    with tempfile.TemporaryDirectory() as work:
        with patch('server.layer_capture.subprocess.run', side_effect=AssertionError('do not poll M114')):
            worker = LayerCapture(['ffadv4manager'], Path(work),
                                  lambda:{'machine_status':'READY'},
                                  height=0.2,poll_interval=0.005)
            time.sleep(0.03)
            worker.terminate()
            worker.wait(timeout=3)
        assert not list(Path(work).glob('*.jpg'))
