"""Validate the real Mosaic frontend can import >1 MiB binary STL without
blocking the mobile viewport, and that GPU render-on-demand is installed.
Runs against the same built GitHub Pages preview as pages_browser_smoke.py.
"""
import os
import struct
from playwright.sync_api import sync_playwright

URL = os.getenv("AD4_TEST_URL", "http://127.0.0.1:8123/FFAdv4Manager_cura/")

def large_stl(triangles=45000):
    header = bytearray(b"Large STL viewer performance fixture".ljust(80, b" "))
    header += struct.pack("<I", triangles)
    face = struct.pack("<12fH", 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0)
    assert len(face) == 50
    return bytes(header) + face * triangles

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=os.getenv("CHROME_BIN") or None,
        args=["--no-sandbox", "--disable-dev-shm-usage",
              "--use-gl=angle", "--use-angle=swiftshader"],
    )
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_function(
        "() => globalThis.app?.gui?.model_viewer && "
        "document.getElementById('loading')?.style.display==='none'",
        timeout=45000,
    )
    assert page.evaluate("typeof app.gui.renderer.invalidate") == "function"
    source = large_stl()
    before = page.evaluate("Object.keys(app.gui.model_viewer.models).length")
    page.locator("#stl-file").set_input_files({
        "name": "stress_45000_triangles.stl",
        "mimeType": "model/stl", "buffer": source
    })
    page.wait_for_function(
        """() => Object.values(app.gui.model_viewer.models)
        .some(model => model.name === "stress_45000_triangles.stl" &&
         model.mesh.geometry.getAttribute("position").count === 135000)""",
        timeout=45000,
    )
    after = page.evaluate("Object.keys(app.gui.model_viewer.models).length")
    assert after == before + 1
    assert not errors, errors
    # The UI still has its own responsive canvas after a large import.
    assert page.evaluate("""() => {
      const canvas=document.getElementById('stl-viewer');
      const r=canvas.getBoundingClientRect();
      return r.width>0 && r.height>0 && r.right<=innerWidth+2;
    }""")
    print(f"45,000 triangles loaded from {len(source):,} bytes; "
          "render-on-demand active and mobile canvas not clipped")
    page.close()
    browser.close()
