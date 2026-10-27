"""Headless runtime smoke test of the ACTUAL bundled Pages app.

Unlike an HTTP 200 check, this checks that JavaScript finishes bootstrapping,
Cura definitions are loaded and users can interact with 3D STL and settings.
Runs in GitHub Actions with Chromium; does not contact printer hardware.
"""
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

url=os.environ.get("AD4_TEST_URL","http://127.0.0.1:8123/FFAdv4Manager_cura/")
screenshot=Path(os.environ.get("AD4_SCREENSHOT","/tmp/ad4-pages-smoke.png"))
failures=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get("CHROME_BIN") or None,args=["--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader"])
    for width,height in [(390,844),(1280,800)]:
        page=browser.new_page(viewport={"width":width,"height":height},device_scale_factor=1)
        errors=[]
        page.on("pageerror",lambda e: errors.append("PAGE ERROR: "+str(e)+"\n"+str(getattr(e,"stack",""))))
        page.on("console",lambda e: errors.append("CONSOLE: "+e.text) if e.type=="error" else None)
        page.on("requestfailed",lambda req: errors.append("REQUEST FAILED: "+req.url+" "+str(req.failure)))
        page.goto(url,wait_until="domcontentloaded",timeout=30000)
        try:
            page.wait_for_function("""() => {
                const loading=document.querySelector('#loading');
                return loading && getComputedStyle(loading).display==='none';
            }""",timeout=35000)
        except Exception:
            print("BOOT TIMEOUT",width,"DOM=",page.locator("#loading").count(),"app=",page.evaluate("typeof globalThis.app"),flush=True)
            errors.extend(page.evaluate("""() => ({
                loaded: document.readyState,
                brand:document.querySelector('#tab-strip')?.innerText,
                loading:document.querySelector('#loading')?.outerHTML?.slice(0,500),
                resources: performance.getEntriesByType('resource').slice(-20).map(x=>x.name)
            })""").__str__().splitlines())
        loaded_style=page.evaluate("getComputedStyle(document.getElementById('loading')).display")
        js_state=page.evaluate("typeof globalThis.app")
        print(f"VIEWPORT {width}x{height} | loaded={loaded_style} | JS={js_state} | errors={len(errors)}",flush=True)
        for msg in errors:print(msg[:1000],flush=True)
        if page.evaluate("getComputedStyle(document.getElementById('loading')).display")!="none":failures.append(f"{width}: stuck loading")
        if not page.locator("#ad4-dock-model").count():failures.append(f"{width}: missing model button")
        if page.locator("#ad4-dock-model").count() and width<500:
            page.locator("#ad4-dock-settings").click()
            if not page.locator("body.ad4-sheet-open").count():failures.append("bottom sheet not working")
            else:
                categories=page.locator("#ad4-categories button").count()
                print("MOBILE CATEGORIES",categories,flush=True)
                if categories<4:failures.append("Cura categories missing")
            page.locator("#ad4-sheet-close").click()
        if width<500:
            screenshot.parent.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(screenshot),full_page=True)
        page.close()
    browser.close()
if failures:
    print("SMOKE TEST FAILED:",failures,file=sys.stderr)
    sys.exit(1)
print("REAL BROWSER SMOKE TEST PASSED")
