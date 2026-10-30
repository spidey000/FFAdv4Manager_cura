"""Durable, server-owned AD4 timelapse capture and MP4 encoding.

No browser polling is required. A recording started with a print follows the
printer's status until the job finishes, including across browser disconnects.
"""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import re
import secrets
import shutil
import subprocess
import threading
import time

from .layer_capture import LayerCapture


ID_PATTERN = re.compile(r'\d{8}T\d{6}-[0-9a-f]{8}\Z')
PRINTING = {'BUILDING', 'BUILDING_FROM_SD', 'PRINTING', 'PAUSED'}
VIDEO_NAME = 'timelapse.mp4'


def frames_in(folder):
    return sorted(p for p in folder.glob('frame-*.jpg') if p.is_file() and not p.is_symlink())


def video_in(folder):
    file = folder / VIDEO_NAME
    return file if file.is_file() and not file.is_symlink() and file.stat().st_size > 0 else None


class TimelapseService:
    def __init__(self, root, *, interval=10, check_interval=5):
        self.root = Path(root)
        self.interval = interval
        self.check_interval = check_interval
        self.lock = threading.RLock()
        self.folder = None
        self.worker = None
        self.encoding = None
        self.watching = False
        self.last_error = None
        self.mode = 'interval'
        self.fps = 10
        self.capture_interval = interval
        self._event = None

    def folder_for(self, identifier):
        if not isinstance(identifier, str) or not ID_PATTERN.fullmatch(identifier):
            raise ValueError('Invalid timelapse identifier')
        folder = self.root / identifier
        if not folder.is_dir() or folder.is_symlink():
            raise ValueError('Timelapse not found')
        return folder

    def require_encoder(self):
        """Use ffmpeg provided by this venv; fall back to host if unavailable."""
        try:
            from imageio_ffmpeg import get_ffmpeg_exe
            return get_ffmpeg_exe()
        except (ImportError, RuntimeError, FileNotFoundError, OSError):
            installed = shutil.which('ffmpeg')
            if installed:
                return installed
        raise RuntimeError('FFmpeg H.264 encoder unavailable in the venv or host')

    def _metadata(self, folder):
        file = folder / 'session.json'
        try:
            value = json.loads(file.read_text(encoding='utf-8'))
            return value if isinstance(value, dict) else {}
        except (OSError, ValueError):
            return {}

    def _write_metadata(self, folder, **fields):
        state = {**self._metadata(folder), **fields}
        temp = folder / '.session.tmp'
        temp.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
        os.replace(temp, folder / 'session.json')

    def state(self):
        with self.lock:
            folder = self.folder
            worker = self.worker
            encoding = self.encoding
            watching = self.watching
            error = self.last_error
            running = bool(worker and worker.poll() is None and folder)
            return {'running': running, 'encoding': bool(encoding), 'auto': watching,
                    'id': folder.name if folder else None,
                    'frames': len(frames_in(folder)) if folder and folder.exists() else 0,
                    'mode': self.mode, 'fps': self.fps,
                    'interval': self.capture_interval,
                    'error': error}

    def list(self):
        if not self.root.is_dir():
            return []
        with self.lock:
            active = self.folder
            encoding = self.encoding
        records = []
        for folder in self.root.iterdir():
            if not folder.is_dir() or folder.is_symlink() or not ID_PATTERN.fullmatch(folder.name):
                continue
            meta = self._metadata(folder)
            video = video_in(folder)
            records.append({
                'id': folder.name,
                'created_at': meta.get('created_at') or datetime.strptime(folder.name[:15], '%Y%m%dT%H%M%S').replace(tzinfo=timezone.utc).isoformat(),
                'frames': meta.get('frames') or len(frames_in(folder)),
                'running': folder == active and self.state()['running'],
                'encoding': folder == encoding,
                'video_ready': bool(video),
                'size_bytes': video.stat().st_size if video else None,
                'error': meta.get('error'),
                'reason': meta.get('reason'),
                'auto': meta.get('auto', False),
                'mode': meta.get('mode', 'interval'),
                'fps': meta.get('fps', 10),
                'interval': meta.get('interval', self.interval),
            })
        return sorted(records, key=lambda item: item['id'], reverse=True)

    def start(self, capture_argv, status_reader=None, auto=False, mode='interval', layer_height=0.2, layer_heights=None, fps=10, interval=None):
        if mode not in ('interval', 'layer'):
            raise ValueError('Unknown timelapse capture mode')
        if not 0.06 <= layer_height <= 0.4:
            raise ValueError('Unsupported G-code layer height')
        if type(fps) is not int or not 1 <= fps <= 60:
            raise ValueError('Timelapse FPS must be between 1 and 60')
        if interval is not None and (type(interval) not in (int, float) or not 2 <= interval <= 300):
            raise ValueError('Timelapse interval must be between 2 and 300 seconds')
        interval = self.interval if interval is None else interval
        self.require_encoder()
        with self.lock:
            if self.folder or self.encoding:
                raise ValueError('A timelapse is already recording or encoding')
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            folder = self.root / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + secrets.token_hex(4))
            folder.mkdir(mode=0o700)
            self._write_metadata(folder, created_at=datetime.now(timezone.utc).isoformat(), auto=bool(auto), mode=mode, layer_height=layer_height, fps=fps, interval=interval, error=None, status='recording')
            try:
                worker = (LayerCapture(capture_argv, folder, status_reader, height=layer_height,
                                       **({'layer_heights': layer_heights} if layer_heights else {}))
                          if mode == 'layer' else subprocess.Popen(
                    [*capture_argv, 'camera', 'timelapse', str(folder), '--interval', str(interval)],
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            except Exception:
                shutil.rmtree(folder)
                raise
            self.folder = folder
            self.worker = worker
            self.mode = mode
            self.fps = fps
            self.capture_interval = interval
            self.watching = bool(status_reader)
            self.last_error = None
            event = threading.Event()
            self._event = event
            thread = threading.Thread(target=self._watch, args=(folder, worker, event, status_reader, auto),
                                      daemon=True, name='AD4-timelapse-watch')
            thread.start()
        return self.state()

    def _watch(self, folder, worker, event, status_reader, auto):
        seen_print = False
        ready_streak = 0
        started = time.monotonic()
        while not event.wait(self.check_interval):
            if worker.poll() is not None:
                self.stop('capture_exited')
                return
            if status_reader is None:
                continue
            try:
                status = status_reader()
                machine = (status.get('machine_status') or '').upper()
            except Exception:
                continue  # Unknown/offline must never be mistaken for print completion.
            if machine in PRINTING:
                seen_print = True
                ready_streak = 0
            elif seen_print and machine == 'READY':
                ready_streak += 1
                if ready_streak >= 2:
                    self.stop('print_finished')
                    return
            elif auto and not seen_print and time.monotonic() - started > 1800:
                self.stop('print_not_observed')
                return
            else:
                ready_streak = 0

    def stop(self, reason='manual'):
        with self.lock:
            folder = self.folder
            if not folder or self.encoding:
                return self.state()
            worker = self.worker
            if self._event:
                self._event.set()
            self.folder = None
            self.worker = None
            self.watching = False
            self.encoding = folder
        try:
            if worker and worker.poll() is None:
                worker.terminate()
                try:
                    worker.wait(timeout=12)
                except subprocess.TimeoutExpired:
                    worker.kill()
                    worker.wait(timeout=4)
            self._write_metadata(folder, reason=reason, stopped_at=datetime.now(timezone.utc).isoformat())
            self.encode(folder)
        finally:
            with self.lock:
                self.encoding = None
        return self.state()

    def encode(self, folder):
        """Atomically publish a valid MP4; retain JPEGs when encoding fails."""
        video = video_in(folder)
        if video:
            return video
        pictures = frames_in(folder)
        if not pictures:
            self._write_metadata(folder, status='failed', error='No camera frames were captured')
            self.last_error = 'No camera frames were captured'
            return None
        temp = folder / '.timelapse.partial.mp4'
        try:
            fps = self._metadata(folder).get('fps', 10)
            if type(fps) is not int or not 1 <= fps <= 60:
                raise ValueError('Invalid stored timelapse FPS')
            self.require_encoder()
            result = subprocess.run([
                self.require_encoder(), '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                '-framerate', str(fps), '-pattern_type', 'glob', '-i', str(folder / 'frame-*.jpg'),
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:in_range=full:out_range=limited,format=yuv420p',
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                str(temp),
            ], capture_output=True, timeout=900, check=False)
            if result.returncode or not temp.is_file() or temp.stat().st_size < 100:
                raise RuntimeError(result.stderr.decode('utf-8', errors='replace')[-500:] or 'FFmpeg could not create an MP4')
            os.replace(temp, folder / VIDEO_NAME)
            self._write_metadata(folder, status='complete', error=None, frames=len(pictures))
            for frame in pictures:
                frame.unlink()
            self.last_error = None
            return folder / VIDEO_NAME
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
            message = str(exc)[:500]
            self._write_metadata(folder, status='failed', error=message, frames=len(pictures))
            self.last_error = message
            return None
        finally:
            temp.unlink(missing_ok=True)

    def recover(self):
        """Repair interrupted recordings at server startup; never delete source frames on failure."""
        if not self.root.is_dir():
            return
        for entry in self.root.iterdir():
            if entry.is_dir() and not entry.is_symlink() and ID_PATTERN.fullmatch(entry.name):
                if not video_in(entry) and frames_in(entry):
                    self.encode(entry)

    def delete(self, identifier):
        folder = self.folder_for(identifier)
        with self.lock:
            if folder in (self.folder, self.encoding):
                raise ValueError('Stop the timelapse and finish MP4 encoding before deleting it')
            shutil.rmtree(folder)
        return {'deleted': identifier}

    def shutdown(self):
        self.stop('server_stopped')
