"""Read-only navigation audit of the published Pages app; no printer API writes."""
import json
import os
from pathlib import Path
import shutil
import tempfile
from playwright.sync_api import sync_playwright

URL = os.environ.get('AD4_TEST_URL', 'https://spidey000.github.io/FFAdv4Manager_cura/')
OUT = Path(os.environ.get('AD4_AUDIT_OUTPUT', '/tmp/ad4-navigation'))
OUT.mkdir(parents=True, exist_ok=True)
records = []


def require(value, message):
    if not value:
        raise AssertionError(message)


with sync_playwright() as driver, tempfile.TemporaryDirectory() as temp:
    browser = driver.chromium.launch(headless=True,
        executable_path=os.environ.get('CHROME_BIN') or shutil.which('google-chrome') or None,
        args=['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for width, height in [(320, 568), (390, 844), (1280, 800)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page()
        errors, writes = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: writes.append(r.url) if '/api/printer/' in r.url and r.method != 'GET' else None)
        page.on('dialog', lambda d: d.accept())  # Only fresh-context, browser-local fixtures.

        def check(name, action):
            try:
                observed = action()
                records.append({'width': width, 'flow': name, 'ok': True, 'observed': observed})
            except Exception as error:
                records.append({'width': width, 'flow': name, 'ok': False, 'error': str(error)})
                page.screenshot(path=str(OUT / f'{width}-failure-{len(records)}.png'))
                page.keyboard.press('Escape')
                print('FAILED', width, name, str(error), flush=True)

        def route(name):
            page.locator(f'#ad4-v3-top [data-route="{name}"]').click(timeout=5000)
            page.wait_for_function('(name)=>document.body.dataset.ad4Screen===name', arg=name)
            target = {'preview': '#stl-viewer', 'print': '#sidebar-container', 'filament': '#sidebar-container',
                      'printer': '#ad4-v3-printer-page', 'app': '#ad4-v3-app'}[name]
            require(page.locator(target).is_visible(), f'{name}: destination is hidden')
            require(page.locator(f'#ad4-v3-top [data-route="{name}"]').get_attribute('aria-pressed') == 'true', 'Wrong selected top tab')
            return {'screen': name, 'target': target}

        try:
            page.goto(URL, wait_until='domcontentloaded')
            page.wait_for_function('globalThis.app?.gui?.model_viewer && document.getElementById("loading").style.display === "none"', timeout=45000)
            require(page.evaluate('window.__AD4_STATIC_PREVIEW__ === true'), 'This audit requires static preview mode')
            page.wait_for_function('globalThis.app?.gui?.slicer?.exported_gcode && Object.keys(app.gui.model_viewer.models).length > 0', timeout=20000)

            for name in ('preview', 'print', 'filament', 'printer', 'app'):
                check('top/' + name, lambda name=name: route(name))
                page.screenshot(path=str(OUT / f'{width}-{name}.png'))

            def model_menu():
                route('app')
                require(not page.locator('#ad4-v3-bottom').is_visible(), 'Editor footer must stay scoped to the viewer')
                route('preview')
                page.locator('#ad4-v3-nav-models').click()
                require(page.locator('#ad4-v3-models-menu').is_visible(), 'Models menu hidden')
                require(page.evaluate('document.body.dataset.ad4Screen') == 'preview', 'Models must return to model viewer')
                page.locator('.ad4-v3-model-select').first.click()
                require(page.evaluate('Boolean(app.gui.model_viewer.focused)'), 'Selection did not reach the model')
                page.locator('#ad4-v3-nav-models').click()
                require(not page.locator('#ad4-v3-models-menu').is_visible(), 'Models menu did not close')
            check('models/open-select-close-after-returning-from-App', model_menu)

            for mode in ('translate', 'rotate', 'scale'):
                def transform(mode=mode):
                    route('preview')
                    button = page.locator(f'#ad4-viewer-transform [data-viewer-mode="{mode}"]')
                    button.click()
                    require(button.get_attribute('aria-pressed') == 'true', f'{mode}: native tool not selected')
                check('viewer/' + mode, transform)

            route('print')
            for category in ('All', 'Quality', 'Strength', 'Speed', 'Support', 'Material'):
                def choose_category(category=category):
                    button = page.locator(f'#ad4-categories [data-name="{category}"]')
                    button.click()
                    require(button.get_attribute('aria-pressed') == 'true', 'Category not selected')
                    count = page.locator('#sections .setting[data-setting_id]:not([hidden])').count()
                    require(count > 0, 'Category has no available Cura settings')
                    return {'available_settings': count}
                check('settings/category/' + category, choose_category)
            page.locator('#ad4-categories [data-name="All"]').click()
            for tier in ('All', 'Basic', 'Advanced', 'Expert'):
                def complexity(tier=tier):
                    button = page.locator(f'#ad4-complexity [data-name="{tier}"]')
                    button.click()
                    require(button.get_attribute('aria-pressed') == 'true', 'Complexity not selected')
                    return {'available_settings': page.locator('#sections .setting[data-setting_id]:not([hidden])').count()}
                check('settings/complexity/' + tier, complexity)
            page.locator('#ad4-complexity [data-name="All"]').click()

            def profiles():
                toggle = page.locator('#ad4-presets-toggle')
                if toggle.get_attribute('aria-expanded') != 'true':
                    toggle.click()
                require(page.locator('#ad4-process-preset').is_visible(), 'Process menu missing')
                require(page.locator('#ad4-material-preset').is_visible(), 'Material menu missing')
                toggle.click()
                require(not page.locator('#ad4-presets-panel').is_visible(), 'Profile panel did not close')
            check('settings/profiles-panel', profiles)

            def help_modal():
                route('print')
                page.locator('#ad4-categories [data-name="Quality"]').click()
                row = page.locator('#sections .setting[data-setting_id="layer_height"]')
                section = row.locator('xpath=ancestor::*[contains(@class,"section")][1]')
                if section.get_attribute('data-closed') == 'true':
                    section.locator('.section-title-container').click()
                row.locator('.ad4-setting-help-trigger').click()
                require(page.locator('#ad4-setting-help').is_visible(), 'Help icon did not open the guide')
                page.locator('#ad4-setting-help .ad4-help-close').click()
                require(not page.locator('#ad4-setting-help').is_visible(), 'Help close did not close')
                row.locator('.setting-name').click()
                require(page.locator('#ad4-setting-help').is_visible(), 'Setting name did not open the guide')
                page.keyboard.press('Escape')
                require(page.evaluate('document.body.dataset.ad4Screen') == 'print', 'Guide Escape left Print')
            check('settings/help-icon-name-close-Escape', help_modal)

            def search():
                page.locator('#ad4-categories [data-name="All"]').click()
                page.locator('#setting-search').fill('temperature')
                require(page.locator('#sections .setting[data-setting_id]:not([hidden])').count() > 0, 'Search returned no settings')
                page.locator('#ad4-search-clear').click()
                require(page.locator('#setting-search').input_value() == '', 'Search did not clear')
            check('settings/search-clear', search)

            def slice_demo():
                route('preview')
                page.locator('#ad4-v3-nav-slice').click()
                page.wait_for_function('document.body.dataset.ad4Screen === "sliced" && globalThis.AD4GCodePreview?.count > 1')
                require(page.locator('#ad4-v3-layer-card').is_visible(), 'Demo layer preview missing')
                require(page.locator('#ad4-v3-send').is_disabled() and page.locator('#ad4-v3-print').is_disabled(), 'Pages enabled physical actions')
                return {'layers': page.evaluate('AD4GCodePreview.count')}
            check('slice/demo-layers', slice_demo)

            def layer_types():
                page.locator('#ad4-v3-show-layers').click()
                require(page.locator('#ad4-v3-types-panel').is_visible(), 'Layer types did not open')
                require(page.locator('#ad4-v3-type-list input').count() > 0, 'No layer type switches')
                page.locator('#ad4-v3-show-layers').click()
                require(page.locator('#ad4-v3-range-panel').is_visible(), 'Layer range did not return')
                thumb = page.locator('#ad4-v3-range-max')
                before = int(thumb.get_attribute('aria-valuenow'))
                thumb.press('ArrowLeft')
                require(int(thumb.get_attribute('aria-valuenow')) == before - 1, 'Layer keyboard range did not move')
            check('slice/types-range-keyboard', layer_types)

            def export_gcode():
                with page.expect_download() as result:
                    page.locator('#ad4-v3-export').click()
                require('DEMO ONLY' in Path(result.value.path()).read_text(), 'Export does not contain the labeled demo')
            check('slice/export-demo-file', export_gcode)

            def app_profiles():
                route('app')
                with page.expect_download() as result:
                    page.locator('#ad4-v3-export-profiles').click()
                data = json.loads(Path(result.value.path()).read_text())
                require(set(data) >= {'process', 'material'}, 'Profile export schema missing')
                with page.expect_file_chooser() as chooser:
                    page.locator('#ad4-v3-import-profiles').click()
                chooser.value.set_files({'name': 'audit-profiles.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode()})
                page.wait_for_function('document.getElementById("ad4-v3-toast-message").textContent.includes("Profiles imported")')
            check('app/export-import-profiles', app_profiles)

            def app_printer():
                route('app')
                page.locator('#ad4-v3-open-printer').click()
                require(page.evaluate('document.body.dataset.ad4Screen') == 'printer', 'App printer link did not open dashboard')
            check('app/open-printer', app_printer)
            def project_link():
                route('app')
                link = page.locator('#ad4-v3-app a')
                require(link.get_attribute('href') == 'https://github.com/spidey000/FFAdv4Manager_cura', 'Wrong project URL')
                require(link.get_attribute('target') == '_blank', 'Project should open separately')
                route('printer')
            check('app/project-link-target', project_link)
            for card in ('status', 'temperatures', 'progress', 'job', 'camera', 'files', 'timelapse', 'controls', 'connection', 'diagnostics'):
                def printer_card(card=card):
                    item = page.locator(f'[data-printer-card="{card}"]')
                    require(item.is_visible(), 'Printer card hidden')
                    require(item.locator('button').is_disabled(), 'Hardware control should explain Pages limitation')
                check('printer/' + card + '/static-state', printer_card)
            for origin in ('print', 'filament', 'printer', 'app'):
                def footer_file(origin=origin):
                    route(origin)
                    require(not page.locator('#ad4-v3-bottom').is_visible(), 'Editor footer leaked outside the viewer')
                    route('preview')
                    page.locator('#ad4-v3-nav-file').click()
                    require(page.evaluate('document.body.dataset.ad4Screen') == 'preview', 'File did not return to model')
                    require(page.locator('#ad4-v3-open-model').is_visible(), 'File actions missing')
                check('footer/context-and-return-from-' + origin, footer_file)

            def no_model():
                route('preview')
                page.locator('#ad4-v3-remove-model').click()
                page.wait_for_function('Object.keys(app.gui.model_viewer.models).length === 0')
                page.wait_for_function('document.getElementById("ad4-v3-nav-models").disabled')
                page.locator('#ad4-v3-nav-slice').click()
                require(page.locator('#ad4-v3-slice-info').is_visible(), 'Slice without model must explain unavailability')
                page.locator('#ad4-v3-return-preview').click()
                require(page.evaluate('document.body.dataset.ad4Screen') == 'preview', 'Return to model failed')
            check('empty-model/Slice-return', no_model)
            require(not writes, 'Pages attempted printer writes: ' + str(writes))
            require(not errors, 'Runtime errors: ' + str(errors))
        except Exception as error:
            records.append({'width': width, 'flow': 'boot-or-runtime', 'ok': False, 'error': str(error)})
        finally:
            context.close()
    browser.close()

(OUT / 'report.json').write_text(json.dumps({'url': URL, 'results': records}, indent=2))
failed = [r for r in records if not r['ok']]
print(json.dumps({'checks': len(records), 'passed': len(records) - len(failed), 'failed': failed}, indent=2))
raise SystemExit(bool(failed))
