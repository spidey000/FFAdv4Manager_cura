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
                  return gui?.file?.stl_file_name==="3DBenchy.stl"
                    && Object.keys(gui.model_viewer?.models||{}).length>0;
                }""",timeout=18000)
                count=page.evaluate("Object.keys(app.gui.model_viewer.models).length")
                print("DEMO STL GEOMETRY LOADED",count,flush=True)
                assert count>=1
                assert page.locator("#ad4-dock-demo").count()==1
                # Public documentation shots must show the REAL loaded Three.js model,
                # not a fabricated mockup. Only the Pages pipeline enables this output.
                docs_dir=os.environ.get("AD4_DOC_SCREENSHOT_DIR")
                if docs_dir and width in (390, 1280):
                    shot_dir=Path(docs_dir)
                    shot_dir.mkdir(parents=True,exist_ok=True)
                    page.wait_for_timeout(700)  # allow one rendered Three.js frame
                    suffix="mobile" if width==390 else "desktop"
                    page.screenshot(path=str(shot_dir/f"ad4-studio-{suffix}.png"),full_page=False)
                assert page.locator("#slice-button").is_disabled()
                assert page.locator("#ad4-dock-slice").is_disabled()
                if width<500:
                    sample=page.request.get(url.rstrip("/")+"/demo-benchy.stl")
                    assert sample.ok, "Demo STL was not served"
                    page.locator("#stl-file").set_input_files({
                        "name":"user_imported_benchy.stl",
                        "mimeType":"model/stl",
                        "buffer":sample.body()
                    })
                    page.wait_for_function("() => Object.keys(app.gui.model_viewer.models).length>=2",timeout=8000)
                    print("USER FILE UPLOAD LOADED AS 3D MODEL",flush=True)
                    # File tab must not expose layer controls; loaded models get
                    # their own dock tab, connected to the real Three.js registry.
                    assert page.locator('#ad4-v3-show-layers:visible').count()==0, "Layer action leaked into File"
                    assert page.locator('#ad4-v3-bottom button').count()==3, "Missing Models dock item"
                    models_button=page.locator("#ad4-v3-nav-models")
                    assert models_button.is_enabled(), "Models button should enable with an STL"
                    models_button.click()
                    menu=page.locator("#ad4-v3-models-menu")
                    assert menu.is_visible(), "Models menu did not open"
                    items=menu.locator(".ad4-v3-models-row")
                    assert items.count()>=2
                    names=menu.locator(".ad4-v3-model-name").all_inner_texts()
                    assert "3DBenchy.stl" in names, names
                    assert "user_imported_benchy.stl" in names, names
                    import_row=items.filter(has_text="user_imported_benchy.stl")
                    model_uuid=import_row.get_attribute("data-model-uuid")
                    import_row.locator(".ad4-v3-model-select").click()
                    assert page.evaluate("(uuid)=>app.gui.model_viewer.focused===uuid",model_uuid), "Model selection did not reach native scene"
                    exported_before=page.evaluate("app.gui.model_viewer.export_stl().byteLength")
                    import_row=menu.locator('.ad4-v3-models-row[data-model-uuid="'+model_uuid+'"]')
                    import_row.locator(".ad4-v3-model-visible").click()
                    assert page.evaluate("(uuid)=>app.gui.model_viewer.models[uuid].mesh.visible===false",model_uuid), "Model preview was not hidden"
                    assert page.evaluate("app.gui.model_viewer.export_stl().byteLength")==exported_before, "Hidden model was excluded from slicing export"
                    import_row=menu.locator('.ad4-v3-models-row[data-model-uuid="'+model_uuid+'"]')
                    page.once("dialog",lambda dialog:dialog.accept())
                    import_row.locator(".ad4-v3-model-remove").click()
                    page.wait_for_function("() => Object.keys(app.gui.model_viewer.models).length===1",timeout=5000)
                    assert menu.is_visible(), "Deleting a model closed its list unexpectedly"
                    models_button.click()
                    assert not menu.is_visible(), "Models button did not toggle menu closed"
                    models_button.click()
                    assert menu.is_visible()
                    page.locator('#ad4-v3-top [data-route="preview"]').click()
                    assert not menu.is_visible(), "Outside focus did not close the Models menu"
                    print("MODEL LIST SELECTION / VISIBILITY / DELETE / OUTSIDE CLOSE PASSED",flush=True)

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
                if categories!=6:failures.append(f"{width}: expected All + five Cura categories, got {categories}")
                # Accordions MUST start collapsed when Print opens.
                closed=page.locator('#sidebar #sections > .section:not([hidden])[data-closed="true"]').count()
                print("COLLAPSED SETTINGS GROUPS",closed,flush=True)
                if closed<1:failures.append(f"{width}: expected Print accordion groups initially collapsed")
                page.locator('#sidebar #sections > .section:not([hidden]) .section-title-container').first.click()
                visible=page.locator("#sidebar .setting[data-setting_id]:visible").count()
                print("PRINT QUALITY SETTINGS VISIBLE",visible,flush=True)
                print("CURA DOM CATEGORIES",page.evaluate("""() => Array.from(document.querySelectorAll("#sections .section")).slice(0,16).map(el=>({category:el.dataset.category_id,title:el.querySelector(".section-title-container")?.textContent?.trim(),count:el.querySelectorAll(".setting[data-setting_id]").length,visible:Array.from(el.querySelectorAll(".setting[data-setting_id]")).filter(n=>!n.hidden).slice(0,8).map(n=>n.dataset.setting_id)}))"""),flush=True)
                if visible<10:failures.append(f"{width}: expected full Cura Quality catalog, got {visible}")
                # Each setting label and its Lucide help icon open the bundled guide.
                try:
                    help_row=page.locator('#sidebar .setting[data-setting_id="layer_height"]:visible').first
                    help_icon=help_row.locator('.ad4-setting-help-trigger').first
                    assert help_icon.count()==1, "Missing question-mark icon"
                    assert help_icon.locator("svg.lucide, svg").count()==1, "Lucide SVG missing"
                    assert help_icon.get_attribute("aria-label").startswith("Read help for ")
                    help_icon.click()
                    modal=page.locator("#ad4-setting-help")
                    assert modal.is_visible() and modal.evaluate("(el)=>el.open")
                    assert page.locator("#ad4-help-heading").inner_text()=="Layer Height"
                    page.wait_for_function('document.querySelector("#ad4-setting-help .ad4-help-article img") !== null',timeout=8000)
                    article=page.locator("#ad4-setting-help .ad4-help-article")
                    assert "The 3D printer" in article.inner_text()
                    page.locator("#ad4-setting-help .ad4-help-scroll").evaluate("(el)=>el.scrollTop=el.scrollHeight")
                    assert page.locator("#ad4-setting-help .ad4-help-close").is_visible()
                    page.screenshot(path=f"/tmp/ad4-pages-guide-{width}.png",full_page=False)
                    page.locator("#ad4-setting-help .ad4-help-close").click()
                    assert not modal.is_visible()
                    help_row.locator('.setting-name').first.click()
                    assert modal.is_visible(), "Setting label must open the same guide"
                    page.keyboard.press("Escape")
                    assert not modal.is_visible(), "Escape must close the guide"
                    assert page.evaluate("document.body.dataset.ad4Screen")=="print", "Escape changed the Print route"
                except Exception as error:
                    failures.append(f"{width}: SettingsGuide modal regression: {error}")
                # Capture the real Print screen from the deployed bundle before scrolling.
                print_shot=Path(f"/tmp/ad4-pages-print-{width}.png")
                page.screenshot(path=str(print_shot),full_page=False)
                if os.environ.get("AD4_DOC_SCREENSHOT_DIR") and width==390:
                    page.screenshot(path=str(Path(os.environ["AD4_DOC_SCREENSHOT_DIR"])/"ad4-studio-settings-mobile.png"),full_page=False)
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
                # The flat All tab replaces the native-category dropdown but
                # still exposes every Cura setting and keeps groups collapsed.
                if page.locator("#ad4-profile-summary").count():
                    failures.append(f"{width}: redundant profile overview still exists")
                if page.locator("#ad4-native-category, #ad4-catalog-count").count():
                    failures.append(f"{width}: redundant category dropdown or counter still exists")
                if page.locator("#ad4-sheet-header:visible").count():
                    failures.append(f"{width}: duplicate Print heading still displayed")
                page.locator('#ad4-categories button[data-name="All"]').click()
                tab_look=page.locator('#ad4-v3-top [data-route="print"]').evaluate("""(el) => ({
                    border:getComputedStyle(el).borderWidth,
                    background:getComputedStyle(el).backgroundColor
                })""")
                if tab_look["border"]!="0px" or tab_look["background"]!="rgba(0, 0, 0, 0)":
                    failures.append(f"{width}: boxed top navigation remains: {tab_look}")
                group_look=page.locator('#sections > .section:not([hidden])').first.evaluate("""(el) => ({
                    radius:getComputedStyle(el).borderRadius,
                    background:getComputedStyle(el).backgroundColor
                })""")
                if group_look["radius"]!="0px" or group_look["background"]!="rgba(0, 0, 0, 0)":
                    failures.append(f"{width}: boxed Cura category remains: {group_look}")
                switch_look=page.evaluate("""() => {
                    const el=document.querySelector('#sidebar .setting-value input[type="checkbox"]');
                    if(!el)return null;
                    const before=el.checked,oldTransition=el.style.transition;
                    el.style.transition='none';
                    el.checked=true;
                    const color=getComputedStyle(el).backgroundColor;
                    const holder=getComputedStyle(el.closest('.setting-value'));
                    el.checked=before;
                    el.style.transition=oldTransition;
                    return {color,border:holder.borderWidth,background:holder.backgroundColor};
                }""")
                if switch_look and (switch_look["color"]!="rgb(45, 236, 121)" or switch_look["border"]!="0px"):
                    failures.append(f"{width}: toggle still has outer box or wrong accent: {switch_look}")
                native_stats=page.evaluate("""() => {
                    const rows=[...document.querySelectorAll('#sections .setting[data-setting_id]')];
                    const categories=[...document.querySelectorAll('#sections > .section[data-category_id]')];
                    return {total:rows.length,visible:rows.filter(x=>!x.hidden).length,
                      groups:categories.map(s=>({id:s.dataset.category_id,
                        total:s.querySelectorAll('.setting[data-setting_id]').length,
                        visible:[...s.querySelectorAll('.setting[data-setting_id]')].filter(x=>!x.hidden).length}))};
                }""")
                print("NATIVE CURA CATALOG",native_stats,flush=True)
                if native_stats["total"]<100:failures.append(f"{width}: incomplete full Cura catalog")
                if native_stats["visible"]!=native_stats["total"]:
                    failures.append(f"{width}: native Cura rows not in catalog: {native_stats['visible']}/{native_stats['total']}")
                if not page.locator('#sections > .section:not([hidden])[data-closed="true"]').count():
                    failures.append(f"{width}: All Cura categories were expanded unexpectedly")
                if len(native_stats["groups"])<8:failures.append(f"{width}: native Cura categories missing")
                if page.locator('#ad4-categories button[data-name="All"]').get_attribute("aria-pressed")!="true":
                    failures.append(f"{width}: All Cura tab did not activate")
                extra=page.locator('#sections .setting[data-setting_id="wall_line_width"] > .setting-bar input[type="number"]')
                if extra.count()==1:
                    prior=float(extra.input_value())
                    extra.fill(str(round(prior+0.03,4)))
                    extra.dispatch_event("change")
                    page.wait_for_timeout(650)
                    page.locator("#ad4-preset-type").select_option("process")
                    page.locator("#ad4-preset-name").fill("Full Cura Catalog Test")
                    page.locator("#ad4-save-preset").click()
                    stored=page.evaluate("""() => {
                      const data=JSON.parse(localStorage.getItem("ffadv4-mosaic-custom-presets-v1")||"{}");
                      return data.process?.find(p=>p.name==="Full Cura Catalog Test")?.values?.wall_line_width;
                    }""")
                    print("NATIVE WALL SETTING STORED IN PROFILE",stored,flush=True)
                    if stored is None or abs(stored-(prior+0.03))>0.001:
                        failures.append(f"{width}: profile omitted advanced Cura wall_line_width")
                else:failures.append(f"{width}: advanced Cura wall_line_width missing")
                page.wait_for_timeout(250)
                scroller=page.locator("#sidebar")
                dims=page.evaluate("""() => {
                    const el=document.querySelector("#sidebar");
                    return {client:el.clientHeight,total:el.scrollHeight};
                }""")
                if dims["total"] <= dims["client"] + 30:
                    failures.append(f"{width}: Expanded profiles and Cura settings are not scrollable together: {dims}")
                else:
                    scroller.evaluate("(el) => {el.scrollTop=0}")
                    bounds=scroller.bounding_box()
                    # Wheel on an inert gutter, not on a native input that may
                    # consume mouse-wheel events. Retry at the middle if needed.
                    page.mouse.move(bounds["x"]+12,bounds["y"]+bounds["height"]*0.65)
                    page.mouse.wheel(0,950)
                    page.wait_for_timeout(250)
                    scrolled=scroller.evaluate("(el) => el.scrollTop")
                    if scrolled < 20:
                        page.mouse.move(bounds["x"]+bounds["width"]*0.5,bounds["y"]+bounds["height"]*0.8)
                        page.mouse.wheel(0,950)
                        page.wait_for_timeout(300)
                        scrolled=scroller.evaluate("(el) => el.scrollTop")
                    print("PRINT WHEEL SCROLL",width,"scrollTop",scrolled,flush=True)
                    if scrolled < 20:
                        # Some headless runners intercept the wheel event. The
                        # actual required invariant is a scrollable sheet with
                        # reachable bottom controls, not a specific wheel target.
                        recovered=scroller.evaluate("""(el) => {
                            el.scrollTop=Math.min(500,el.scrollHeight-el.clientHeight);
                            return el.scrollTop;
                        }""")
                        print("PRINT SCROLL FALLBACK",width,"scrollTop",recovered,flush=True)
                        if recovered < 20:
                            failures.append(f"{width}: Print sheet cannot scroll to its settings")
                page.screenshot(path=f"/tmp/ad4-pages-print-scrolled-{width}.png",full_page=False)
                # Search does not auto-expand groups, which is intentional.
                page.locator("#setting-search").fill("temperature")
                for category in page.locator("#sections > .section:not([hidden])").all():
                    title=category.locator(".section-title-container").first
                    if category.get_attribute("data-closed")=="true" and title.is_visible():
                        title.click()
                page.wait_for_timeout(100)
                if page.locator("#sidebar .setting[data-setting_id]:visible").count()<1:failures.append(f"{width}: global settings search cannot find temperature")
                page.locator("#ad4-search-clear").click()
                if page.locator("#setting-search").input_value():failures.append(f"{width}: clear-search failed")
                page.locator("#ad4-categories button[data-name='Speed']").click()
                for category in page.locator("#sections > .section:not([hidden])").all():
                    title=category.locator(".section-title-container").first
                    if category.get_attribute("data-closed")=="true" and title.is_visible():
                        title.click()
                speed_visible=page.locator("#sidebar .setting[data-setting_id]:visible").count()
                print("SPEED DOM",page.evaluate("""() => ({search:document.querySelector("#setting-search")?.value,pressed:[...document.querySelectorAll("#ad4-categories button")].filter(b=>b.getAttribute("aria-pressed")==="true").map(b=>b.dataset.name),sections:[...document.querySelectorAll("#sections > .section")].filter(s=>["speed","travel","cooling","material"].includes(s.dataset.category_id)).map(s=>({id:s.dataset.category_id,hidden:s.hidden,closed:s.dataset.closed,rows:s.querySelectorAll(".setting[data-setting_id]").length,unhidden:[...s.querySelectorAll(".setting[data-setting_id]")].filter(r=>!r.hidden).length,height:s.getBoundingClientRect().height}))})"""),flush=True)
                print("SPEED SETTING ENABLED",page.evaluate("""() => Object.fromEntries(["speed_print","speed_wall","speed_travel","speed_infill","acceleration_print","cool_fan_enabled","material_print_temperature","material_bed_temperature"].map(id=>{const row=[...document.querySelectorAll("#sections .setting[data-setting_id]")].find(x=>x.dataset.setting_id===id);return [id,row?{enabled:row.dataset.is_enabled,hidden:row.hidden,display:getComputedStyle(row).display,parent_section:row.closest(".section")?.dataset.category_id,section_display:getComputedStyle(row.closest(".section")).display,value:row.querySelector("input")?.value}:null]}))"""),flush=True)
                if speed_visible<10:failures.append(f"{width}: incomplete Cura Speed values: {speed_visible}")
                page.locator('#ad4-v3-top [data-route="filament"]').click()
                page.wait_for_function("document.body.dataset.ad4Screen==='filament'",timeout=4000)
                for category in page.locator("#sections > .section:not([hidden])").all():
                    title=category.locator(".section-title-container").first
                    if category.get_attribute("data-closed")=="true" and title.is_visible():
                        title.click()
                material_visible=page.locator("#sidebar .setting[data-setting_id]:visible").count()
                print("V3 MATERIAL SETTINGS",material_visible,flush=True)
                print("MATERIAL DOM",page.evaluate("""() => ({search:document.querySelector("#setting-search")?.value,pressed:[...document.querySelectorAll("#ad4-categories button")].filter(b=>b.getAttribute("aria-pressed")==="true").map(b=>b.dataset.name),sections:[...document.querySelectorAll("#sections > .section")].filter(s=>["material","speed","cooling"].includes(s.dataset.category_id)).map(s=>({id:s.dataset.category_id,hidden:s.hidden,closed:s.dataset.closed,rows:s.querySelectorAll(".setting[data-setting_id]").length,unhidden:[...s.querySelectorAll(".setting[data-setting_id]")].filter(r=>!r.hidden).length,height:s.getBoundingClientRect().height}))})"""),flush=True)
                if material_visible<6:failures.append(f"{width}: material controls unexpectedly absent: {material_visible}")
                for setting_id in ("material_print_temperature","material_bed_temperature"):
                    if not page.locator(f'#sections .setting[data-setting_id="{setting_id}"]:visible').count():
                        failures.append(f"{width}: required Artillery PLA control hidden: {setting_id}")
                if page.locator("#ad4-categories [data-name='Material']").get_attribute("aria-pressed")!="true":failures.append(f"{width}: Filament did not select Material")
                page.screenshot(path=f"/tmp/ad4-pages-filament-{width}.png",full_page=False)
                page.locator('#ad4-v3-top [data-route="printer"]').click()
                if page.evaluate("document.body.dataset.ad4Screen")!="printer":failures.append(f"{width}: Printer tab does not navigate")
                if not page.locator("#ad4-v3-printer-page:visible").count():failures.append(f"{width}: Printer page empty")
                dashboard=page.locator('#ad4-v3-printer-page [data-printer-card]')
                expected={"status","temperatures","progress","job","camera","files","timelapse","controls","connection","diagnostics"}
                actual=set(dashboard.evaluate_all("(nodes)=>nodes.map(el=>el.dataset.printerCard)"))
                print("PRINTER OFFLINE CARDS",width,sorted(actual),flush=True)
                if actual!=expected:failures.append(f"{width}: missing offline printer cards: {expected-actual}")
                for card_id in expected:
                    card=page.locator(f'#ad4-v3-printer-page [data-printer-card="{card_id}"]')
                    if not card.is_visible():failures.append(f"{width}: offline card {card_id} hidden")
                    if not card.locator(".ad4-printer-value").inner_text().strip():
                        failures.append(f"{width}: offline card {card_id} has no placeholder")
                    if not card.locator("button").is_disabled():
                        failures.append(f"{width}: public preview exposed hardware action {card_id}")
                if not page.locator("#ad4-v3-printer-page").evaluate("(el)=>el.scrollHeight>el.clientHeight"):
                    failures.append(f"{width}: printer dashboard has no scroll to reach lower cards")
                page.locator("#ad4-v3-printer-page").evaluate("(el)=>el.scrollTop=el.scrollHeight")
                page.screenshot(path=f"/tmp/ad4-pages-printer-bottom-{width}.png",full_page=False)
                page.screenshot(path=f"/tmp/ad4-pages-printer-{width}.png",full_page=False)
                page.locator('#ad4-v3-top [data-route="app"]').click()
                page.wait_for_function("document.body.dataset.ad4Screen==='app'",timeout=4000)
                if not page.locator("#ad4-v3-export-profiles:visible").count():
                    failures.append("App profile exporter missing")
                page.locator('#ad4-v3-top [data-route="preview"]').click()
                if page.locator("#ad4-v3-bottom button").count()!=3:
                    failures.append(f"{width}: expected File, Models and Slice footer actions")
                if page.locator("#ad4-v3-header:visible, #ad4-v3-status:visible").count():
                    failures.append(f"{width}: redundant branded header or status button visible")
                if page.locator("#ad4-v3-workspace-card").count():
                    failures.append(f"{width}: redundant model overlay visible")
                if page.locator("#ad4-v3-nav-camera, #ad4-v3-nav-move").count():
                    failures.append(f"{width}: redundant Camera/Transform footer tools")
                toolbar=page.locator("#ad4-viewer-transform")
                if toolbar.locator("button").count()!=3:
                    failures.append(f"{width}: three in-view model transform tools missing")
                if page.locator("#ad4-viewer-snap").count()!=1:
                    failures.append(f"{width}: snap switch missing inside viewer")
                if page.evaluate("Boolean(globalThis.app?.gui?.model_viewer?.focused)"):
                    toolbar.locator('[data-viewer-mode="translate"]').click()
                    if toolbar.locator('[data-viewer-mode="translate"]').get_attribute("aria-pressed")!="true":
                        failures.append(f"{width}: Move does not activate native transform")
                    toolbar.locator('[data-viewer-mode="scale"]').click()
                    if toolbar.locator('[data-viewer-mode="scale"]').get_attribute("aria-pressed")!="true":
                        failures.append(f"{width}: Scale does not activate native transform")
                    toolbar.locator('[data-viewer-mode="rotate"]').click()
                    if toolbar.locator('[data-viewer-mode="rotate"]').get_attribute("aria-pressed")!="true":
                        failures.append(f"{width}: Rotate does not activate native transform")
                    page.locator("#ad4-viewer-snap").uncheck()
                    if page.locator("#ad4-v3-snap").is_checked():
                        failures.append(f"{width}: snap toolbar not linked to native control")
                    page.locator("#ad4-viewer-snap").check()
                dock_rect=page.locator("#ad4-v3-bottom").evaluate("""(el)=>{
                    const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,viewport:innerHeight};
                }""")
                if dock_rect["bottom"]>height+2 or dock_rect["top"]<0:
                    failures.append(f"{width}: footer clipped: {dock_rect}")
                page.screenshot(path=f"/tmp/ad4-pages-transform-{width}.png",full_page=False)
                page.locator("#ad4-v3-nav-slice").click()
                if page.evaluate("document.body.dataset.ad4Screen")!="slice-info":failures.append(f"{width}: Slice does not show its unavailable-state panel")
                page.screenshot(path=f"/tmp/ad4-pages-slice-{width}.png",full_page=False)
                page.locator('#ad4-v3-top [data-route="preview"]').click()
                page.wait_for_function("document.body.dataset.ad4Screen==='preview'",timeout=4000)
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
        if width==1280 and not startup_error and page.locator("#ad4-v3-remove-model").count():
            try:
                # Deletion of the final model must atomically clear geometry and all UI.
                page.locator('#ad4-v3-top [data-route="preview"]').click()
                page.wait_for_timeout(1100)
                page.once("dialog", lambda dlg: dlg.accept())
                page.locator("#ad4-v3-remove-model").click(timeout=3500)
                page.wait_for_function("() => Object.keys(globalThis.app?.gui?.model_viewer?.models||{}).length===0",timeout=9000)
                page.wait_for_timeout(1300)
                assert page.evaluate("Object.keys(app.gui.model_viewer.models).length")==0, "Model still present in actual Three.js scene"
                assert not page.locator("body").evaluate("(el)=>el.classList.contains('ad4-has-model')")
                assert page.locator("#ad4-v3-remove-model").is_hidden()
                page.screenshot(path="/tmp/ad4-pages-remove-model-1280.png",full_page=False)
                print("REMOVE LAST MODEL: UI STATE CLEAN",flush=True)
            except Exception as error:
                failures.append(f"{width}: remove model state inconsistent: {error}")
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
