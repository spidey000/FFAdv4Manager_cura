#!/usr/bin/env python3
"""Reproducibly replace legacy frontend with the pinned MosaicSlicer + overlays."""
from pathlib import Path
import json
import os
import re
import shutil
import subprocess

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
    # Keep performant viewer code as tracked overlays, never edit generated frontend.
    for name in ("ad4-plate-layout.mjs", "ad4-plate-operations.mjs", "renderer.mjs", "parser.mjs", "ad4-gcode-geometry.mjs", "ad4-toolpath-colors.mjs", "ad4-layer-stack.mjs", "ad4-bevel-profile.mjs", "ad4-gpu-seams.mjs", "ad4-stl-worker-client.mjs"):
        shutil.copy2(OV/"src/gui/viewer"/name, DEST/"src/gui/viewer"/name)
    # MIT-licensed ThreeSlicer viewer only, never its AGPL slicer kernel.
    shutil.copytree(OV/"src/gui/viewer/ad4-three-slicer",
                    DEST/"src/gui/viewer/ad4-three-slicer")
    shutil.copy2(OV/"src/gui/viewer/ad4-three-slicer/LICENSE",
                 DEST/"public/three-slicer-viewer-LICENSE.txt")
    shutil.copy2(OV/"public/ad4-manager.js",DEST/"public/ad4-manager.js")
    shutil.copy2(OV/"public/ad4-stl-worker.js", DEST/"public/ad4-stl-worker.js")
    for name in ("ad4-manager-tools.js", "ad4-manager-tools.css", "ad4-live-job.js", "ad4-live-job.css"):
        shutil.copy2(OV/"public"/name, DEST/"public"/name)
    shutil.copy2(OV/"public/ad4.css",DEST/"public/ad4.css")
    shutil.copy2(OV/"public/ad4-settings.css",DEST/"public/ad4-settings.css")
    shutil.copy2(OV/"public/ad4-studio.css",DEST/"public/ad4-studio.css")
    shutil.copy2(OV/"public/ad4-studio.js",DEST/"public/ad4-studio.js")
    shutil.copy2(OV/"public/ad4-v3.js",DEST/"public/ad4-v3.js")
    shutil.copy2(OV/"public/ad4-printer-dashboard.js",DEST/"public/ad4-printer-dashboard.js")
    shutil.copy2(OV/"public/ad4-v3.css",DEST/"public/ad4-v3.css")
    shutil.copy2(OV/"public/ad4-slide-ruler.js",DEST/"public/ad4-slide-ruler.js")
    # Download exact full-resolution Benchy from the original creators and the
    # pinned read-only G-code preview used for independent 3D viewer testing.
    from fetch_demo_benchy import download_demo
    download_demo(DEST/"public")
    shutil.copy2(OV/"src/gui/ad4-presets.mjs",DEST/"src/gui/ad4-presets.mjs")
    shutil.copy2(OV/"src/gui/ad4-settings.mjs",DEST/"src/gui/ad4-settings.mjs")
    shutil.copy2(OV/"src/gui/ad4-setting-help.mjs",DEST/"src/gui/ad4-setting-help.mjs")
    shutil.copy2(OV/"src/gui/ad4-live-renderer.mjs",DEST/"src/gui/ad4-live-renderer.mjs")
    # Offline SettingsGuide content, pinned as a git submodule for reproducible builds.
    guide=ROOT/"vendor/settings-guide"
    if not (guide/"resources/articles/resolution/layer_height.md").is_file():
        raise RuntimeError("Missing SettingsGuide submodule; run git submodule update --init vendor/settings-guide")
    guide_dest=DEST/"public/settings-guide"
    guide_dest.mkdir(parents=True,exist_ok=True)
    shutil.copytree(guide/"resources/articles",guide_dest/"articles")
    shutil.copy2(guide/"LICENSE.md",guide_dest/"LICENSE.md")
    guide_articles={}
    for article in sorted((guide_dest/"articles").glob("*/*.md")):
        key=article.stem
        if key in guide_articles:
            raise RuntimeError("Duplicate SettingsGuide article id: "+key)
        guide_articles[key]=article.relative_to(guide_dest/"articles").as_posix()
    if len(guide_articles)<600:
        raise RuntimeError("SettingsGuide content unexpectedly incomplete")
    (guide_dest/"index.json").write_text(json.dumps({
        "source":"Ghostkeeper/SettingsGuide",
        "revision":"d7d700427b45743845f0eac8dceec575bee19332",
        "license":"AGPL-3.0",
        "article_count":len(guide_articles),
        "articles":guide_articles
    },sort_keys=True,separators=(",",":"))+"\n",encoding="utf-8")
    shutil.copy2(OV/"src/gui/ad4-icon-pack.mjs",DEST/"src/gui/ad4-icon-pack.mjs")
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
    data["dependencies"]["lucide"]="1.61.0"
    data["dependencies"]["markdown-it"]="14.1.0"
    data["dependencies"]["lucide"]="1.62.0"
    pkg.write_text(json.dumps(data,indent=2)+"\n")
    with (DEST/"src/gui/index.mjs").open("a",encoding="utf-8") as stream:
        stream.write('\nexport * as slicer from "./slicer.mjs";\n')
        # Safe read-only model scene visibility for 3D and upload smoke tests.
        stream.write('\nexport * as model_viewer from "./viewer/model_viewer.mjs";\n')
        stream.write('\nexport * as renderer from "./viewer/renderer.mjs";\n')
    app_entry=DEST/"src/index.mjs"
    app_code=app_entry.read_text()
    app_code='import "./gui/ad4-live-renderer.mjs";\n'+app_code
    app_code=app_code.replace('import * as resources from "./resources.mjs";',
      'import * as resources from "./resources.mjs";\\nimport {install_ad4_features} from "./gui/ad4-settings.mjs";\\nimport {install_ad4_icon_pack} from "./gui/ad4-icon-pack.mjs";'.replace('\\n','\n'))
    app_code=app_code.replace('  console.log("Loaded GUI");',
      '  console.log("Loaded GUI");\\n  install_ad4_features();'.replace('\\n','\n'))
    app_code=app_code.replace('main();','install_ad4_icon_pack();\\nmain();'.replace('\\n','\n'))
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
    # Match the exact AD4 Studio UI accent for the unsliced STL model, while
    # keeping the G-code feature palette independent.
    model_file=DEST/"src/gui/viewer/model_viewer.mjs"
    model_code=model_file.read_text()
    model_code=model_code.replace(
      "  color: 0x1a5f5a,","  color: 0x20e37c,",1
    ).replace(
      "  emissive: 0x1a5f5a,","  emissive: 0x20e37c,"
    )
    model_file.write_text(model_code)

    # Adventurer 4 metadata omits exclude_materials. Upstream Mosaic assumes
    # it is always a list and crashes on undefined.includes().
    # Adventurer 4 has no upstream Cura build-plate mesh. A missing
    # metadata.platform previously caused a 404 and undefined.endsWith().
    # Render a geometrically correct 220 x 200 mm build plate instead.
    # Give the Studio two real G-code visibility bounds; no fake geometry.
    gcode_file=DEST/"src/gui/viewer/gcode_viewer.mjs"
    viewer_source=gcode_file.read_text()
    start=viewer_source.index("  for (let layer of parsed_data) {")
    stop=viewer_source.index("  let machine_settings =",start)
    viewer_source=viewer_source[:start]+"""
  // True MIT ThreeSlicer GPU renderer: 8-vertex mitered bead template,
  // Lambert face lighting, zero-cost layer range and 2/4 LOD.
  // G-code itself remains untouched and printable only through CuraEngine.
  const built = await buildGcodeLayers(parsed_data);
  mesh.add(built.mesh);
  mesh.userData.ad4Toolpath = built;
  layers = built.layers;
  globalThis.__AD4_GCODE_CATEGORIES__ = built.categories;
  globalThis.AD4GcodePreviewStats = {
    sourceSegments: built.segmentCount,
    displayedSegments: built.displayed,
    solidSegments: built.solidSegments,
    solidPreview: built.solidPreview,
    threeSlicerViewer: built.threeSlicerViewer,
    gpuInstanced: built.gpuInstanced,
    instanceBytes: built.instanceBytes,
    minLayerHeight: Math.min(...built.layerHeights),
    maxLayerHeight: Math.max(...built.layerHeights),
    simplified: false
  };
  renderer.invalidate();
""" + viewer_source[stop:]
    gcode_file.write_text(
        'import {buildGcodeLayers, disposeGcodeLayers} from "./ad4-gcode-geometry.mjs";\n'
        'import {colorForToolpathType} from "./ad4-toolpath-colors.mjs";\n'
        + viewer_source
    )
    patch("src/gui/viewer/gcode_viewer.mjs",
          "  scene.remove(gcode_mesh);\n  gcode_mesh = null;\n  layers = [];",
          "  scene.remove(gcode_mesh);\n  disposeGcodeLayers(gcode_mesh);\n"
          "  gcode_mesh = null;\n  layers = [];\n"
          "  globalThis.AD4GcodePreviewStats = null;\n  renderer.invalidate();")

    gcode_file.write_text(gcode_file.read_text()+"""
// Mirror the Mosaic and AD4 layer controls over the single ThreeSlicer
// instanced mesh. All cuts and filters are GPU uniforms/colors, not 853 draws.
globalThis.AD4GCodePreview = {
  get handle(){return gcode_mesh?.userData?.ad4Toolpath||null},
  get count(){return layers.length},
  get bounds(){
    if(!gcode_mesh)return null;
    const box=new THREE.Box3().setFromObject(gcode_mesh);
    return {min:box.min.toArray(),max:box.max.toArray()};
  },
  get types(){return globalThis.__AD4_GCODE_CATEGORIES__||[]},
  colorForType(type){return colorForToolpathType(type)},
  get renderedColors(){
    return Object.fromEntries(this.types.map(t=>[t,colorForToolpathType(t)]));
  },
  get hiddenTypes(){return this.handle?.hiddenTypes||new Set()},
  get viewMode(){return this.handle?.viewMode||"feature"},
  get moveCount(){
    const data=this.handle?.handle?.data;
    if(!data)return 0;
    const top=Math.min(data.layerCount-1,Math.max(0,Number(layer_slider.value)-1));
    return data.movePrefix[top+1]-data.movePrefix[top];
  },
  setMoveRange(at){
    const selected=Math.min(this.count-1,Math.max(0,Number(layer_slider.value)-1));
    const result=this.handle?.showMove(at,selected);
    renderer.invalidate();
    return result;
  },
  setViewMode(mode){this.handle?.setViewMode(mode);renderer.invalidate()},

  get threeSlicerStats(){
    const h=this.handle, data=h?.handle?.data;
    if(!data)return null;
    const mesh=h.handle.mesh;
    return {segments:data.nSeg,layers:data.layerCount,
      vertices:mesh.geometry.getAttribute("tpl").count,
      indices:mesh.geometry.index.count,
      instances:mesh.geometry.instanceCount,
      drawMeshes:1,lod:h.handle.lodLevel(),
      instanceBytes:h.instanceBytes,
      hasNaN:data.hasNaN,
      shader:mesh.material.isRawShaderMaterial};
  },
  get solidMeshStats(){
    const data=this.handle?.handle?.data;
    if(!data)return {indexed:0,solid:0,minThickness:0,maxThickness:0};
    const heights=data.meta.vHeight;
    let min=Infinity,max=0;
    for(let i=0;i<heights.length;i++){
      min=Math.min(min,heights[i]);max=Math.max(max,heights[i]);
    }
    return {indexed:1,solid:1,minThickness:min===Infinity?0:min,maxThickness:max};
  },
  setTypeVisible(type,visible){
    this.handle?.setTypeVisible(type,visible);
    renderer.invalidate();
  },
  refreshTypes(){renderer.invalidate()},
  setRange(from,to){
    const a=Math.max(1,Math.min(layers.length,Math.round(Number(from)||1)));
    const b=Math.max(a,Math.min(layers.length,Math.round(Number(to)||1)));
    this.handle?.setRange(a-1,b-1);
    layer_slider.value=String(b);
    renderer.invalidate();
    return {from:a,to:b,count:layers.length};
  },
  updateLod(camera,height){this.handle?.updateLod(camera,height)}
};
// Preserve Mosaic's own single-ended layer slider as a GPU uniform update.
layer_slider.addEventListener("input",()=>{
  const target=Math.max(1,Math.min(layers.length,Number(layer_slider.value)||1));
  gcode_mesh?.userData?.ad4Toolpath?.setRange(0,target-1);
  renderer.invalidate();
});
""")
    patch("src/gui/viewer/gcode_viewer.mjs", """  mesh.position.set(
    -machine_settings.machine_width.default_value / 2,
    0,
    machine_settings.machine_width.default_value / 2
  );""", """  // Native AD4 slices use a bed-centered origin. Apply an offset only for
  // machines whose G-code origin is at the corner, using resolved dimensions.
  const stack=active_containers.containers.global;
  const centered=stack.resolve_setting("machine_center_is_zero");
  mesh.position.set(
    centered ? 0 : -stack.resolve_setting("machine_width") / 2,
    0,
    centered ? 0 : stack.resolve_setting("machine_depth") / 2
  );""")

    # An external 3DBenchy toolpath was sliced for a different printer bed;
    # center ONLY its visualization in static Pages. Do not mutate G-code.
    patch("src/gui/viewer/gcode_viewer.mjs",
          "  mesh.rotation.set(-Math.PI / 2, 0, 0);",
          """  mesh.rotation.set(-Math.PI / 2, 0, 0);
  if (globalThis.__AD4_STATIC_PREVIEW__ && globalThis.AD4DemoBenchyLoaded) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const layer of parsed_data) for (const point of layer) {
      if (point.type !== "print") continue;
      const p=point.vector;
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
      minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
    }
    if (Number.isFinite(minX) && Number.isFinite(minY)) {
      mesh.position.x=-(minX+maxX)/2;
      mesh.position.z=(minY+maxY)/2;
    }
  }""")

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
    # Also fix Mosaic's square default build-volume outline: AD4 is 220x200.
    patch("src/gui/viewer/viewer.mjs",
          """    machine_settings.machine_width.default_value,
    machine_settings.machine_height.default_value,
    machine_settings.machine_width.default_value""",
          """    machine_settings.machine_width.default_value,
    machine_settings.machine_height.default_value,
    machine_settings.machine_depth.default_value""")
    patch("src/gui/viewer/viewer.mjs",
          "  gridHelperBig.position.y += 0.01;",
          """  gridHelperBig.position.y += 0.01;
  gridHelperSmall.scale.z = machine_settings.machine_depth.default_value / machine_settings.machine_width.default_value;
  gridHelperBig.scale.z = machine_settings.machine_depth.default_value / machine_settings.machine_width.default_value;""")
    patch("src/settings/containers.mjs",
          "let excluded_materials = this.parent_meta.exclude_materials;",
          "let excluded_materials = this.parent_meta.exclude_materials ?? [];")
    patch("src/gui/options.mjs","filament_name.innerText = material_name;",
          'filament_name.innerText = "Artillery PLA Basic";')
    # The GPU must repaint when drag transforms change a heavy mesh; do not
    # fall back to the old continuous 60 FPS render loop.
    patch("src/gui/viewer/model_viewer.mjs",
          "model_controls.enabled = false;",
          "model_controls.enabled = false;\nmodel_controls.addEventListener('change', renderer.invalidate);")
    # Upstream only removes the Three.js mesh but leaves it registered; fix
    # both the scene bookkeeping and stale imported filename at the source.
    patch("src/gui/viewer/model_viewer.mjs",
          "    scene.remove(models[focused].mesh);\n    delete interactions.scene_objects[focused];\n    focused = null;",
          "    scene.remove(models[focused].mesh);\n    delete interactions.scene_objects[focused];\n"
          "    delete models[focused];\n    focused = null;\n"
          "    document.dispatchEvent(new CustomEvent('ad4:models-changed', {detail:{count:Object.keys(models).length}}));")
    patch("src/gui/viewer/model_viewer.mjs",
          "    scene.remove(models[focused].mesh);\n    delete interactions.scene_objects[focused];",
          "    scene.remove(models[focused].mesh);\n"
          "    models[focused].mesh.geometry.dispose();\n"
          "    models[focused].mesh.material.dispose();\n"
          "    renderer.invalidate();\n"
          "    delete interactions.scene_objects[focused];")
    patch("src/gui/file.mjs",
          "export let stl_file_name = null;",
          "export let stl_file_name = null;\n"
          "document.addEventListener('ad4:models-changed', event => {\n"
          "  if (event.detail.count === 0) stl_file_name = null;\n"
          "});")
    # Expose stable named model operations to the mobile model-list UI.
    # They operate on Mosaic's authoritative registry and selection, not a
    # second, disconnected UI-side collection.
    patch("src/gui/file.mjs",
          "    stl_file_name = reader.file_name;\n",
          "")
    patch("src/gui/file.mjs",
          '    load_model(array_buffer, stl_file_name.endsWith(".stl") ? "stl" : "3mf");',
          '    Promise.resolve(load_model(array_buffer, reader.file_name.toLowerCase().endsWith(".stl") ? "stl" : "3mf", reader.file_name))\n'
          '      .then(mesh => { if (mesh) stl_file_name = reader.file_name; })\n'
          '      .catch(error => document.dispatchEvent(new CustomEvent("ad4:viewer-error",\n'
          '        {detail:{code:"MODEL_LOAD_FAILED",message:"Could not load “"+reader.file_name+"”: "+error.message}})));\n')
    patch("src/gui/viewer/model_viewer.mjs",
          'export function load_model(raw_data, model_type) {',
          'export async function load_model(raw_data, model_type, file_name = "") {')
    patch("src/gui/viewer/model_viewer.mjs",
          'import * as THREE from "three";',
          'import * as THREE from "three";\n'
          'import {parseStlGeometry} from "./ad4-stl-worker-client.mjs";')
    patch("src/gui/viewer/model_viewer.mjs",
          '      viewer.stl_loader.parse(raw_data),',
          '      await parseStlGeometry(raw_data, viewer.stl_loader),')
    patch("src/gui/viewer/model_viewer.mjs",
          '  models[mesh.uuid] = {\n    mesh: mesh,\n    data: raw_data\n  };',
          '  mesh.name = file_name || ("Model " + (Object.keys(models).length + 1));\n'
          '  models[mesh.uuid] = {\n    mesh: mesh,\n    data: raw_data,\n'
          '    name: mesh.name\n  };')
    patch("src/gui/viewer/model_viewer.mjs",
          '  focus_stl(mesh.uuid);\n\n  let sceneobj',
          "  focus_stl(mesh.uuid);\n"
          "  document.dispatchEvent(new CustomEvent('ad4:models-changed', {detail:{count:Object.keys(models).length}}));\n\n"
          "  let sceneobj")
    # Hidden models remain part of the exported slicing geometry even if
    # a future STLExporter starts honoring the source mesh's visible flag.
    patch("src/gui/viewer/model_viewer.mjs",
          "    let mesh = models[model].mesh.clone();",
          "    let mesh = models[model].mesh.clone();\n    mesh.visible = true;")
    # Always register a loaded STL/3MF, even outside the bed or overlapping.
    # Validation only prevents Slice and STL export, never further editing.
    patch("src/gui/viewer/model_viewer.mjs",
          "  scene.add(mesh);\n\n  mesh.name =",
          "  ad4Plate.acceptNewModel(mesh, file_name);\n"
          "  scene.add(mesh);\n\n  mesh.name =")
    patch("src/gui/viewer/model_viewer.mjs",
          "export function export_stl() {\n",
          "export function export_stl() {\n"
          "  if (!ad4Plate.isValid()) throw new Error('Cannot slice overlapping or out-of-bounds models');\n")
    # Clones share large STL buffer geometry; deleting one must not dispose
    # geometry still referenced by the others.
    patch("src/gui/viewer/model_viewer.mjs",
          "    models[focused].mesh.geometry.dispose();",
          "    if (!Object.values(models).some(m => m.mesh !== models[focused].mesh &&\n"
          "        m.mesh.geometry === models[focused].mesh.geometry))\n"
          "      models[focused].mesh.geometry.dispose();")
    # Validate import parameters before creating expensive geometry. FileReader
    # and worker exceptions are announced to the same viewport error surface.
    patch("src/gui/file.mjs",
          "export function load_file(file) {\n",
          '''export function load_file(file) {
  if (!file || !/\\.(stl|3mf)$/i.test(file.name || "")) {
    document.dispatchEvent(new CustomEvent("ad4:viewer-error",{
      detail:{code:"FILE_UNSUPPORTED",message:"Select an STL or 3MF file."}
    }));
    return;
  }
  if (file.size > 250 * 1024 * 1024) {
    document.dispatchEvent(new CustomEvent("ad4:viewer-error",{
      detail:{code:"FILE_TOO_LARGE",message:"Model exceeds the 250 MB import limit."}
    }));
    return;
  }
''')
    patch("src/gui/file.mjs",
          "  reader.readAsArrayBuffer(file);",
          '''  reader.onerror = () => document.dispatchEvent(new CustomEvent("ad4:viewer-error",{
    detail:{code:"FILE_READ_FAILED",message:"Cannot read “"+file.name+"” from device storage."}
  }));
  reader.readAsArrayBuffer(file);''')
    # Report toolpath failures in the SAME warning spot as model errors; never
    # silently leave an empty layer scene following a failed parser promise.
    patch("src/gui/viewer/gcode_viewer.mjs",
          "  let parsed_data = await gcode.parse(exported_gcode);",
          '''  let parsed_data;
  try {
    parsed_data = await gcode.parse(exported_gcode);
    if (!Array.isArray(parsed_data) || !parsed_data.length)
      throw Error("The toolpath contains no printable layers");
    document.dispatchEvent(new CustomEvent("ad4:viewer-recovered",{
      detail:{code:"GCODE_PARSE_FAILED"}
    }));
  } catch (error) {
    document.dispatchEvent(new CustomEvent("ad4:viewer-error",{
      detail:{code:"GCODE_PARSE_FAILED",
        message:"Cannot display G-code layers: "+(error?.message || String(error))}
    }));
    return;
  }''')
    patch("src/gui/viewer/gcode_viewer.mjs",
          '    notify("No G-Code to show", "Slice a model to generate G-Code");',
          '''    notify("No G-Code to show", "Slice a model to generate G-Code");
    document.dispatchEvent(new CustomEvent("ad4:viewer-error",{
      detail:{code:"GCODE_MISSING",message:"There is no G-code yet. Slice a model first."}
    }));''')
    patch("src/gui/viewer/gcode_viewer.mjs",
          "    show_gcode_viewer();",
          '''    show_gcode_viewer().catch(error => {
      document.dispatchEvent(new CustomEvent("ad4:viewer-error",{
        detail:{code:"LAYER_RENDER_FAILED",
          message:"Unable to build layer preview: "+(error?.message || String(error))}
      }));
    });''')
    model_source = DEST / "src/gui/viewer/model_viewer.mjs"
    model_source.write_text(model_source.read_text() + """
// Install plate rules in Mosaic's real model registry, not in the visual shell.
import {installPlateOperations} from "./ad4-plate-operations.mjs";
const ad4Plate = installPlateOperations({
  models, scene, interactions, controls:model_controls, renderer,
  focusModel:focus_stl, updateOverlays:update_overlays,
  clearSliceState:clear_slice_state
});
ad4Plate.setFocusedGetter(()=>focused);
export const ad4_auto_arrange = () => ad4Plate.arrange();
export const ad4_clone_selected = () => ad4Plate.cloneSelected();
export const ad4_plate_valid = () => ad4Plate.isValid();
export const ad4_plate_status = () => ad4Plate.status();
export const ad4_begin_transform = () => ad4Plate.beginTransform();
export const ad4_commit_transform = () => ad4Plate.commitTransform();

// Public model-list operations, bound to Mosaic's own selected mesh.
export function ad4_select_model(uuid) {
  if (!Object.prototype.hasOwnProperty.call(models, uuid)) return false;
  if (focused !== uuid) focus_stl(uuid);
  return true;
}
export function ad4_set_model_visible(uuid, visible) {
  const model = models[uuid];
  if (!model) return false;
  model.mesh.visible = Boolean(visible); // export_stl() still includes all models.\n  renderer.invalidate();
  if (!visible && focused === uuid && model_controls.enabled) {
    model_controls.detach();
    scene.remove(model_controls.getHelper());
    model_controls.enabled = false;
  }
  return true;
}
export function ad4_delete_model(uuid) {
  if (!Object.prototype.hasOwnProperty.call(models, uuid)) return false;
  if (focused !== uuid) focus_stl(uuid);
  if (model_controls.enabled) {
    model_controls.detach();
    scene.remove(model_controls.getHelper());
    model_controls.enabled = false;
  }
  delete_model(); // existing source-patched deletion also prunes the registry.
  clear_slice_state();
  return true;
}
""")
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
        '    document.dispatchEvent(new CustomEvent("ad4:viewer-error",{\n'
        '      detail:{code:"SLICE_FAILED",message:error?.message || String(error)}\n'
        '    }));\n'
        '  }\n'
        '});', 1)
    # The percentage must come from CuraEngine, not a simulated timer.
    action_code=action_code.replace(
        '  slice_progress_bar.style.width = "0%";',
        '''  slice_progress_bar.style.width = "0%";
  slice_progress_bar.setAttribute("role", "progressbar");
  slice_progress_bar.setAttribute("aria-label", "CuraEngine slicing progress");
  slice_progress_bar.setAttribute("aria-valuemin", "0");
  slice_progress_bar.setAttribute("aria-valuemax", "100");''', 1)
    action_code=action_code.replace(
        '    slice_progress_bar.style.width = `${progress * 100}%`;',
        '''    if (Number.isFinite(progress)) {
      const value = Math.round(progress * 100);
      slice_progress_bar.style.width = value + "%";
      slice_progress_bar.setAttribute("aria-valuenow", String(value));
      slice_progress_bar.classList.remove("ad4-indeterminate");
    } else {
      slice_progress_bar.removeAttribute("aria-valuenow");
      slice_progress_bar.classList.add("ad4-indeterminate");
    }''', 1)
    if 'classList.add("ad4-indeterminate")' not in action_code:
        raise RuntimeError("Mosaic progress bar callback changed")
    actions.write_text(action_code)
    # Stamp the UI with the source revision actually being compiled, not the
    # running Python backend's version. Source installations without git still
    # show the independently maintained UI semantic version.
    frontend_js = DEST / "public/ad4-v3.js"
    revision = os.environ.get("GITHUB_SHA", "")
    if not re.fullmatch(r"[0-9a-fA-F]{7,40}", revision):
        try:
            result = subprocess.run(["git", "rev-parse", "--verify", "HEAD"],
                                    cwd=ROOT, capture_output=True, text=True,
                                    timeout=3, check=False)
            revision = result.stdout.strip() if result.returncode == 0 else ""
        except (OSError, subprocess.TimeoutExpired):
            revision = ""
    revision = revision[:8] if re.fullmatch(r"[0-9a-fA-F]{7,40}", revision) else "unavailable"
    frontend_source = frontend_js.read_text(encoding="utf-8")
    if frontend_source.count("__AD4_FRONTEND_REV__") != 1:
        raise RuntimeError("Missing unique frontend revision placeholder")
    frontend_js.write_text(frontend_source.replace("__AD4_FRONTEND_REV__", revision),
                           encoding="utf-8")
    html=DEST/"public/index.html"
    source=html.read_text()
    if "</body>" not in source or "<h1>MosaicSlicer</h1>" not in source:
        raise RuntimeError("Unexpected Mosaic HTML")
    source=source.replace("<h1>MosaicSlicer</h1>","<h1>AD4 Studio</h1>")
    source=source.replace('id="stl-file" accept=".stl"', 'id="stl-file" accept=".stl,.3mf"')
    source=source.replace('<link rel="stylesheet" href="main.css">',
          '<link rel="stylesheet" href="main.css"><link rel="stylesheet" href="ad4.css"><link rel="stylesheet" href="ad4-settings.css"><link rel="stylesheet" href="ad4-studio.css"><link rel="stylesheet" href="ad4-v3.css">')
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
<link rel="stylesheet" href="ad4-manager-tools.css"><link rel="stylesheet" href="ad4-live-job.css">
<script type="module" src="ad4-manager.js"></script><script type="module" src="ad4-manager-tools.js"></script><script type="module" src="ad4-live-job.js"></script>\n<script type="module" src="ad4-studio.js"></script>\n<script src="ad4-slide-ruler.js"></script><script type="module" src="ad4-v3.js"></script>\n<script type="module" src="ad4-printer-dashboard.js"></script>
"""
    html.write_text(source.replace("</body>",dialog+"</body>"))
    built=html.read_text()
    for required in ("ad4-settings.css", "ad4-studio.css", "ad4-studio.js", "ad4-v3.js", "ad4-v3.css", "ad4-slide-ruler.js", "ad4-manager.js", "ad4-printer-dashboard.js"):
        if required not in built:
            raise RuntimeError("Required AD4 overlay missing: "+required)
    print("AD4 Studio generated with native preset controls; slicing remains server-only")
if __name__=="__main__":build()

