"""Parse deposited toolpaths and estimate live layers from actual M114 positions.

No printer download command is assumed. Sources keep their provenance explicitly.
"""
from bisect import bisect_right
from collections import OrderedDict
import hashlib
import json
import math
from pathlib import Path
import re
import threading
import time

from ffadv4manager.core.job_file import executable_gcode

NUMBER = r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)'
WORD = re.compile(r'([A-Z])\s*(' + NUMBER + ')', re.I)
MAX_LAYERS = 10000
MAX_SEGMENTS = 120000
# Reject brief travel/Z-hop observations before committing a higher layer.
STABLE_LAYER_SECONDS = 2.5
CACHE = OrderedDict()
LOCK = threading.RLock()


def _arc(start, end, words, clockwise):
    x, y, z = start
    ex, ey, ez = end
    if 'I' in words or 'J' in words:
        cx, cy = x + words.get('I', 0), y + words.get('J', 0)
    elif 'R' in words:
        radius = abs(words['R'])
        dx, dy = ex - x, ey - y
        chord = math.hypot(dx, dy)
        if chord == 0 or chord > 2 * radius + .001:
            raise ValueError('Invalid radius arc in print file')
        h = math.sqrt(max(0, radius * radius - chord * chord / 4))
        sign = (-1 if clockwise else 1) * (-1 if words['R'] < 0 else 1)
        cx, cy = (x + ex) / 2 - sign * dy / chord * h, (y + ey) / 2 + sign * dx / chord * h
    else:
        raise ValueError('Arc has no center or radius')
    a, b = math.atan2(y - cy, x - cx), math.atan2(ey - cy, ex - cx)
    angle = b - a
    if clockwise:
        while angle >= 0:
            angle -= math.tau
    else:
        while angle <= 0:
            angle += math.tau
    radius = math.hypot(x - cx, y - cy)
    if radius > 10000:
        raise ValueError('Arc radius exceeds preview bounds')
    count = min(180, max(2, math.ceil(abs(angle) * max(radius, 1) / 2)))
    points = [start]
    for step in range(1, count):
        t = step / count
        points.append((cx + radius * math.cos(a + angle * t),
                       cy + radius * math.sin(a + angle * t), z + (ez - z) * t))
    points.append(end)
    return list(zip(points, points[1:]))


def parse_toolpath(payload, filename):
    code = executable_gcode(payload, filename).decode('utf-8', errors='replace')
    xyz = [0., 0., 0.]
    extrusion = {'E': 0., 'A': 0.}
    xyz_absolute = True
    e_absolute = True
    scale = 1.
    plane = 17
    marker = None
    current_marker = object()
    layers = []
    deposited = 0
    stride = 1
    rendered = 0
    # First collect real layer heights; z-hop travel is never a deposited layer.
    for line_number, raw in enumerate(code.splitlines(), 1):
        if line_number > 1000000:
            raise ValueError('Toolpath exceeds one million lines')
        comment = re.search(r';\s*LAYER\s*:\s*(-?\d+)', raw, re.I)
        if comment:
            marker = int(comment.group(1))
        line = re.sub(r'\([^)]*\)', '', raw.split(';', 1)[0]).strip().upper()
        line = re.sub(r'^N\d+\s*', '', line)
        match = re.match(r'([GM])(\d+)(?:\.\d+)?', line)
        if not match:
            continue
        family, number = match.group(1), int(match.group(2))
        words = {key.upper(): float(value) for key, value in WORD.findall(line[match.end():])}
        if any(not math.isfinite(v) or abs(v) > 100000000 for v in words.values()):
            raise ValueError('Invalid numeric G-code coordinate')
        if family == 'M':
            if number in (82, 83):
                e_absolute = number == 82
            continue
        if number in (90, 91):
            xyz_absolute = number == 90
            continue
        if number in (20, 21):
            scale = 25.4 if number == 20 else 1.
            continue
        if number in (17, 18, 19):
            plane = number
            continue
        if number == 92:
            for index, axis in enumerate('XYZ'):
                if axis in words:
                    xyz[index] = words[axis] * scale
            for axis in extrusion:
                if axis in words:
                    extrusion[axis] = words[axis] * scale
            continue
        if number not in (0, 1, 2, 3):
            continue
        before = tuple(xyz)
        for index, axis in enumerate('XYZ'):
            if axis in words:
                value = words[axis] * scale
                xyz[index] = value if xyz_absolute else xyz[index] + value
        axis = 'E' if 'E' in words else 'A' if 'A' in words else None
        delta = 0.
        if axis:
            value = words[axis] * scale
            delta = value - extrusion[axis] if e_absolute else value
            extrusion[axis] = value if e_absolute else extrusion[axis] + value
        if delta <= .000001 or (number in (0, 1) and tuple(xyz) == before):
            continue
        if not all(-10000 < value < 10000 for value in xyz):
            raise ValueError('Extruded coordinates exceed preview bounds')
        if number in (2, 3) and plane != 17:
            raise ValueError('Only XY-plane arcs are supported in the live preview')
        segments = (_arc(before, tuple(xyz), {k: v * scale for k, v in words.items()}, number == 2)
                    if number in (2, 3) else [(before, tuple(xyz))])
        z = xyz[2]
        new_layer = not layers or (marker is not None and marker != current_marker and z > layers[-1]['z'] + .025)
        if marker is None and layers and z > layers[-1]['z'] + .025:
            new_layer = True
        if layers and z < layers[-1]['z'] - .1 and marker is None:
            raise ValueError('Non-monotonic deposited layers need explicit layer markers')
        if new_layer:
            if len(layers) >= MAX_LAYERS:
                raise ValueError('Too many layers; continuous-Z jobs need layer markers')
            layers.append({'number': len(layers) + 1, 'z': round(z, 5), 'segments': [], 'moves': 0})
        current_marker = marker
        layer = layers[-1]
        layer['moves'] += len(segments)
        for start, end in segments:
            deposited += 1
            if deposited > 2000000:
                raise ValueError('Toolpath exceeds two million deposited segments')
            if rendered >= MAX_SEGMENTS:
                stride *= 2
                rendered = 0
                for existing in layers:
                    points = existing['segments']
                    existing['segments'] = [v for i in range(0, len(points), 12) for v in points[i:i + 6]]
                    rendered += len(existing['segments']) // 6
            if deposited % stride == 0 or not layer['segments']:
                layer['segments'].extend(round(v, 4) for point in (start, end) for v in point)
                rendered += 1
    if not layers:
        raise ValueError('No deposited extrusion found in this print file')
    heights = [layer['z'] for layer in layers]
    if any(b < a - .025 for a, b in zip(heights, heights[1:])):
        raise ValueError('Non-planar/lowering layer order is not supported')
    return {'layers': layers, 'segment_count': deposited, 'layer_total': len(layers),
            'rendered_segment_count': rendered, 'simplified': rendered < deposited,
            'coordinate_system': 'printer_xyz', 'estimated': True}


