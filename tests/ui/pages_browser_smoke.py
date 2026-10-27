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
    for width,height in [(320,568),(390,844),(1280,800)]:
        page=browser.new_page(viewport={"width":width,"height":height},device_scale_factor=1)
        errors=[]
        page.on("pageerror",lambda e: errors.append("PAGE ERROR: "+str(e)+"\n"+str(getattr(e,"stack",""))))
        page.on("console",lambda e: errors.append("CONSOLE: "+e.text) if e.type=="error" else None)
        page.on("requestfailed",lambda req: errors.append("REQUEST FAILED: "+req.url+" "+str(req.failure)))
        page.on("response",lambda r: errors.append(f"HTTP {r.status}: {r.url}") if r.status>=400 and "/api/" not in r.url else None)
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
        startup_error=page.locator("#ad4-startup-error").count()>0
        if startup_error:
            failures.append(f"{width}: startup error: "+page.locator("#ad4-startup-error").inner_text()[:500])
        if not page.locator("#ad4-dock-model").count():failures.append(f"{width}: missing model button")
        if not startup_error and loaded_style=="none":
            try:
                page.wait_for_function("""() => {
                  const gui=globalThis.app?.gui;
                  return gui?.file?.stl_file_name==="AD4_demo_cube_20mm.stl"
                    && Object.keys(gui.model_viewer?.models||{}).length>0;
                }""",timeout=18000)
                count=page.evaluate("Object.keys(app.gui.model_viewer.models).length")
                print("DEMO STL GEOMETRY LOADED",count,flush=True)
                assert count>=1
                assert page.locator("#ad4-dock-demo").count()==1
                assert page.locator("#slice-button").is_disabled()
                assert page.locator("#ad4-dock-slice").is_disabled()
                if width<500:
                    sample=page.request.get(url.rstrip("/")+"/demo-cube-20mm.stl")
                    assert sample.ok, "Demo STL was not served"
                    page.locator("#stl-file").set_input_files({
                        "name":"user_imported_cube.stl",
                        "mimeType":"model/stl",
                        "buffer":sample.body()
                    })
                    page.wait_for_function("() => Object.keys(app.gui.model_viewer.models).length>=2",timeout=8000)
                    print("USER FILE UPLOAD LOADED AS 3D MODEL",flush=True)
            except Exception as error:
                failures.append(f"{width}: STL preview/upload: {error}")
        if page.locator("#ad4-v3-top").count()==0:
            failures.append(f"{width}: new five-tab navigation missing")
        else:
            top_buttons=page.locator("#ad4-v3-top button")
            if top_buttons.count()!=5:
                failures.append(f"{width}: expected five sections, got {top_buttons.count()}")
            if page.evaluate("document.body.dataset.ad4Screen")!="preview":
                failures.append(f"{width}: workspace did not start in Preview")
        if not startup_error and width<500:
            try:
                # Navigate using the V3 visible controls, not legacy hidden buttons.
                page.locator('#ad4-v3-top [data-route="print"]').click(timeout=4000)
                page.wait_for_function("document.body.dataset.ad4Screen==='print'",timeout=4000)
                page.wait_for_timeout(250)
                categories=page.locator("#ad4-categories button").count()
                print("V3 PRINT / CURA CATEGORIES",categories,flush=True)
                if categories<5:failures.append("Print settings categories missing")
                visible=page.locator("#sidebar .setting[data-setting_id]:visible").count()
                print("PRINT QUALITY SETTINGS VISIBLE",visible,flush=True)
                print("CURA DOM CATEGORIES",page.evaluate("""() => Array.from(document.querySelectorAll("#sections .section")).slice(0,16).map(el=>({category:el.dataset.category_id,title:el.querySelector(".section-title-container")?.textContent?.trim(),count:el.querySelectorAll(".setting[data-setting_id]").length,visible:Array.from(el.querySelectorAll(".setting[data-setting_id]")).filter(n=>!n.hidden).slice(0,8).map(n=>n.dataset.setting_id)}))"""),flush=True)
                if visible<1:failures.append("Print settings not visible")
                # Capture the real Print screen from the deployed bundle before scrolling.
                print_shot=Path(f"/tmp/ad4-pages-print-{width}.png")
                page.screenshot(path=str(print_shot),full_page=False)
                layout=page.evaluate("""() => {
                    const frame=document.querySelector("#sidebar-container");
                    const body=document.querySelector("#sidebar");
                    const sections=document.querySelector("#sections");
                    const r=frame.getBoundingClientRect();
                    return {top:r.top,bottom:r.bottom,viewport:innerHeight,
                      height:r.height,sidebarHeight:body.clientHeight,
                      scrollClient:body.clientHeight,scrollFull:body.scrollHeight,
                      actionHidden:getComputedStyle(document.querySelector("#ad4-v3-action-row")).display==='none',
                      sheetOverflow:getComputedStyle(body).overflowY};
                }""")
                print("PRINT SCROLL LAYOUT",layout,flush=True)
                if layout["top"] < 0 or layout["bottom"] > height + 2:
                    failures.append(f"{width}: Print panel clipped outside viewport: {layout}")
                if not layout["actionHidden"]:
                    failures.append(f"{width}: oversized Save Profile action bar still visible")
                if layout["scrollClient"] <= 0 or layout["sheetOverflow"] != "auto":
                    failures.append(f"{width}: Print settings panel is not an independently scrolling region: {layout}")
                # Ensure enough Cura settings exist for actual scrolling, then use a
                # physical wheel gesture instead of assigning scrollTop directly.
                page.locator("#ad4-presets-toggle").click()
                page.locator("#ad4-native-toggle").check()
                page.wait_for_timeout(250)
                scroller=page.locator("#sidebar")
                dims=page.evaluate("""() => {
                    const el=document.querySelector("#sidebar");
                    return {client:el.clientHeight,total:el.scrollHeight};
                }""")
                if dims["total"] <= dims["client"] + 30:
                    failures.append(f"{width}: Expanded profiles and Cura settings are not scrollable together: {dims}")
                else:
                    scroller.hover()
                    scroller.evaluate("(el) => {el.scrollTop=0}")
                    page.mouse.wheel(0,950)
                    page.wait_for_timeout(250)
                    scrolled=scroller.evaluate("(el) => el.scrollTop")
                    print("PRINT WHEEL SCROLL",width,"scrollTop",scrolled,flush=True)
                    if scrolled < 20:
                        failures.append(f"{width}: wheel gesture did not scroll the expanded Print sheet")
                page.screenshot(path=f"/tmp/ad4-pages-print-scrolled-{width}.png",full_page=False)
                page.locator("#setting-search").fill("temperature")
                page.wait_for_timeout(100)
                if page.locator("#sidebar .setting[data-setting_id]:visible").count()<1:failures.append(f"{width}: global settings search cannot find temperature")
                page.locator("#ad4-search-clear").click()
                if page.locator("#setting-search").input_value():failures.append(f"{width}: clear-search failed")
                page.locator("#ad4-categories button[data-name='Speed']").click()
                speed_visible=page.locator("#sidebar .setting[data-setting_id]:visible").count()
                if speed_visible<1:failures.append("Cura Speed values missing")
                page.locator('#ad4-v3-top [data-route="filament"]').click()
                page.wait_for_function("document.body.dataset.ad4Screen==='filament'",timeout=4000)
                material_visible=page.locator("#sidebar .setting[data-setting_id]:visible").count()
                print("V3 MATERIAL SETTINGS",material_visible,flush=True)
                if material_visible<1:failures.append("Artillery PLA parameters missing")
                if page.locator("#ad4-categories [data-name='Material']").get_attribute("aria-pressed")!="true":failures.append(f"{width}: Filament did not select Material")
                page.screenshot(path=f"/tmp/ad4-pages-filament-{width}.png",full_page=False)
                page.locator('#ad4-v3-top [data-route="printer"]').click()
                if page.evaluate("document.body.dataset.ad4Screen")!="printer":failures.append(f"{width}: Printer tab does not navigate")
                if not page.locator("#ad4-v3-printer-page:visible").count():failures.append(f"{width}: Printer page empty")
                page.screenshot(path=f"/tmp/ad4-pages-printer-{width}.png",full_page=False)
                page.locator('#ad4-v3-top [data-route="app"]').click()
                page.wait_for_function("document.body.dataset.ad4Screen==='app'",timeout=4000)
                if not page.locator("#ad4-v3-export-profiles:visible").count():
                    failures.append("App profile exporter missing")
                page.locator('#ad4-v3-top [data-route="preview"]').click()
                page.locator("#ad4-v3-nav-move").click()
                page.wait_for_function("document.body.dataset.ad4Screen==='transform'",timeout=4000)
                if page.locator(".ad4-v3-axis-slider:visible").count()!=3:
                    failures.append("Three-axis transform missing")
                if page.locator(".ad4-v3-axis-value:visible").count()!=3:failures.append(f"{width}: labeled numeric axis inputs missing")
                if page.locator("#ad4-v3-snap").count()!=1 or page.locator("#ad4-v3-resize-lock").count()!=1:failures.append(f"{width}: transform snap/lock missing")
                page.locator(".ad4-v3-mode [data-mode='scale']").click()
                if page.locator("#ad4-v3-rotate90").is_visible():failures.append(f"{width}: Rotate action visible during Resize")
                page.screenshot(path=f"/tmp/ad4-pages-transform-{width}.png",full_page=False)
                page.locator("#ad4-v3-nav-slice").click()
                if page.evaluate("document.body.dataset.ad4Screen")!="slice-info":failures.append(f"{width}: Slice does not show its unavailable-state panel")
                page.screenshot(path=f"/tmp/ad4-pages-slice-{width}.png",full_page=False)
                page.locator('#ad4-v3-top [data-route="preview"]').click()
                page.wait_for_function("document.body.dataset.ad4Screen==='preview'",timeout=4000)
                page.locator("#ad4-v3-status").click()
                if not page.locator("#ad4-v3-status-menu").is_visible():failures.append(f"{width}: top-right menu did not open")
                if "FFAdv4Manager_cura" not in (page.locator("#ad4-v3-status-menu a").get_attribute("href") or ""):failures.append(f"{width}: wrong source code URL")
                page.locator("#ad4-v3-status").click()
                page.locator("#ad4-v3-nav-camera").click()
                if page.evaluate("document.body.dataset.ad4Screen")!="printer":failures.append(f"{width}: camera missing unavailable-state view")
                page.locator('#ad4-v3-top [data-route="preview"]').click()
                if not page.locator("#ad4-v3-open-model:visible").count():
                    failures.append("Model import control missing")
                if page.locator("#ad4-v3-run-slice").count()>0 and not page.locator("#ad4-v3-run-slice").is_disabled():
                    failures.append("Public Pages exposed backend slicing")
                # The print action is absent until a real server slice exists.
                # When present, Pages must still disable it.
                if page.locator("#ad4-v3-print").count() and not page.locator("#ad4-v3-print").is_disabled():
                    failures.append("Public Pages exposed physical printing")
            except Exception as error:
                failures.append(f"{width}: V3 navigation failed: {error}")
        if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"):
            failures.append(f"{width}: unexpected horizontal overflow")
        if errors:
            failures.append(f"{width}: browser console/runtime errors: "+" | ".join(errors[:8])[:1000])
        for msg in errors: print("FINAL",msg[:750],flush=True)
        if width<500:
            screenshot.parent.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(screenshot),full_page=True)
        page.close()
    browser.close()
if failures:
    print("SMOKE TEST FAILED:",failures,file=sys.stderr)
    sys.exit(1)
print("REAL BROWSER SMOKE TEST PASSED")
