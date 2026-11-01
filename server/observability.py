"""Bounded, authenticated queries over the server-owned operation logs."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
import shutil
import time

STARTED = time.monotonic()
MAX_RECORDS = 100000


def _records(data_dir):
    root = Path(data_dir) / 'logs'
    paths = [root / 'operations.jsonl'] + [root / f'operations.jsonl.{i}' for i in range(1, 5)]
    scanned = 0
    for path in paths:
        try:
            if path.is_symlink() or not path.is_file():
                continue
            content = path.read_bytes()
        except OSError:
            continue
        for line in reversed(content.splitlines()):
            if scanned >= MAX_RECORDS:
                return
            scanned += 1
            try:
                value = json.loads(line)
            except (ValueError, UnicodeDecodeError):
                continue
            if isinstance(value, dict) and isinstance(value.get('timestamp'), str):
                yield value


def _time(value):
    try:
        stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return stamp if stamp.tzinfo else None
    except (ValueError, TypeError):
        return None


def severity(record):
    event = record.get('event', '')
    status = record.get('status')
    if (event.endswith('.failed') or isinstance(status, int) and status >= 500
            or record.get('return_code') not in (None, 0)):
        return 'error'
    if (isinstance(status, int) and status >= 400
            or record.get('timelapse_error') or record.get('preview_error')):
        return 'warning'
    return 'info'


def _params(query):
    def integer(name, default, maximum):
        raw = query.get(name, [str(default)])[0]
        if not raw.isdecimal() or int(raw) > maximum:
            raise ValueError('Invalid ' + name)
        return int(raw)
    hours = integer('hours', 24, 24 * 30)
    limit = integer('limit', 100, 200)
    offset = integer('offset', 0, MAX_RECORDS)
    if limit < 1 or hours < 1:
        raise ValueError('Invalid time range or limit')
    filters = {key: query.get(key, [''])[0].strip() for key in ('level', 'event', 'trace_id', 'q')}
    if filters['level'] not in ('', 'info', 'warning', 'error'):
        raise ValueError('Invalid severity')
    if any(len(value) > 120 for value in filters.values()):
        raise ValueError('Filter is too long')
    return hours, limit, offset, filters


def query_events(data_dir, query):
    hours, limit, offset, filters = _params(query)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    matches = []
    count = 0
    for record in _records(data_dir):
        stamp = _time(record['timestamp'])
        if stamp is None or stamp < cutoff:
            continue
        level = severity(record)
        if (filters['level'] and filters['level'] != level
                or filters['event'] and filters['event'].lower() not in str(record.get('event', '')).lower()
                or filters['trace_id'] and filters['trace_id'] != record.get('trace_id')
                or filters['q'] and filters['q'].lower() not in json.dumps(record, ensure_ascii=False).lower()):
            continue
        if count >= offset and len(matches) < limit:
            matches.append({**record, 'level': level})
        count += 1
    return {'events': matches, 'total': count, 'offset': offset, 'limit': limit,
            'hours': hours, 'scan_limit': MAX_RECORDS}


def summary(data_dir, query):
    hours, _, _, _ = _params(query)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    bucket_hours = 1 if hours <= 48 else 6 if hours <= 168 else 24
    bucket_end = now.replace(minute=0, second=0, microsecond=0)
    bucket_end = bucket_end.replace(hour=(bucket_end.hour // bucket_hours) * bucket_hours)
    events = Counter()
    levels = Counter()
    hourly = Counter()
    durations = []
    recent_errors = []
    printer = None
    count = 0
    upload_failures = 0
    command_failures = 0
    for record in _records(data_dir):
        stamp = _time(record['timestamp'])
        if stamp is None or stamp < cutoff:
            continue
        count += 1
        name = str(record.get('event', ''))
        level = severity(record)
        events[name] += 1
        levels[level] += 1
        if name == 'printer.transaction.failed' and record.get('operation') in ('upload', 'upload_and_print'):
            upload_failures += 1
        if name.startswith('printer.command.') and (name.endswith('.failed') or record.get('return_code') not in (None, 0)):
            command_failures += 1
        bucket = stamp.replace(minute=0, second=0, microsecond=0)
        bucket = bucket.replace(hour=(bucket.hour // bucket_hours) * bucket_hours)
        hourly[bucket.isoformat()] += 1
        if name == 'http.request.completed' and isinstance(record.get('duration_ms'), (int, float)):
            durations.append(record['duration_ms'])
        if level == 'error' and len(recent_errors) < 5:
            recent_errors.append({**record, 'level': level})
        if (printer is None and name == 'printer.command.completed'
                and record.get('command', [None])[0] == 'status' and record.get('return_code') == 0):
            try:
                state = json.loads(record.get('stdout', '{}'))
                printer = {'timestamp': record['timestamp'],
                           'machine_status': state.get('machine_status'),
                           'progress_percent': state.get('progress_percent')}
            except (ValueError, TypeError, AttributeError):
                pass
    durations.sort()
    def percentile(p):
        return round(durations[min(len(durations) - 1, int((len(durations) - 1) * p))], 1) if durations else None
    root = Path(data_dir) / 'logs'
    log_bytes = 0
    for index in ('', '.1', '.2', '.3', '.4'):
        path = root / ('operations.jsonl' + index)
        try:
            if path.is_file() and not path.is_symlink():
                log_bytes += path.stat().st_size
        except OSError:
            pass
    try:
        rss = int(Path('/proc/self/statm').read_text().split()[1]) * os.sysconf('SC_PAGE_SIZE')
    except (OSError, ValueError, IndexError):
        rss = None
    try:
        disk = shutil.disk_usage(data_dir if Path(data_dir).exists() else Path(data_dir).parent)
        disk_free = disk.free
    except OSError:
        disk_free = None
    try:
        load = [round(value, 2) for value in os.getloadavg()]
    except OSError:
        load = None
    return {'window_hours': hours, 'observed_at': now.isoformat(), 'uptime_seconds': int(time.monotonic() - STARTED),
            'server': {'memory_rss_bytes': rss, 'disk_free_bytes': disk_free, 'load_average': load},
            'events_total': count, 'levels': dict(levels), 'events': dict(events.most_common(20)),
            'http_latency_ms': {'p50': percentile(.5), 'p95': percentile(.95)},
            'slices': {'completed': events['slice.completed'], 'failed': events['slice.failed']},
            'uploads': {'confirmed': events['printer.upload.confirmed'], 'failed': upload_failures},
            'printer_command_failures': command_failures,
            'recent_errors': recent_errors, 'printer': printer, 'log_bytes': log_bytes,
            'hourly': [{'hour': (bucket_end - timedelta(hours=index * bucket_hours)).isoformat(),
                        'count': hourly[(bucket_end - timedelta(hours=index * bucket_hours)).isoformat()]}
                       for index in reversed(range(min(48, math.ceil(hours / bucket_hours))))]}
