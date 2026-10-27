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
    shutil.copy2(OV/"public/ad4-settings.css",DEST/"public/ad4-settings.css")
    shutil.copy2(OV/"public/ad4-studio.css",DEST/"public/ad4-studio.css")
    shutil.copy2(OV/"public/ad4-studio.js",DEST/"public/ad4-studio.js")
    shutil.copy2(OV/"public/demo-cube-20mm.stl",DEST/"public/demo-cube-20mm.stl")
    shutil.copy2(OV/"src/gui/ad4-presets.mjs",DEST/"src/gui/ad4-presets.mjs")
    shutil.copy2(OV/"src/gui/ad4-settings.mjs",DEST/"src/gui/ad4-settings.mjs")
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
    app_entry=DEST/"src/index.mjs"
    app_code=app_entry.read_text()
    app_code=app_code.replace('import * as resources from "./resources.mjs";',
      'import * as resources from "./resources.mjs";\\nimport {install_ad4_features} from "./gui/ad4-settings.mjs";'.replace('\\n','\n'))
    app_code=app_code.replace('  console.log("Loaded GUI");',
      '  console.log("Loaded GUI");\\n  install_ad4_features();'.replace('\\n','\n'))
    # Prevent an exception in the loader from leaving users with an eternal spinner.
    app_code=app_code.replace('main();', '''
main().catch(error => {
  console.error("AD4 Studio startup failed", error);
  const loading=document.getElementById("loading");
  if (loading) {
    loading.style.display="none";
  }
  const problem=document.createElement("aside");
  problem.id="ad4-startup-error";
  problem.setAttribute("role","alert");
  problem.style.cssText="position:fixed;z-index:200;inset:70px 14px auto;max-width:680px;margin:auto;padding:20px;background:#39282b;border:1px solid #e5a2a2;border-radius:13px;color:#fff;";
  const title=document.createElement("h2");
  title.textContent="Model editor could not start";
  const msg=document.createElement("p");
  msg.textContent=error?.message || String(error);
  const link=document.createElement("button");
  link.type="button";link.textContent="Reload editor";
  link.onclick=()=>location.reload();
  problem.append(title,msg,link);document.body.append(problem);
});
''')
    app_entry.write_text(app_code)
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
    # Adventurer 4 metadata omits exclude_materials. Upstream Mosaic assumes
    # it is always a list and crashes on undefined.includes().
    # Adventurer 4 has no upstream Cura build-plate mesh. A missing
    # metadata.platform previously caused a 404 and undefined.endsWith().
    # Render a geometrically correct 220 x 200 mm build plate instead.
    patch("src/gui/viewer/viewer.mjs",
          '    let res = await fetch("resources/meshes/" + model_filename);',
          """    if (!model_filename) {
      buildplate_mesh = new THREE.Mesh(new THREE.BoxGeometry(220, 1, 200), buildplate_material);
      buildplate_mesh.position.set(0, -0.5, 0);
      scene.add(buildplate_mesh);
      const bedSize = new THREE.Vector3(220, 1, 200);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(bedSize.x, 0.5, bedSize.z), buildplate_shell_material);
      shell.position.y = -1.25;
      scene.add(shell);
      const axes = new AxesBoxesGroup(20);
      axes.position.set(-110, 0.1, 100);
      scene.add(axes);
      return;
    }
    let res = await fetch("resources/meshes/" + model_filename);""")
    patch("src/settings/containers.mjs",
          "let excluded_materials = this.parent_meta.exclude_materials;",
          "let excluded_materials = this.parent_meta.exclude_materials ?? [];")
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
    source=source.replace('id="stl-file" accept=".stl"', 'id="stl-file" accept=".stl,.3mf"')
    source=source.replace('<link rel="stylesheet" href="main.css">',
          '<link rel="stylesheet" href="main.css"><link rel="stylesheet" href="ad4.css"><link rel="stylesheet" href="ad4-settings.css"><link rel="stylesheet" href="ad4-studio.css">')
    source=source.replace('<div class="flex-spacer"></div>\n      <a class="info-link"',
          '<div class="flex-spacer"></div>\n      <button id="ad4-open-manager" type="button" aria-label="Open Adventurer 4 printer manager">AD4 · Printer</button>\n      <a class="info-link"',1)
    dialog="""<dialog id="ad4-manager" aria-label="Adventurer 4 printer manager">
  <header class="ad4-head">
    <div><h2>Adventurer 4</h2><small>Authenticated LAN printer controls</small></div>
    <button type="button" id="ad4-close-manager" aria-label="Close printer manager">×</button>
  </header>
  <p id="ad4-manager-status" role="status" aria-live="polite">Connecting to printer…</p>
  <div class="ad4-grid">
    <div class="ad4-stat"><span>Machine</span><strong id="ad4-machine">—</strong></div>
    <div class="ad4-stat"><span>Nozzle</span><strong id="ad4-nozzle">—</strong></div>
    <div class="ad4-stat"><span>Bed</span><strong id="ad4-bed">—</strong></div>
    <div class="ad4-stat"><span>Progress</span><strong id="ad4-progress">—</strong></div>
    <div class="ad4-stat"><span>Layer (if reported)</span><strong id="ad4-layer">—</strong></div>
    <div class="ad4-stat"><span>Current file</span><strong id="ad4-file">—</strong></div>
  </div>
  <section class="ad4-section">
    <h3>Print controls</h3>
    <div class="ad4-tools">
      <button id="ad4-refresh">Refresh</button><button id="ad4-discover">Discover</button>
      <button id="ad4-pause">Pause</button><button id="ad4-resume">Resume</button>
      <button id="ad4-cancel" class="ad4-destructive">Cancel print</button>
      <button id="ad4-fan_on">Fan on</button><button id="ad4-fan_off">Fan off</button>
    </div>
  </section>
  <section class="ad4-section">
    <div class="ad4-section-title"><h3>Printer files</h3><button id="ad4-refresh-files">Refresh files</button></div>
    <div class="ad4-file-filters">
      <label>Sort <select id="ad4-file-sort"><option value="name">Name</option><option value="duration">Duration</option><option value="date">Upload date</option></select></label>
      <label>Per page <select id="ad4-page-size"><option>5</option><option selected>10</option><option>20</option></select></label>
    </div>
    <div id="ad4-file-list" class="ad4-file-list" aria-label="Stored printer files"></div>
    <div class="ad4-pagination"><button type="button" id="ad4-files-prev" aria-label="Previous page">Previous</button><span id="ad4-files-page">0 / 0</span><button type="button" id="ad4-files-next" aria-label="Next page">Next</button></div>
    <div class="ad4-tools">
      <button id="ad4-upload">Upload sliced GX only</button>
      <button id="ad4-send-print" class="ad4-primary">Upload &amp; print</button>
    </div>
    <label class="ad4-option"><input id="ad4-auto-timelapse" type="checkbox">Record timelapse when printing</label>
    <label class="ad4-option">Capture mode <select id="ad4-capture-mode"><option value="interval">Every 10 seconds</option><option value="layer">Estimated layer (M114, experimental)</option></select></label>
  </section>
  <section class="ad4-section">
    <h3>Camera</h3>
    <div class="ad4-tools"><button id="ad4-snapshot">Take snapshot</button><button id="ad4-live-toggle" aria-pressed="false">Start live video</button></div>
    <img id="ad4-camera" alt="Adventurer 4 camera image" hidden>
    <p class="ad4-help">Video is fetched only when enabled and proxied through the authenticated bridge.</p>
  </section>
  <section class="ad4-section">
    <div class="ad4-section-title"><h3>Timelapses</h3><button id="ad4-gallery-refresh">Refresh gallery</button></div>
    <p id="ad4-timelapse-status">No recording</p>
    <div class="ad4-tools"><button id="ad4-timelapse-start">Start manual recording</button><button id="ad4-timelapse-stop">Stop &amp; encode MP4</button></div>
    <div id="ad4-gallery" class="ad4-file-list" aria-label="Saved timelapses"></div>
    <video id="ad4-timelapse-preview" controls playsinline preload="metadata" hidden></video>
  </section>
  <details class="ad4-section">
    <summary>Printer connections and diagnostics</summary>
    <p class="ad4-help">Connection profiles select a network address, not a different printer model.</p>
    <label class="ad4-option">Saved connection <select id="ad4-connection-profiles"></select></label>
    <div class="ad4-tools"><button id="ad4-profile-use">Use profile</button><button id="ad4-profile-delete" class="ad4-destructive">Delete profile</button></div>
    <div class="ad4-tools"><input id="ad4-profile-name" placeholder="Profile name" maxlength="64" aria-label="Connection profile name"><input id="ad4-profile-host" placeholder="192.168.x.x" aria-label="Printer LAN IPv4"><button id="ad4-profile-add">Save connection</button></div>
    <div class="ad4-tools"><button id="ad4-diagnostic-doctor">Doctor</button><button id="ad4-diagnostic-info">Printer info</button><button id="ad4-diagnostic-position">M114 position</button></div>
    <pre id="ad4-diagnostic-result"></pre>
  </details>
</dialog>
<script type="module" src="ad4-manager.js"></script>\n<script type="module" src="ad4-studio.js"></script>
"""
    html.write_text(source.replace("</body>",dialog+"</body>"))
    built=html.read_text()
    for required in ("ad4-settings.css", "ad4-studio.css", "ad4-studio.js", "ad4-manager.js"):
        if required not in built:
            raise RuntimeError("Required AD4 overlay missing: "+required)
    print("AD4 Studio generated with native preset controls; slicing remains server-only")
if __name__=="__main__":build()
