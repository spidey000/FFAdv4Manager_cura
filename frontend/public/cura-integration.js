/* FFAdv4Manager Cura <-> mobile web shell integration.
 * Keep Symple/CuraEngine upstream sources pinned and unmodified.
 * Printer commands stay in the authenticated parent, never inside the iframe.
 */
(function () {
  'use strict'
  const MESSAGE_FROM_SHELL = 'ffadv4-shell'
  const MESSAGE_FROM_CURA = 'ffadv4-cura'
  const MAX_MODEL_BYTES = 100 * 1024 * 1024
  const parentOrigin = location.origin
  let hookedSlicer = false
  let hookedStage = false
  let lastState = ''
  window.ffadv4LastGcode = null

  // Force our only supported machine/material combination on the first run.
  if (localStorage.getItem('ffadv4-cura-profile-version') !== 'ad4-artillery-v1') {
    localStorage.removeItem('startup_config')
    localStorage.setItem('ffadv4-cura-profile-version', 'ad4-artillery-v1')
  }
  const profilesUrl = new URL('../cura-profiles/profile_list.toml', location.href).pathname
  localStorage.setItem('profile_urls', profilesUrl)

  // Loaded after Symple styles, so mobile rules are a non-vendored override.
  const style = document.createElement('link')
  style.rel = 'stylesheet'
  style.href = new URL('../cura-mobile.css', location.href).href
  document.head.appendChild(style)

  const send = (type, detail) => {
    if (window.parent !== window) {
      window.parent.postMessage(Object.assign({source: MESSAGE_FROM_CURA, type}, detail || {}), parentOrigin)
    }
  }
  const hasModel = () => Boolean(document.querySelector('.requires_objects:not([disabled])'))
  const hasGcode = () => typeof window.ffadv4LastGcode === 'string' &&
    /^(?:G|M|T)\d+/m.test(window.ffadv4LastGcode)
  function publishState(force) {
    const state = {hasModel: hasModel(), hasGcode: hasGcode(),
      settingsOpen: document.body.classList.contains('ffadv4-sheet-open'),
      initialized: Boolean(window.settings && window.stage)}
    const fingerprint = JSON.stringify(state)
    if (force || fingerprint !== lastState) {
      lastState = fingerprint
      send('state', state)
    }
  }

  function openDrawer(open) {
    document.body.classList.toggle('ffadv4-sheet-open', Boolean(open))
    const sheet = document.querySelector('.dock')
    if (sheet) sheet.setAttribute('aria-hidden', String(!open))
    publishState(true)
    if (open) {
      // Preserve Symple's currently active page; it contains profile setup
      // before first use, followed by the real Cura option editors.
      const close = document.querySelector('#ffadv4-sheet-close')
      close?.focus({preventScroll: true})
    }
    window.dispatchEvent(new Event('resize'))
  }
  function addDrawerChrome() {
    const dock = document.querySelector('.dock')
    if (!dock || document.getElementById('ffadv4-sheet-head')) return
    const backdrop = document.createElement('button')
    backdrop.id = 'ffadv4-sheet-backdrop'
    backdrop.type = 'button'
    backdrop.setAttribute('aria-label', 'Close slicing settings')
    backdrop.addEventListener('click', () => openDrawer(false))
    document.body.appendChild(backdrop)
    const head = document.createElement('div')
    head.id = 'ffadv4-sheet-head'
    head.innerHTML = '<span class="ffadv4-grip" aria-hidden="true"></span>' +
      '<div><small>ADVENTURER 4 · ARTILLERY PLA</small><strong>Slicing settings</strong></div>' +
      '<button type="button" id="ffadv4-sheet-close" aria-label="Close settings">×</button>'
    dock.insertBefore(head, dock.firstChild)
    head.querySelector('button').addEventListener('click', () => openDrawer(false))
    dock.setAttribute('aria-hidden', 'true')
  }
  function invalidateGcode() {
    if (window.ffadv4LastGcode) {
      window.ffadv4LastGcode = null
      publishState(true)
    }
  }

  function applyCommand(command, data) {
    if (command === 'get-state') { publishState(true); return }
    if (command === 'open-settings') {
      addDrawerChrome()
      openDrawer(true)
      return
    }
    if (command === 'close-settings') { openDrawer(false); return }
    if (!window.settings || !window.stage) {
      send('error', {message: 'Cura is still loading. Try again once the slicer is ready.'})
      return
    }
    if (command === 'load-model') {
      const file = data.file
      if (!(file instanceof File) || !/\.(stl|obj|3mf)$/i.test(file.name) ||
          !file.size || file.size > MAX_MODEL_BYTES) {
        send('error', {message: 'Choose an STL, OBJ or 3MF model (maximum 100 MB).'})
        return
      }
      const input = document.getElementById('model_file')
      if (!input || typeof DataTransfer === 'undefined') {
        send('error', {message: 'The model loader is unavailable. Open settings to load the file.'})
        return
      }
      window.settings.gotoPage('page_place')
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
      invalidateGcode()
      input.dispatchEvent(new Event('change', {bubbles: true}))
      openDrawer(false)
      send('model-selected', {name: file.name})
      setTimeout(() => publishState(true), 1000)
      return
    }
    if (command === 'slice') {
      if (!hasModel()) {
        send('error', {message: 'Add a 3D model before slicing.'})
        return
      }
      window.settings.gotoPage('page_slice')
      const button = Array.from(document.querySelectorAll('.page_slice.footer button'))
        .find(el => el.textContent.trim() === 'Slice')
      if (!button || button.disabled) {
        send('error', {message: 'Cura slicing controls are not available yet.'})
        return
      }
      invalidateGcode()
      openDrawer(false)
      button.click() // Execute the real upstream Cura slice handler.
      send('slicing')
      return
    }
    if (command === 'show-preview') {
      window.settings.gotoPage('page_print')
      openDrawer(true)
    }
  }

  window.addEventListener('message', event => {
    // Same origin AND the embedding parent: never accept arbitrary print/UI commands.
    if (event.source !== window.parent || event.origin !== parentOrigin ||
        !event.data || event.data.source !== MESSAGE_FROM_SHELL) return
    applyCommand(event.data.command, event.data)
  })
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('ffadv4-sheet-open')) {
      openDrawer(false)
    }
  })
  // Invalidate an earlier slice whenever Cura print parameters or the model change.
  document.addEventListener('change', event => {
    if (event.target.closest('#page_slice, #page_profiles, #page_place')) invalidateGcode()
  }, true)

  const interval = setInterval(function () {
    addDrawerChrome()
    if (!hookedSlicer && window.slicer && typeof window.slicer.readFile === 'function') {
      const client = window.slicer
      const read = client.readFile.bind(client)
      client.readFile = async function (...args) {
        const data = await read(...args)
        if (typeof data === 'string' && /^(?:G|M|T)\d+/m.test(data)) {
          window.ffadv4LastGcode = data
          publishState(true)
        }
        return data
      }
      hookedSlicer = true
    }
    if (!hookedStage && window.stage && typeof window.stage.slice === 'function') {
      const stage = window.stage
      const slice = stage.slice.bind(stage)
      stage.slice = function (...args) {
        invalidateGcode()
        return slice(...args)
      }
      hookedStage = true
    }
    publishState()
    if (hookedSlicer && hookedStage && window.settings) clearInterval(interval)
  }, 300)
  setTimeout(() => clearInterval(interval), 90000)
  // A model may finish importing after the initial command resolves.
  setInterval(() => publishState(), 1500)
  publishState(true)
})()
