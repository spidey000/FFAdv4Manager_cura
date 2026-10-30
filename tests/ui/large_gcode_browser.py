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
      canvasWidth: document.getElementById('stl-viewer').getBoundingClientRect().width
    })""")
    assert stats["displayedSegments"] > 500, stats
    assert stats["canvasWidth"] > 0, stats
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
    print("Real third-party 3DBenchy browser preview:", result, stats)
    page.close()
    browser.close()
