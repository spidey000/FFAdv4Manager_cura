"""Bounded, reentrant control-port exclusion shared by CLI and server workers.

Linux service processes running as the same user share flock files. Camera HTTP
traffic does not use this lock. Files must never be unlinked while in use.
"""
from contextlib import contextmanager
from functools import wraps
import fcntl
import hashlib
import os
from pathlib import Path
import tempfile
import threading
import time

_GUARD = threading.Lock()
_LOCKS = {}
_LOCAL = threading.local()


class ControlBusy(RuntimeError):
    pass


@contextmanager
def control_session(host, port, timeout=2.0):
    key = hashlib.sha256(f'{str(host).lower().rstrip(".")}:{int(port)}'.encode()).hexdigest()
    with _GUARD:
        lock = _LOCKS.setdefault(key, threading.RLock())
    deadline = time.monotonic() + timeout
    if not lock.acquire(timeout=timeout):
        raise ControlBusy('Printer control busy; state unavailable, no command sent')
    held = getattr(_LOCAL, 'held', None)
    if held is None:
        held = _LOCAL.held = set()
    descriptor = None
    try:
        if key in held:
            yield
            return
        root = Path(tempfile.gettempdir()) / f'ffadv4manager-control-{os.getuid()}'
        root.mkdir(mode=0o700, exist_ok=True)
        descriptor = os.open(root / (key + '.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        while True:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise ControlBusy('Printer control busy; state unavailable, no command sent')
                time.sleep(0.025)
        held.add(key)
        try:
            yield
        finally:
            held.remove(key)
    finally:
        if descriptor is not None:
            os.close(descriptor)  # Also releases flock after exceptions.
        lock.release()


def serialized(method):
    @wraps(method)
    def wrapped(self, *args, **kwargs):
        with control_session(self.host, self.port):
            return method(self, *args, **kwargs)
    return wrapped
