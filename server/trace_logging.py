"""Small, bounded JSONL tracing for slicer and printer transactions."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import re
import stat
import sys
import threading
import time
import uuid

_LOCAL = threading.local()
_LOCK = threading.RLock()
_LOGGERS: dict[str, logging.Logger] = {}
_SAFE_TRACE_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_URL = re.compile(r"https?://[^\s'\"]+", re.I)


def trace_id() -> str | None:
    return getattr(_LOCAL, "trace_id", None)


def set_incoming_trace_id(value: str | None) -> None:
    _LOCAL.incoming_trace_id = value


def begin_request(data_dir: Path, method: str, path: str, content_length: int = 0) -> tuple[str, float]:
    supplied = getattr(_LOCAL, "incoming_trace_id", None)
    identifier = supplied if isinstance(supplied, str) and _SAFE_TRACE_ID.fullmatch(supplied) else uuid.uuid4().hex
    _LOCAL.trace_id = identifier
    started = time.monotonic()
    event(data_dir, "http.request.started", method=method, path=path,
          content_length=content_length)
    return identifier, started


def end_request(data_dir: Path, method: str, path: str, started: float, status: int | None) -> None:
    event(data_dir, "http.request.completed", method=method, path=path, status=status,
          duration_ms=round((time.monotonic() - started) * 1000, 1))
    _LOCAL.trace_id = None
    _LOCAL.incoming_trace_id = None


def _logger(data_dir: Path) -> logging.Logger:
    path = str(data_dir / "logs" / "operations.jsonl")
    with _LOCK:
        logger = _LOGGERS.get(path)
        if logger is None:
            Path(path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            try:
                Path(path).parent.chmod(0o700)
            except OSError:
                pass
            logger = logging.getLogger("ffadv4.trace." + str(abs(hash(path))))
            logger.setLevel(logging.INFO)
            logger.propagate = False
            handler = RotatingFileHandler(path, maxBytes=5 * 1024 * 1024, backupCount=4,
                                         encoding="utf-8")
            handler.setFormatter(logging.Formatter("%(message)s"))
            logger.addHandler(handler)
            console = logging.StreamHandler(sys.stderr)
            console.setFormatter(logging.Formatter("%(message)s"))
            logger.addHandler(console)
            try:
                Path(path).chmod(0o600)
            except OSError:
                pass
            _LOGGERS[path] = logger
        return logger


def _safe(value):
    if isinstance(value, str):
        value = _URL.sub("<redacted-url>", value)
        return value[:2000]
    if isinstance(value, bytes):
        return {"bytes": len(value)}
    if isinstance(value, dict):
        return {str(key): _safe(item) for key, item in value.items()
                if not re.search(r"token|secret|password|authorization|gcode|assertion", str(key), re.I)}
    if isinstance(value, (list, tuple)):
        return [_safe(item) for item in value[:100]]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return str(value)[:2000]


def event(data_dir: Path, name: str, *, identifier: str | None = None, **fields) -> None:
    """Append one safe structured event; logging must never interrupt a print."""
    record = {"timestamp": datetime.now(timezone.utc).isoformat(), "event": name,
              "trace_id": identifier or trace_id(), **_safe(fields)}
    try:
        _logger(Path(data_dir)).info(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
        log_path = Path(data_dir) / "logs" / "operations.jsonl"
        log_path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except (OSError, ValueError, TypeError):
        pass
