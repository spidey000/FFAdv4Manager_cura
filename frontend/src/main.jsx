import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PrinterManager from './PrinterManager.jsx'
import './app.css'

const CURA_URL = '/cura/index.html?profiles=/cura-profiles/profile_list.toml'
const MAX_BYTES = 100 * 1024 * 1024

function App() {
  const frame = useRef(null)
  const [manager, setManager] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [printer, setPrinter] = useState('Checking connection')

  useEffect(() => {
    let active = true
    const inspect = () => {
      try { if (active) setReady(Boolean(frame.current?.contentWindow?.ffadv4LastGcode)) }
      catch { if (active) setReady(false) }
    }
    async function status() {
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
    if (sending) return
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
    const bytes = new TextEncoder().encode(gcode)
    if (bytes.byteLength > MAX_BYTES) { setError('G-code exceeds the 100 MB upload limit.'); return }
    if (!window.confirm(start
      ? 'Start a REAL print on the Adventurer 4? Inspect the printer, model and temperatures first.'
      : 'Upload this file to the Adventurer 4? Firmware behavior is not guaranteed to be upload-only; inspect the printer.')) return
    setSending(true)
    try {
      const res = await fetch('/api/printer/jobs?name=' + encodeURIComponent(name) + '&start=' + start, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: bytes,
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || 'Upload failed (HTTP ' + res.status + ')')
      setNotice('Uploaded as ' + result.remote_name + (start ? ' · Print start requested' : ' · Upload only requested'))
    } catch (e) { setError(e.message) }
    finally { setSending(false) }
  }

  return <div className="app-shell">
    <header className="top-bar">
      <div className="brand"><span className="logo">F4</span><div><strong>Cura · Adventurer 4</strong><small>FFAdv4Manager — CuraEngine</small></div></div>
      <div className="top-actions">
        <span className="status"><i />{printer}</span>
        <button className="btn secondary" type="button" onClick={() => setManager(true)}>Printer manager</button>
      </div>
    </header>
    <main className="workspace">
      <div className="slicer-area" aria-label="Cura web slicer">
        <iframe ref={frame} title="CuraEngine web slicer for Adventurer 4" src={CURA_URL}
          allow="clipboard-read; clipboard-write" onLoad={() => setReady(false)} />
      </div>
    </main>
    <footer className="action-bar">
      <div className="job-state"><span className={ready ? 'signal active' : 'signal'} />
        <div><strong>{ready ? 'G-code ready' : 'Slice a model in Cura'}</strong><small>Artillery PLA Basic · 0.4 mm nozzle · one printer</small></div>
      </div>
      <div className="job-actions">
        <button className="btn secondary" disabled={!ready || sending} onClick={() => upload(false)}>{sending ? 'Sending…' : 'Upload only'}</button>
        <button className="btn primary" disabled={!ready || sending} onClick={() => upload(true)}>Send & print</button>
      </div>
    </footer>
    {(error || notice) && <div role={error ? 'alert' : 'status'} className={'toast ' + (error ? 'bad' : 'good')}>
      <span>{error || notice}</span><button aria-label="Dismiss" onClick={() => { setNotice(''); setError('') }}>×</button>
    </div>}
    {manager && <PrinterManager onClose={() => setManager(false)} />}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