def cached_toolpath(path, digest, name):
    with LOCK:
        if digest in CACHE:
            CACHE.move_to_end(digest)
            return CACHE[digest]
    if path.is_symlink() or not path.is_file():
        raise ValueError('Print source is unavailable')
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != digest:
        raise ValueError('Stored print source checksum does not match')
    result = parse_toolpath(payload, name)
    with LOCK:
        CACHE[digest] = result
        while len(CACHE) > 3:
            CACHE.popitem(last=False)
    return result


class LayerTracker:
    """A stable, monotonic estimate; no claim of executed G-code line precision."""
    def __init__(self):
        self.job = None
        self.layer = None
        self.candidate = None
        self.samples = 0
        self.observed_at = 0
        self.candidate_started_at = 0
        self.last_seen = 0
        self.last_progress = None

    def update(self, job, layers, position, *, active=True, printing=True, progress=None):
        now = time.monotonic()
        restarted = (isinstance(progress, (int, float)) and isinstance(self.last_progress, (int, float))
                     and progress + 1 < self.last_progress)
        if self.job != job or not active or restarted or now - self.last_seen > 30:
            self.job, self.layer, self.candidate, self.samples = job, None, None, 0
            self.candidate_started_at = 0
        self.last_seen = now
        self.last_progress = progress
        if not active:
            return None
        if not printing:
            # Paused-head parking/lifting is not deposited material.
            self.candidate, self.samples = None, 0
            return self.layer
        z = next((v for k, v in position.items() if k.upper() == 'Z'), None)
        if not isinstance(z, (float, int)) or not math.isfinite(z):
            return self.layer
        heights = [layer['z'] for layer in layers]
        # Above all actual extrusion (e.g. a parked head) is not a valid layer observation.
        if z < heights[0] - .06 or z > heights[-1] + .6:
            return self.layer
        candidate = max(1, min(len(layers), bisect_right(heights, z + .025)))
        if candidate == self.candidate:
            if now - self.observed_at >= .5:
                self.samples += 1
                self.observed_at = now
        else:
            self.candidate, self.samples = candidate, 1
            self.observed_at = self.candidate_started_at = now
        if (self.samples >= 2 and now - self.candidate_started_at >= STABLE_LAYER_SECONDS
                and (self.layer is None or candidate >= self.layer)):
            self.layer = candidate
        return self.layer

