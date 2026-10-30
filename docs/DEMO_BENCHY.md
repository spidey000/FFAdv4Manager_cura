# 3DBenchy demo assets

AD4 Studio ships its public GitHub Pages demo with the **original single-part
3DBenchy**, not the earlier simplified cube. These assets are retrieved at
build time (not checked in as large binary blobs) by
[`scripts/fetch_demo_benchy.py`](../scripts/fetch_demo_benchy.py).

| Demo asset | Provenance | Pinned Git blob SHA-1 |
| --- | --- | --- |
| `demo-benchy.stl` | [CreativeTools original STL](https://github.com/CreativeTools/3DBenchy/blob/master/Single-part/3DBenchy.stl), Daniel Norée / Creative Tools | `5a51bb5f3fb335b4617f00b3ae5f3785690e13e5` |
| `demo-benchy.gcode` | [GCode Preview's original 3DBenchy test fixture](https://github.com/xyz-tools/gcode-preview/blob/4f2b58faebe97ca15ee2c901b6c487b8ad34e3e7/demo/gcodes/3DBenchy.gcode) | `1beb78352633d214a38ebfd7567840eb6c7e98ad` |

The original STL has **225,706 triangles** and is about 10.8 MiB. The
G-code represents the same boat shape but was sliced externally, not by
AD4 Studio's Adventurer 4 profile. The build checks exact Git blob checksums,
STL binary format, and the presence of real layer/extrusion commands.
Mismatches fail the build; an arbitrary fallback model is never substituted.

**Safety:** The external G-code is **preview-only, not print-ready** for a
FlashForge Adventurer 4. GitHub Pages cannot slice or access hardware.
Re-slice the original STL using the locally installed native CuraEngine and
the Adventurer 4 / Artillery PLA profile before sending any job to a printer.
The preview may translate its *rendered geometry* to the center of the
virtual bed; the source G-code file is never rewritten.

Licenses: 3DBenchy is published by Creative Tools under
[CC0 1.0](https://www.3dbenchy.com/license/). The preview fixture comes from
[xyz-tools/gcode-preview](https://github.com/xyz-tools/gcode-preview), whose
repository is MIT licensed. Attribution is provided for reproducibility even
where not required.

To reproduce locally:

```bash
python3 scripts/fetch_demo_benchy.py /tmp/ad4-benchy
```

Downloads can be provided from an offline cache via `AD4_BENCHY_CACHE_DIR`;
the cached files must still match the pinned Git blob hashes.
