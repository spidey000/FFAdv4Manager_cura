#!/usr/bin/env python3
"""Reproducibly replace legacy frontend with the pinned MosaicSlicer + overlays."""
from pathlib import Path
import json
import shutil

ROOT=Path(__file__).resolve().parents[1]
UP=ROOT/"vendor/mosaic-slicer"
DEST=ROOT/"frontend"
OV=ROOT/"overlays/mosaic"

def patch(path, old, new):
    target=DEST/path
    text=target.read_text(encoding="utf-8")
    if old not in text: raise RuntimeError("Mosaic upstream API changed: "+path)
    target.write_text(text.replace(old,new,1),encoding="utf-8")

def build():
    if not (UP/"src/index.mjs").is_file():
        raise RuntimeError("Missing MosaicSlicer git submodule")
    if DEST.is_symlink(): raise RuntimeError("Refusing frontend symlink")
    shutil.rmtree(DEST,ignore_errors=True)
    DEST.mkdir()
    for d in ("src","public","styles","scripts"):
        shutil.copytree(UP/d,DEST/d)
    for f in ("package.json","webpack.config.js"):
        shutil.copy2(UP/f,DEST/f)
    (DEST/"third_party").symlink_to((UP/"third_party").resolve(),target_is_directory=True)
    shutil.copy2(OV/"src/gui/slicer.mjs",DEST/"src/gui/slicer.mjs")
    shutil.copy2(OV/"public/ad4-manager.js",DEST/"public/ad4-manager.js")
    shutil.copy2(OV/"public/ad4.css",DEST/"public/ad4.css")
    shutil.copy2(OV/"public/ad4-studio.css",DEST/"public/ad4-studio.css")
    shutil.copy2(OV/"public/ad4-studio.js",DEST/"public/ad4-studio.js")
    webpack=DEST/"webpack.config.js"
    cfg=webpack.read_text()
    marker=',\n  {\n    name: "curaengine_worker"'
    if marker not in cfg: raise RuntimeError("Cannot remove client-side Cura worker")
    webpack.write_text(cfg[:cfg.index(marker)]+"\n];\n")
    (DEST/"src/engine/index.mjs").write_text('export const backend="server";\n')
    pkg=DEST/"package.json"
    data=json.loads(pkg.read_text())
    data["name"]="ffadv4manager-mosaic"
    data["dependencies"].pop("@mosaicslicer/curaengine",None)
    pkg.write_text(json.dumps(data,indent=2)+"\n")
    with (DEST/"src/gui/index.mjs").open("a",encoding="utf-8") as stream:
        stream.write('\nexport * as slicer from "./slicer.mjs";\n')
    settings=DEST/"src/settings/index.mjs"
    source=settings.read_text()
    start=source.index("export function apply_prefs() {")
    stop=source.index("export function export_prefs()",start)
    replacement="""export function apply_prefs() {
  prefs.active_printer = null;
  prefs.printers = {};
  loaded_printers.length = 0;
  const printer = load_container("flashforge_adventurer4");
  set_active_printer(printer);
  const global = printer.containers.global.active_profiles.user.values;
  const filament = printer.containers.extruders[0].active_profiles.user.values;
  Object.assign(global, {
    machine_width:220, machine_depth:200, machine_height:250,
    machine_center_is_zero:true, machine_extruder_count:1, machine_nozzle_size:0.4,
    layer_height:0.2, speed_print:40, speed_travel:80,
    acceleration_print:650, acceleration_travel:950,
    material_print_temperature:205, material_print_temperature_layer_0:210,
    material_bed_temperature:55, material_bed_temperature_layer_0:55,
    adhesion_type:"skirt"
  });
  Object.assign(filament, {
    material_diameter:1.75, material_print_temperature:205,
    material_print_temperature_layer_0:210, material_bed_temperature:55,
    material_bed_temperature_layer_0:55
  });
  printer.update_settings();
}

"""
    settings.write_text(source[:start]+replacement+source[stop:])
    patch("src/gui/options.mjs","filament_name.innerText = material_name;",
          'filament_name.innerText = "Artillery PLA Basic";')
    # Network failures/cancellations must restore the Slice button instead of
    # leaving MosaicSlicer's progress state stuck indefinitely.
    actions=DEST/"src/gui/actions.mjs"
    action_code=actions.read_text()
    start='  let slice_info = await slicer.slice(export_stl(), (progress) => {'
    finish='  set_active_state(slice_export_div);\n});'
    if start not in action_code or finish not in action_code:
        raise RuntimeError("Mosaic slice button implementation changed")
    action_code=action_code.replace(start, '  try {\n'+start, 1)
    action_code=action_code.replace(finish,
        '  set_active_state(slice_export_div);\n'
        '  } catch (error) {\n'
        '    clear_slice_state();\n'
        '    notify("Server-side CuraEngine unavailable", error?.message || String(error));\n'
        '  }\n'
        '});', 1)
    actions.write_text(action_code)
    html=DEST/"public/index.html"
    source=html.read_text()
    if "</body>" not in source or "<h1>MosaicSlicer</h1>" not in source:
        raise RuntimeError("Unexpected Mosaic HTML")
    source=source.replace("<h1>MosaicSlicer</h1>","<h1>AD4 Studio</h1>")
    source=source.replace('<link rel="stylesheet" href="main.css">',
          '<link rel="stylesheet" href="main.css"><link rel="stylesheet" href="ad4.css">'
          '<link rel="stylesheet" href="ad4-studio.css">')
    source=source.replace('<div class="flex-spacer"></div>\n      <a class="info-link"',
          '<div class="flex-spacer"></div>\n      <button id="ad4-open-manager" type="button" aria-label="Open Adventurer 4 printer manager">AD4 · Printer</button>\n      <a class="info-link"',1)
    dialog="""<dialog id="ad4-manager" aria-label="Adventurer 4 printer manager">
  <div class="ad4-head"><h2>FlashForge Adventurer 4</h2><button id="ad4-close-manager">Close</button></div>
  <div class="ad4-grid">
    <div class="ad4-stat"><span>Printer</span><strong id="ad4-machine">—</strong></div>
    <div class="ad4-stat"><span>Nozzle</span><strong id="ad4-nozzle">—</strong></div>
    <div class="ad4-stat"><span>Bed</span><strong id="ad4-bed">—</strong></div>
    <div class="ad4-stat"><span>Progress</span><strong id="ad4-progress">—</strong></div>
    <div class="ad4-stat"><span>Layer</span><strong id="ad4-layer">—</strong></div>
    <div class="ad4-stat"><span>Current file</span><strong id="ad4-file">—</strong></div>
  </div>
  <div class="ad4-tools">
    <button id="ad4-refresh">Refresh</button><button id="ad4-discover">Discover</button>
    <button id="ad4-pause">Pause</button><button id="ad4-resume">Resume</button>
    <button id="ad4-cancel">Cancel print</button><button id="ad4-fan_on">Fan on</button>
    <button id="ad4-fan_off">Fan off</button>
  </div>
  <div class="ad4-tools"><select aria-label="Printer files" id="ad4-files"></select>
    <button id="ad4-print-file">Print stored file</button></div>
  <div class="ad4-tools">
    <button id="ad4-upload">Upload GX only</button><button id="ad4-send-print">Upload & print</button>
    <button id="ad4-snapshot">Camera</button><button id="ad4-timelapse-start">Start timelapse</button>
    <button id="ad4-timelapse-stop">Stop timelapse</button>
  </div>
  <img id="ad4-camera" alt="Latest printer snapshot">
  <p id="ad4-manager-status" role="status">Checking printer...</p>
</dialog>
<script type="module" src="ad4-manager.js"></script>\n<script type="module" src="ad4-studio.js"></script>
"""
    html.write_text(source.replace("</body>",dialog+"</body>"))
    built=html.read_text()
    for required in ("ad4-studio.css", "ad4-studio.js", "ad4-manager.js"):
        if required not in built:
            raise RuntimeError("AD4 Studio asset is not linked: "+required)
    print("AD4 Studio MosaicSlicer frontend generated; slicing remains server-only")
if __name__=="__main__":build()
