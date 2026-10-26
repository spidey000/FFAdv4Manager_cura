import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PrinterManager from './PrinterManager.jsx'
import CuraSettingsDrawer from './CuraSettingsDrawer.jsx'
import { ARTILLERY_PLA_BASIC } from './profileLibrary.js'
import { checkArtilleryHeating } from './temperatureSafety.js'
import './app.css'

const BASE_URL = import.meta.env.BASE_URL
const IS_PAGES_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true'
const CURA_URL = BASE_URL + 'cura/index.html?profiles=' + encodeURIComponent(BASE_URL + 'cura-profiles/profile_list.toml')
const MAX_BYTES = 100 * 1024 * 1024

function makeGxThumbnail(win) {
  // The original GX converter recognizes Prusa/Cura thumbnail comment blocks.
  // Capture after a render; a blank/unsupported WebGL canvas falls back safely.
  try {
    const source = win.document.getElementById('webgl')
    if (!source) return ''
    win.renderLoop?.render?.()
    const out = document.createElement('canvas')
    out.width = 80; out.height = 60
    const context = out.getContext('2d')
    if (!context) return ''
    context.drawImage(source, 0, 0, out.width, out.height)
    const png = out.toDataURL('image/png').split(',')[1]
    if (!png || png.length > 200000) return ''
    const lines = png.match(/.{1,76}/g).map(x => '; ' + x).join('\n')
    return '; thumbnail begin 80x60 ' + png.length + '\n' + lines + '\n; thumbnail end\n'
  } catch { return '' }
}

function metadataComments(win) {
  // Read the effective Cura options (which users may edit), not guessed values.
  const names = [['material_bed_temperature', 'bed_temperature'],
    ['material_print_temperature', 'nozzle_temperature'],
    ['layer_height', 'layer_height'], ['wall_line_count', 'wall_line_count'],
    ['speed_print', 'print_speed']]
  const lines = []
  for (const [option, key] of names) {
    try {
      const value = Number(win.slicer?.getOption?.(option))
      if (Number.isFinite(value) && value > 0 && value < 10000) lines.push('; ' + key + ': ' + value)
    } catch { /* Some WASM builds may not expose the option */ }
  }
  return lines.length ? lines.join('\n') + '\n' : ''
}

