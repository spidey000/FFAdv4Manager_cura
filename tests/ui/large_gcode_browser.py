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
      bevelMesh: AD4GCodePreview.bevelMeshStats,
      canvasWidth: document.getElementById('stl-viewer').getBoundingClientRect().width
    })""")
    assert stats["displayedSegments"] > 500, stats
    # The screenshot bug was zero-thickness, two-triangle ribbons: assert
    # that actual rendered meshes are closed indexed 3D solids, not lines.
    assert stats["solidPreview"] is True, stats
    assert stats["solidSegments"] > 500, stats
    assert stats["solidMesh"]["solid"] > 100, stats
    assert stats["solidMesh"]["indexed"] == stats["solidMesh"]["solid"], stats
    # Chamfered cross sections have a BYTE attribute for brightness: one
    # mesh/draw call per feature/layer, no extra light or shadow pass.
    assert stats["bevelPreview"] is True, stats
    assert 0.895 < stats["bevelShade"] < 0.905, stats
    assert stats["bevelMesh"]["broken"] == 0, stats
    assert stats["bevelMesh"]["bevelMeshes"] == stats["solidMesh"]["solid"], stats
    assert stats["gpuInstanced"] is True, stats
    assert stats["bevelMesh"]["instances"] == stats["solidSegments"], stats
    assert stats["bevelMesh"]["instanceBytes"] == stats["instanceBytes"], stats
    assert stats["bevelMesh"]["vertices"] <= 32 * stats["bevelMesh"]["bevelMeshes"], stats
    assert stats["instanceBytes"] <= stats["solidSegments"] * 32, stats
    assert stats["instanceBytes"] < 4_500_000, (
        "3DBenchy should fit in compact per-segment GPU attributes: " + str(stats)
    )
    assert stats["bevelMesh"]["shadeBytes"] == stats["bevelMesh"]["vertices"], stats
    assert stats["bevelMesh"]["shadeBytes"] < 8000000, (
        "Excessive vertex-shading GPU memory consumption: " + str(stats)
    )
    bead = page.evaluate("""() => {
      const meshes=AD4GCodePreview.count && AD4GCodePreview;
      // Inspect the actual GPU-ready geometry, not a detached test mock.
      const rendered=Object.values(globalThis.app.gui || {});
      const api=globalThis.AD4GCodePreview;
      const geometry=api.bevelMeshStats;
      const colors=api.renderedColors;
      return {bevelMeshes:geometry.bevelMeshes,colors:Object.keys(colors).length};
    }""")
    assert bead["bevelMeshes"] > 100, bead
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
    page.locator("#ad4-v3-show-layers").click()
    page.wait_for_function(
        "() => document.querySelectorAll('#ad4-v3-type-list .ad4-v3-type-row').length >= 4",
        timeout=10000
    )
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
