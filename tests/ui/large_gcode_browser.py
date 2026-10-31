"""Load real third-party 3DBenchy G-code through the same Three.js preview
as the mobile Slice tab. This never sends G-code to a physical printer.
"""
import os
from playwright.sync_api import sync_playwright

URL = os.getenv("AD4_TEST_URL", "http://127.0.0.1:8123/FFAdv4Manager_cura/")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True,
        executable_path=os.getenv("CHROME_BIN") or None,
        args=["--no-sandbox","--disable-dev-shm-usage",
              "--use-gl=angle","--use-angle=swiftshader"])
    page = browser.new_page(viewport={"width":390,"height":844})
    failures = []
    page.on("pageerror", lambda error: failures.append(str(error)))
    page.on("console", lambda msg: failures.append("GPU shader: "+msg.text)
            if msg.type == "error" and (
                "WebGLProgram" in msg.text or "Shader Error" in msg.text or
                "INVALID_OPERATION" in msg.text) else None)
    page.goto(URL, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_function(
        "() => globalThis.app?.gui?.slicer?.load_demo_gcode && "
        "Object.keys(app.gui.model_viewer.models).length > 0",
        timeout=45000
    )
    result = page.evaluate("""async () => {
      const response = await fetch("./stress-3dbenchy.gcode");
      if (!response.ok) throw Error("External G-code unavailable: " + response.status);
      const text = await response.text();
      app.gui.slicer.load_demo_gcode(text);
      document.querySelector("#slice-export-container").dataset.active="true";
      return {bytes: text.length};
    }""")
    assert result["bytes"] > 100000, "Third-party G-code unexpectedly small"
    page.locator("#ad4-v3-nav-slice").click()
    page.wait_for_function(
        "() => globalThis.AD4GCodePreview?.count > 50 && "
        "globalThis.AD4GcodePreviewStats?.sourceSegments > 500",
        timeout=100000,
    )
    stats = page.evaluate("""() => ({
      layers: AD4GCodePreview.count,
      ...AD4GcodePreviewStats,
      solidMesh: AD4GCodePreview.solidMeshStats,
      threeSlicer: AD4GCodePreview.threeSlicerStats,
      canvasWidth: document.getElementById('stl-viewer').getBoundingClientRect().width
    })""")
    assert stats["displayedSegments"] > 500, stats
    # The screenshot bug was zero-thickness, two-triangle ribbons: assert
    # that actual rendered meshes are closed indexed 3D solids, not lines.
    assert stats["solidPreview"] is True, stats
    assert stats["solidSegments"] > 500, stats
    assert stats["solidMesh"]["solid"] == 1, stats
    assert stats["solidMesh"]["indexed"] == stats["solidMesh"]["solid"], stats
    # Faithful ThreeSlicer viewer: ONE GPU mesh, 8 vertices and 24 indices
    # in the original template, all print segments instanced.
    ts = stats["threeSlicer"]
    assert stats["threeSlicerViewer"] is True, stats
    assert stats["gpuInstanced"] is True, stats
    assert ts["shader"] is True, ts
    assert ts["segments"] == stats["solidSegments"], ts
    assert ts["vertices"] == 8, ts
    assert ts["indices"] == 24, ts
    assert ts["drawMeshes"] == 1, ts
    assert ts["lod"] in (1, 2, 4), ts
    assert ts["hasNaN"] is False, ts
    assert 0 < stats["instanceBytes"] < 6_000_000, stats
    assert ts["instanceBytes"] == stats["instanceBytes"], stats
    assert 0.04 < stats["solidMesh"]["minThickness"] < 0.81, stats
    assert 0.04 < stats["solidMesh"]["maxThickness"] < 0.81, stats
    page.screenshot(path="/tmp/ad4-solid-3dbenchy-mobile.png", full_page=False)
    assert stats["canvasWidth"] > 0, stats
    # Ensure the browser actually rendered instanced vertices, not only
    # created geometry objects that fail shader compilation at first draw.
    page.wait_for_timeout(120)
    gpu_draw = page.evaluate("""() => {
      const renderer=app.gui.renderer?.renderer;
      return {calls:renderer?.info.render.calls || 0,
              triangles:renderer?.info.render.triangles || 0};
    }""")
    assert gpu_draw["triangles"] > 1000, gpu_draw
    assert not failures, failures
    # Layer scrubbing and Cura feature visibility still operate on the
    # actual parsed scene after a heavy source file.
    assert page.evaluate("""() => {
      const h=AD4GCodePreview.handle.handle;
      const color=h.mesh.geometry.getAttribute('iColor');
      const before=color.array.slice();
      AD4GCodePreview.setTypeVisible('PERIMETER',false);
      let hidden=0;
      for(let i=0;i<before.length;i++)if(before[i]>=0&&color.array[i]===-1)hidden++;
      AD4GCodePreview.setTypeVisible('PERIMETER',true);
      return hidden>10&&color.array.every((x,i)=>x===before[i]);
    }"""), "GPU per-feature visibility must update the actual color attribute"
    assert page.evaluate("""() => {
      const count=AD4GCodePreview.count;
      const range=AD4GCodePreview.setRange(Math.max(1,count-20),count);
      const types=AD4GCodePreview.types;
      if (types.length) AD4GCodePreview.setTypeVisible(types[0],false);
      if (types.length) AD4GCodePreview.setTypeVisible(types[0],true);
      return range.count===count && range.to===count;
    }"""), "Layer and Cura feature controls stopped working"
    # Regression: the external Benchy uses Prusa-style ;TYPE: names, not
    # Cura's WALL-OUTER/FILL names. The GPU mesh and the mobile legend must
    # use the SAME colors rather than a monochrome OTHER fallback.
    # The two panels must not change geometry or overflow the screen.
    mobile_layout=page.evaluate("""() => {
      const card=document.getElementById('ad4-v3-layer-card');
      const range=card.getBoundingClientRect();
      const stats=card.querySelector('.ad4-v3-estimates').getBoundingClientRect();
      const move=card.querySelector('.ad4-v3-move-scrub').getBoundingClientRect();
      const style=getComputedStyle(card);
      return {height:range.height,scroll:card.scrollHeight,client:card.clientHeight,
              overflow:style.overflowY,statsBottom:stats.bottom,moveBottom:move.bottom,
              cardBottom:range.bottom};
    }""")
    assert mobile_layout["height"] <= 180, mobile_layout
    assert mobile_layout["scroll"] <= mobile_layout["client"] + 2, mobile_layout
    assert mobile_layout["statsBottom"] <= mobile_layout["cardBottom"], mobile_layout
    assert mobile_layout["moveBottom"] <= mobile_layout["cardBottom"], mobile_layout
    page.screenshot(path="/tmp/ad4-mobile-layer-range.png")
    page.locator("#ad4-v3-show-layers").click()
    page.wait_for_function(
        "() => document.querySelectorAll('#ad4-v3-type-list .ad4-v3-type-row').length >= 4",
        timeout=10000
    )
    types_layout=page.evaluate("""() => {
      const card=document.getElementById('ad4-v3-layer-card');
      return {height:card.getBoundingClientRect().height,scroll:card.scrollHeight,
        client:card.clientHeight,heading:!!card.querySelector('.ad4-v3-card-title'),
        pages:!!document.getElementById('ad4-v3-types-next'),
        visibleRows:card.querySelectorAll('.ad4-v3-type-row').length};
    }""")
    assert abs(types_layout["height"]-mobile_layout["height"])<1, types_layout
    assert types_layout["scroll"]<=types_layout["client"]+2, types_layout
    assert types_layout["visibleRows"]<=3, types_layout
    assert not types_layout["heading"], types_layout
    page.screenshot(path="/tmp/ad4-mobile-layer-types.png")
    palette = page.evaluate("""() => {
      const wanted=["PERIMETER","OVERHANG PERIMETER","INTERNAL INFILL","SOLID INFILL"];
      const rows=[...document.querySelectorAll("#ad4-v3-type-list .ad4-v3-type-row")];
      const api=globalThis.AD4GCodePreview;
      const rendered=api.renderedColors;
      const swatches={};
      for(const type of wanted){
        const row=rows.find(row => row.dataset.toolpathType===type);
        if(!row) continue;
        const color=getComputedStyle(row.querySelector(".ad4-v3-type-swatch")).backgroundColor;
        const rgb=(color.match(/\\d+/g)||[]).slice(0,3);
        swatches[type]="#" + rgb.map(x=>Number(x).toString(16).padStart(2,"0")).join("");
      }
      return {types:api.types,swatches,rendered,
        expected:Object.fromEntries(wanted.map(type=>[type,api.colorForType(type)]))};
    }""")
    assert len(palette["swatches"]) == 4, "Missing Benchy categories from mobile legend: " + str(palette)
    assert len(set(palette["expected"].values())) == 4, "The Benchy palette is monochromatic"
    for category,color in palette["expected"].items():
        assert palette["swatches"].get(category) == color, (
            f"Legend and palette differ: {category} {palette}"
        )
        assert palette["rendered"].get(category) == color, (
            f"Actual Three.js material and swatch differ: {category} {palette}"
        )
    print("Verified actual Benchy GPU material and mobile legend colors:", palette["expected"],flush=True)
    print("Real third-party 3DBenchy browser preview:", result, stats)
    page.close()
    browser.close()