function App() {
  const frame = useRef(null)
  const filePicker = useRef(null)
  const [manager, setManager] = useState(false)
  const [tuneOpen, setTuneOpen] = useState(false)
  const [autoSlice, setAutoSlice] = useState(false)
  const [timelapseEnabled, setTimelapseEnabled] = useState(false)
  const [timelapseMode, setTimelapseMode] = useState('interval')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [curaReady, setCuraReady] = useState(false)
  const [hasModel, setHasModel] = useState(false)
  const [modelName, setModelName] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [printer, setPrinter] = useState(IS_PAGES_DEMO ? 'Static preview · no printer connection' : 'Checking connection')

  // Only the same-origin Cura iframe is allowed to report UI state.
  useEffect(() => {
    const receive = event => {
      if (event.source !== frame.current?.contentWindow ||
          event.origin !== window.location.origin ||
          event.data?.source !== 'ffadv4-cura') return
      const message = event.data
      if (message.type === 'state') {
        setReady(Boolean(message.hasGcode))
        setHasModel(Boolean(message.hasModel))
        setSettingsOpen(Boolean(message.settingsOpen))
        setCuraReady(Boolean(message.initialized))
      } else if (message.type === 'model-selected') {
        setModelName(message.name || '')
      } else if (message.type === 'error') {
        setError(message.message || 'Cura action failed')
      } else if (message.type === 'slicing') {
        setNotice('Slicing with CuraEngine…')
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  function sendToCura(command, detail = {}) {
    const win = frame.current?.contentWindow
    if (!win) { setError('Cura has not loaded. Reload the slicer.'); return }
    win.postMessage({ source: 'ffadv4-shell', command, ...detail }, window.location.origin)
  }

  function chooseModel(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.(?:stl|obj|3mf)$/i.test(file.name) || file.size > MAX_BYTES || !file.size) {
      setError('Select an STL, OBJ or 3MF model smaller than 100 MB.')
      return
    }
    setError(''); setNotice('')
    setModelName(file.name)
    setReady(false)
    sendToCura('load-model', {file})
  }

  useEffect(() => {
    let active = true
    const inspect = () => {
      try { if (active) setReady(Boolean(frame.current?.contentWindow?.ffadv4LastGcode)) }
      catch { if (active) setReady(false) }
    }
    async function status() {
      if (IS_PAGES_DEMO) return
      try {
        const response = await fetch('/api/printer/status', { cache: 'no-store' })
        if (!response.ok) throw new Error()
        const info = await response.json()
        if (active) setPrinter(info.machine_status || 'Connected')
      } catch { if (active) setPrinter('Offline / not configured') }
    }
    inspect(); status()
    const timer = setInterval(inspect, 1500)
    const netTimer = setInterval(status, 12000)
    return () => { active = false; clearInterval(timer); clearInterval(netTimer) }
  }, [])

  async function upload(start) {
    if (IS_PAGES_DEMO || sending) return
    setError(''); setNotice('')
    let win, gcode, name
    try {
      win = frame.current?.contentWindow
      gcode = win?.ffadv4LastGcode
      name = win?.document?.getElementById('gcode_filename')?.value || 'cura-print.gcode'
    } catch { setError('Cura iframe unavailable. Reload the slicer.'); return }
    if (!gcode || typeof gcode !== 'string' || !/^(?:G|M|T)\d+/m.test(gcode)) {
      setError('No sliced G-code yet. Load a model and click Slice inside Cura first.')
      return
    }
    if (!/\.(?:gco|gcode|g)$/i.test(name)) name = name.replace(/\.[^.]+$/, '') + '.gcode'
    const decorated = makeGxThumbnail(win) + metadataComments(win) + gcode
    const warnings = checkArtilleryHeating(decorated, ARTILLERY_PLA_BASIC)
    if (warnings.length) {
      setError('Upload blocked by Artillery PLA temperature guard: ' + warnings.join('; '))
      return
    }
    const bytes = new TextEncoder().encode(decorated)
    if (bytes.byteLength > MAX_BYTES) { setError('G-code exceeds the 100 MB upload limit.'); return }
    if (!window.confirm(start
      ? 'Start a REAL print on the Adventurer 4? Inspect the printer, model and temperatures first.'
      : 'Upload this file to the Adventurer 4? Firmware behavior is not guaranteed to be upload-only; inspect the printer.')) return
    setSending(true)
    try {
      const res = await fetch('/api/printer/jobs?name=' + encodeURIComponent(name) + '&start=' + start + '&timelapse=' + (start && timelapseEnabled) + '&timelapse_mode=' + encodeURIComponent(timelapseMode), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: bytes,
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || 'Upload failed (HTTP ' + res.status + ')')
      setNotice('Uploaded as ' + result.remote_name + (start ? ' · Print start requested' : ' · Upload only requested') + (result.timelapse_error ? ' · Timelapse error: '+result.timelapse_error : ''))
    } catch (e) { setError(e.message) }
    finally { setSending(false) }
  }

  function downloadGcode() {
    try {
      const win = frame.current?.contentWindow
      const gcode = win?.ffadv4LastGcode
      if (!gcode || typeof gcode !== 'string') throw new Error('Slice a model in Cura first.')
      const name = win?.document?.getElementById('gcode_filename')?.value || 'adventurer4.gcode'
      const filename = name.replace(/[^A-Za-z0-9_. -]/g, '_').slice(0, 100) || 'adventurer4.gcode'
      const blob = new Blob([gcode], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = /\.(?:gcode|gco|g)$/i.test(filename) ? filename : filename + '.gcode'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) { setError(e.message) }
  }

  const canSlice = curaReady && hasModel && !sending

  return <div className="app-shell">
    <header className="top-bar">
      <div className="brand">
        <span className="logo">F4</span>
        <div><strong>Adventurer 4</strong><small>CuraEngine · Artillery PLA Basic</small></div>
      </div>
      <div className="top-actions">
        <button type="button" className="quick-tune" onClick={() => setTuneOpen(true)} aria-label="Open advanced Cura tuning and custom profiles">Tune</button>
        {IS_PAGES_DEMO
          ? <span className="status demo-status"><span className="status-dot" />Browser preview</span>
          : <button type="button" className="printer-access" onClick={() => setManager(true)}
              aria-label={'Open printer manager. ' + printer} title="Printer manager">
              <span className="printer-access-icon" aria-hidden="true">▣</span>
              <span className="printer-access-label"><strong>AD4</strong><small>{printer}</small></span>
              <span className="printer-access-arrow" aria-hidden="true">›</span>
            </button>}
      </div>
    </header>

    {IS_PAGES_DEMO && <div role="status" className="demo-banner">
      Browser-only preview. Printing and printer management require the private server.
    </div>}

    <main className="workspace">
      <div className="slicer-area" aria-label="3D model viewer and Cura slicer">
        <iframe ref={frame} title="CuraEngine 3D viewer for FlashForge Adventurer 4"
          src={CURA_URL} allow="clipboard-read; clipboard-write"
          onLoad={() => { setReady(false); setHasModel(false); setCuraReady(false); sendToCura('get-state') }} />
      </div>
    </main>

    <input type="file" ref={filePicker} className="shell-file-picker"
      accept=".stl,.obj,.3mf" aria-label="Choose a 3D model" onChange={chooseModel} />

    <footer className="action-bar" aria-label="Slicing and printer quick actions">
      <div className="job-state" aria-live="polite">
        <span className={ready ? 'signal active' : 'signal'} />
        <div>
          <strong>{sending ? 'Sending to Adventurer 4…' : ready ? 'Ready to print' :
            !curaReady ? 'Loading CuraEngine…' : hasModel ? 'Model ready to slice' : 'Add a 3D model to begin'}</strong>
          <small title={modelName}>{modelName || (IS_PAGES_DEMO ? 'G-code download only' : 'Print or upload directly from the browser')}</small>
        </div>
      </div>
      <div className="job-actions">
        <label className="cura-pill-switch"><input type="checkbox" checked={autoSlice} onChange={e => setAutoSlice(e.target.checked)}/><span>Auto slice</span></label>
        {!IS_PAGES_DEMO && <label className="cura-pill-switch"><input type="checkbox" checked={timelapseEnabled} onChange={e => setTimelapseEnabled(e.target.checked)}/><span>Timelapse</span></label>}
        {!IS_PAGES_DEMO && timelapseEnabled && <select className="cura-capture-mode" aria-label="Timelapse capture mode" value={timelapseMode}
          onChange={e=>setTimelapseMode(e.target.value)}><option value="interval">By time</option><option value="layer">By Z layer · experimental</option></select>}
        <button type="button" className={'quick-action settings-action' + (settingsOpen ? ' is-on' : '')}
          onClick={() => sendToCura(settingsOpen ? 'close-settings' : 'open-settings')}
          aria-label={settingsOpen ? 'Close slicing settings' : 'Open slicing settings'}
          aria-expanded={settingsOpen} title="Slicing settings">
          <span className="quick-icon" aria-hidden="true">⚙</span><span className="quick-label">Settings</span>
        </button>
        <button type="button" className="quick-action model-action"
          onClick={() => filePicker.current?.click()} disabled={!curaReady}
          title="Add STL, OBJ or 3MF model" aria-label="Add 3D model">
          <span className="quick-icon" aria-hidden="true">＋</span><span className="quick-label">Model</span>
        </button>
        {ready
          ? <>
              <button type="button" className="quick-action reslice-action" disabled={!canSlice}
                onClick={() => sendToCura('slice')} title="Re-slice the model" aria-label="Re-slice model">
                <span className="quick-icon" aria-hidden="true">↻</span><span className="quick-label">Slice</span>
              </button>
              {IS_PAGES_DEMO
                ? <button className="btn primary main-action" disabled={!ready} onClick={downloadGcode}>Download G-code</button>
                : <div className="print-split" role="group" aria-label="Send the sliced job to the printer">
                    <button type="button" className="print-action" disabled={sending} onClick={() => upload(true)}>Print</button>
                    <button type="button" className="send-action" disabled={sending} onClick={() => upload(false)}>Upload only</button>
                  </div>}
            </>
          : <button type="button" className="btn primary main-action" disabled={!canSlice}
              onClick={() => sendToCura('slice')}>Slice model</button>}
      </div>
    </footer>

    {(error || notice) && <div role={error ? 'alert' : 'status'} className={'toast ' + (error ? 'bad' : 'good')}>
      <span>{error || notice}</span>
      <button aria-label="Dismiss message" type="button"
        onClick={() => { setNotice(''); setError('') }}>×</button>
    </div>}
    {manager && <PrinterManager onClose={() => setManager(false)} timelapseEnabled={timelapseEnabled} />}
    {tuneOpen && <CuraSettingsDrawer frameRef={frame} onClose={() => setTuneOpen(false)} onChanged={() => {setReady(false);sendToCura('get-state')}} autoSlice={autoSlice}/>}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
