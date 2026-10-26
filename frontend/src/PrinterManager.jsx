import { useEffect, useMemo, useRef, useState } from 'react'
import './printer-manager.css'

const ENDPOINT = '/api/printer'
const ACTIVE = new Set(['BUILDING', 'BUILDING_FROM_SD', 'PRINTING'])
const PAUSED = new Set(['PAUSED'])
async function api(path, options) {
  let response
  try { response = await fetch(ENDPOINT + path, { cache: 'no-store', ...options }) }
  catch { throw new Error('No se puede contactar con el puente local') }
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || 'El puente local no está disponible (HTTP ' + response.status + ')')
  return result
}
function post(path, data) {
  return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
}
function Icon({ name, size = 19 }) {
  const paths = {
    printer: <><rect x="5" y="2" width="14" height="7" rx="2"/><rect x="3" y="9" width="18" height="11" rx="2"/><path d="M7 16h10v6H7z"/></>,
    back: <path d="m15 18-6-6 6-6M9 12h12"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M19 15a8 8 0 0 1-14 2l-1-5"/></>,
    thermometer: <><path d="M10 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z"/><path d="M13 8v10"/></>,
    file: <><path d="M6 2h8l5 5v15H6zM14 2v6h5M9 13h7M9 17h7"/></>,
    play: <path d="m7 4 14 8-14 8z"/>,
    pause: <><path d="M7 4v16M17 4v16"/></>,
    stop: <rect x="5" y="5" width="14" height="14" rx="1"/>,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v14H3z"/><circle cx="12" cy="14" r="4"/></>,
    wifi: <><path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M9 17a5 5 0 0 1 6 0"/><circle cx="12" cy="21" r="1"/></>,
    fan: <><circle cx="12" cy="12" r="2"/><path d="M12 10C8 2 3 4 5 8c1 2 3 3 5 4M14 12c8-4 6-9 2-7-2 1-3 3-4 5M12 14c4 8 9 6 7 2-1-2-3-3-5-4M10 12c-8 4-6 9-2 7 2-1 3-3 4-5"/></>,
    pulse: <path d="M2 12h4l3-7 5 14 3-7h5"/>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
    network: <><circle cx="12" cy="4" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 6v5M12 11l-7 6M12 11l7 6"/></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.printer}</svg>
}
function Card({ icon, title, right, children }) {
  return <section className="pm-card"><header className="pm-card-head"><span className="pm-card-heading"><span className="pm-icon"><Icon name={icon}/></span><h3>{title}</h3></span>{right}</header>{children}</section>
}
const temp = v => v == null ? '—' : String(v) + '°C'
const text = v => v == null || v === '' ? '—' : String(v)
const statusLabel = s => ({ READY: 'Lista', PAUSED: 'Pausada', BUILDING: 'Imprimiendo', BUILDING_FROM_SD: 'Imprimiendo', PRINTING: 'Imprimiendo' })[s] || s || 'Offline'
const fileName = p => String(p).split('/').pop()
const encode = name => encodeURIComponent(name)
const pageSize = 10
const printDuration = s => Number.isFinite(s) && s > 0
  ? String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0')
  : '—'
const displayDate = value => {
  if (!value) return '—'
  const stamp = new Date(value)
  return Number.isNaN(stamp.getTime()) ? '—' : stamp.toLocaleDateString('es-ES')
}
const normalizeFile = f => typeof f === 'string'
  ? { path: f, name: fileName(f) }
  : { ...f, name: f.name || fileName(f.path) }


export default function PrinterManager({ onClose, timelapseEnabled = false }) {
  const [session, setSession] = useState(null)
  const [state, setState] = useState(null)
  const [bridge, setBridge] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [devices, setDevices] = useState([])
  const [files, setFiles] = useState([])
  const [fileSort, setFileSort] = useState('name')
  const [fileDescending, setFileDescending] = useState(false)
  const [filePage, setFilePage] = useState(1)
  const [profiles, setProfiles] = useState([])
  const [profileName, setProfileName] = useState('')
  const [profileHost, setProfileHost] = useState('')
  const [diagnostic, setDiagnostic] = useState(null)
  const [camera, setCamera] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [live, setLive] = useState(false)
  const [timelapses, setTimelapses] = useState([])
  const [selectedTimelapse, setSelectedTimelapse] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [timelapse, setTimelapse] = useState(null)
  const [captureMode, setCaptureMode] = useState('interval')
  const cameraUrl = useRef('')
  const fileInput = useRef(null)

  async function refreshStatus() {
    try { setState(await api('/status')) }
    catch (e) { setState(null); setError(e.message) }
  }
  async function refreshAll() {
    try {
      const s = await api('/session')
      setSession(s); setBridge(true); setError('')
      const results = await Promise.allSettled([api('/status'), api('/files?details=1'), api('/profiles'), api('/timelapse'), api('/timelapses')])
      if (results[0].status === 'fulfilled') setState(results[0].value)
      else { setState(null); setError(results[0].reason.message) }
      setFiles(results[1].status === 'fulfilled' ? results[1].value.map(normalizeFile) : [])
      setFilePage(1)
      setProfiles(results[2].status === 'fulfilled' ? results[2].value : [])
      if (results[3].status === 'fulfilled') setTimelapse(results[3].value)
      if (results[4].status === 'fulfilled') setTimelapses(results[4].value)
    } catch {
      setBridge(false); setLive(false); setState(null); setFiles([]); setProfiles([]); setTimelapses([])
      setError('Este sitio no tiene conexión con el puente local. GitHub Pages solo permite laminar; inicia npm run local en el equipo conectado a la impresora.')
    }
  }
  useEffect(() => {
    refreshAll()
    const timer = setInterval(() => { refreshStatus(); api('/session').then(setSession).catch(() => {}); api('/timelapse').then(setTimelapse).catch(() => {}); api('/timelapses').then(setTimelapses).catch(() => {}) }, 8000)
    const key = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => { clearInterval(timer); document.removeEventListener('keydown', key); if (cameraUrl.current) URL.revokeObjectURL(cameraUrl.current) }
  }, [])
  const sortedFiles = useMemo(() => [...files].sort((a, b) => {
    const key = fileSort === 'duration' ? 'estimated_seconds' : fileSort === 'date' ? 'uploaded_at' : 'name'
    const left = a[key], right = b[key]
    if (left == null && right == null) return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    if (left == null) return 1
    if (right == null) return -1
    const order = key === 'estimated_seconds' ? left - right : String(left).localeCompare(String(right), 'es', { sensitivity: 'base' })
    return (fileDescending ? -order : order) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  }), [files, fileSort, fileDescending])
  const pages = Math.max(1, Math.ceil(sortedFiles.length / pageSize))
  const currentPage = Math.min(filePage, pages)
  const visibleFiles = sortedFiles.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const previewTimelapse = timelapses.find(item => item.id === selectedTimelapse)
  const running = Boolean(state && ACTIVE.has(state.machine_status))
  const paused = Boolean(state && PAUSED.has(state.machine_status))
  const available = bridge && Boolean(state)
  const rawProgress = state?.progress_percent ?? (state?.sd_total > 0 ? state.sd_current / state.sd_total * 100 : null)
  const progress = typeof rawProgress === 'number' && Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, Math.round(rawProgress))) : null

  async function run(key, work, after) {
    if (busy) return
    setBusy(key); setNotice(''); setError('')
    try { const result = await work(); setNotice('Operación completada: ' + key); if (after) await after(result); return result }
    catch (e) { setError(e.message) }
    finally { setBusy('') }
  }
  function action(key, payload, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return
    run(key, () => post('/actions', payload), refreshAll)
  }
  async function discover() {
    await run('Discover printers', () => api('/discover'), data => setDevices(data))
  }
  async function capture() {
    setLive(false)
    await run('Captura', async () => {
      const response = await fetch(ENDPOINT + '/camera', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudo obtener la fotografía')
      const blob = await response.blob()
      return URL.createObjectURL(blob)
    }, url => {
      if (cameraUrl.current) URL.revokeObjectURL(cameraUrl.current)
      cameraUrl.current = url; setCamera(url); setCameraError('')
    })
  }
  async function deleteTimelapse(id) {
    if (!window.confirm('Permanently delete this timelapse and captured frames?')) return
    await run('Delete timelapse', () => post('/timelapses/delete', { id }), async () => {
      if (selectedTimelapse === id) setSelectedTimelapse('')
      setTimelapses(await api('/timelapses'))
    })
  }
  async function changeTimelapse(action) {
    await run(action === 'start' ? 'Start timelapse' : 'Stop timelapse',
      () => post('/timelapse', { action, mode: captureMode }), async data => {
        setTimelapse(data); setTimelapses(await api('/timelapses'))
      })
  }
  async function sendFile(start) {
    if (!selectedFile) { fileInput.current?.click(); return }
    if (start && !window.confirm('¿Enviar e iniciar la impresión de ' + selectedFile.name + '? Comprueba físicamente la impresora.')) return
    await run(start ? 'Subir e imprimir' : 'Subir archivo', async () => {
      const response = await fetch(ENDPOINT + '/upload?start=' + start + '&timelapse=' + (start && timelapseEnabled) + '&name=' + encode(selectedFile.name), {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: selectedFile,
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Error al enviar el archivo')
      return result
    }, () => { setSelectedFile(null); if (fileInput.current) fileInput.current.value = ''; return refreshAll() })
  }
  const profileSelection = session?.profile || null
  return <div className="pm-overlay" role="dialog" aria-modal="true" aria-labelledby="pm-title">
    <div className="pm-window">
      <header className="pm-header"><button className="pm-back" type="button" onClick={onClose} aria-label="Volver al laminador"><Icon name="back"/></button>
        <div className="pm-title"><span>CONTROL LOCAL</span><h2 id="pm-title">Gestión de impresora</h2><small>FlashForge Adventurer 4 · FFAD4Manager</small></div>
        <span className={'pm-connection ' + (available ? 'online' : '')}><span className="pm-dot"/>{available ? statusLabel(state.machine_status) : 'Offline'}</span>
      </header>
      <div className="pm-body">
        {(error || notice) && <div role={error ? 'alert' : 'status'} className={'pm-message ' + (error ? 'is-error' : '')}>{error || notice}</div>}
        <div className="pm-grid">
          <Card icon="printer" title="Estado de impresora" right={<button className="pm-icon-button" disabled={!bridge || !!busy} title="Actualizar estado" onClick={refreshAll}><Icon name="refresh"/></button>}>
            <p className="pm-subtle">Adventurer 4 · {session?.profile ? 'Perfil: ' + session.profile : session?.host ? 'IP: ' + session.host : 'Conexión configurada en el CLI'}</p>
            <div className="pm-metrics"><div><span>Boquilla</span><strong>{temp(state?.nozzle_current)}</strong><small>Objetivo {temp(state?.nozzle_target)}</small></div>
              <div><span>Cama</span><strong>{temp(state?.bed_current)}</strong><small>Objetivo {temp(state?.bed_target)}</small></div>
              <div><span>Estado</span><strong>{statusLabel(state?.machine_status)}</strong><small>{text(state?.move_mode)}</small></div></div>
          </Card>
          <Card icon="file" title="Trabajo actual">
            <p className="pm-job-name">{state?.current_file || 'No hay un trabajo identificado'}</p>
            <div className="pm-job-progress"><div className="pm-progress"><span style={{ width: (progress ?? 0) + '%' }}/></div><strong>{progress == null ? '—' : progress + '%'}</strong></div>
            <p className="pm-subtle">Capas: {text(state?.layer_current)} / {text(state?.layer_total)} · Progreso informado por la impresora</p>
            <p className="pm-subtle">{timelapseEnabled ? 'Timelapse automático activado para la siguiente impresión.' : 'Timelapse automático desactivado en la barra del laminador.'}</p>
            <div className="pm-actions three">
              <button type="button" disabled={!running || !!busy} onClick={() => action('Pausar', { action: 'pause' })}><Icon name="pause"/>Pausar</button>
              <button type="button" disabled={!paused || !!busy} onClick={() => action('Reanudar', { action: 'resume' })}><Icon name="play"/>Reanudar</button>
              <button type="button" className="pm-danger" disabled={!(running || paused) || !!busy} onClick={() => action('Cancelar', { action: 'cancel' }, '¿Cancelar la impresión actual? Esta acción puede descartar el trabajo.') }><Icon name="stop"/>Cancelar</button>
            </div>
          </Card>
          <Card icon="network" title="Descubrir impresoras" right={<button className="pm-small" disabled={!bridge || !!busy} onClick={discover}><Icon name="refresh"/> Buscar</button>}>
            <p className="pm-subtle">Detecta dispositivos anunciados en la red del equipo que ejecuta el puente.</p>
            {devices.length ? <div className="pm-list">{devices.map(d => <div className="pm-list-item" key={d.ip}><div><strong>{d.name || 'Printer'}</strong><small>{d.ip} · puerto {d.port}</small></div>
              <button type="button" className="pm-small" disabled={!!busy || !bridge || d.port !== 8899 || (session?.host === d.ip && !profileSelection)} onClick={() => run('Connect', () => post('/selection', { host: d.ip }), async () => { setCamera(''); await refreshAll() })}>{session?.host === d.ip && !profileSelection ? 'Conectada' : 'Connect'}</button></div>)}</div> : <p className="pm-empty">Pulsa Buscar para localizar impresoras.</p>}
          </Card>
          <Card icon="file" title="Printer files" right={<button type="button" className="pm-small" disabled={!bridge || !!busy} onClick={() => run('Refresh files', () => api('/files?details=1'), data => { setFiles(data.map(normalizeFile)); setFilePage(1) })}>Actualizar</button>}>
            <div className="pm-file-toolbar">
              <label htmlFor="pm-file-sort">Ordenar</label>
              <select id="pm-file-sort" value={fileSort} onChange={e => { setFileSort(e.target.value); setFilePage(1) }}>
                <option value="name">Nombre</option><option value="duration">Duración</option><option value="date">Upload date</option>
              </select>
              <button className="pm-sort-direction" type="button" aria-label={fileDescending ? 'Orden ascendente' : 'Orden descendente'} title={fileDescending ? 'Orden descendente' : 'Orden ascendente'} onClick={() => { setFileDescending(v => !v); setFilePage(1) }}>{fileDescending ? '↓' : '↑'}</button>
              <span className="pm-file-total">{files.length} archivos</span>
            </div>
            {files.length ? <>
              <div className="pm-list pm-file-list">{visibleFiles.map(f => <div className="pm-list-item" key={f.path}><div className="pm-file-info"><strong title={f.name}>{f.name}</strong>
                <small>Duration {printDuration(f.estimated_seconds)} · {f.hotend ?? '—'}° / {f.bed ?? '—'}°{f.uploaded_at ? ' · ' + displayDate(f.uploaded_at) : ''}</small></div>
                <button className="pm-small" type="button" disabled={!available || running || paused || !!busy} onClick={() => action('Print file', { action: 'print', file: f.path, timelapse: timelapseEnabled }, '¿Imprimir el archivo almacenado ' + f.name + '? Comprueba el material y la impresora.') }><Icon name="play"/> Imprimir</button></div>)}</div>
              <nav className="pm-pagination" aria-label="Páginas de archivos">
                <span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, files.length)} de {files.length}</span>
                <div><button type="button" disabled={currentPage <= 1} onClick={() => setFilePage(currentPage - 1)} aria-label="Page anterior">‹</button>
                <span>Page {currentPage} / {pages}</span>
                <button type="button" disabled={currentPage >= pages} onClick={() => setFilePage(currentPage + 1)} aria-label="Page siguiente">›</button></div>
              </nav>
              <p className="pm-subtle">Duration y temperaturas del archivo, no valores actuales. «—» indica metadatos no disponibles.</p>
            </> : <p className="pm-empty">{bridge ? 'No se han encontrado archivos en la impresora.' : 'Requiere el puente local.'}</p>}
          </Card>
          <Card icon="camera" title="Camera" right={<div className="pm-inline"><button className="pm-small" type="button" disabled={!bridge || !!busy} onClick={capture}><Icon name="camera"/> Capturar</button>
            <button className={'pm-small ' + (live ? 'pm-live-button' : '')} type="button" disabled={!bridge} onClick={() => { setCameraError(''); setLive(v => !v) }}>{live ? 'Stop video' : 'En directo'}</button></div>}>
            <div className="pm-camera-frame">
              {live ? <><img className="pm-camera-image" src={ENDPOINT + '/camera/live'} alt="Vídeo MJPEG en directo de la cámara Adventurer 4" onError={() => { setCameraError('No se puede abrir el vídeo MJPEG. Comprueba la cámara y el puente.'); setLive(false) }}/><span className="pm-live-indicator">● EN DIRECTO</span></> :
                camera ? <img className="pm-camera-image" src={camera} alt="Última captura de la cámara"/> :
                <div className="pm-camera-empty"><Icon name="camera" size={32}/><span>Pulsa «En directo» o «Capturar»</span></div>}
            </div>
            {cameraError && <p className="pm-subtle" role="alert">{cameraError}</p>}
            <p className="pm-subtle">{live ? 'Streaming MJPEG mediante el puente protegido.' : 'El vídeo solo se conecta cuando lo activas.'}</p>
          </Card>
          <Card icon="fan" title="Ventilador de capa">
            <p className="pm-subtle">El CLI permite únicamente encender al 100% o apagar el ventilador de capa. No controla el ventilador de la carcasa ni informa de su velocidad.</p>
            <div className="pm-actions"><button disabled={!available || !!busy} onClick={() => action('Encender ventilador', { action: 'fan_on' })}>Encender</button>
              <button disabled={!available || !!busy} onClick={() => action('Apagar ventilador', { action: 'fan_off' })}>Apagar</button></div>
          </Card>
          <Card icon="pulse" title="Diagnósticos">
            <div className="pm-actions pm-wrap">{[['doctor','Comprobar'],['info','Firmware / identidad'],['position','Posición']].map(([kind,label]) =>
              <button key={kind} disabled={!bridge || !!busy} onClick={() => run(label, () => api('/diagnostics?kind=' + kind), setDiagnostic)}>{label}</button>)}</div>
            {diagnostic && <pre className="pm-diagnostic">{typeof diagnostic.output === 'string' ? diagnostic.output : JSON.stringify(diagnostic.output, null, 2)}</pre>}
          </Card>
          <Card icon="camera" title="Timelapses">
            <p className="pm-subtle">Vídeos H.264 MP4 generados en el servidor. El modo automático graba toda la impresión y finaliza al terminar el trabajo, aunque cierres la web.</p>
            <p className="pm-subtle" role="status">{timelapse?.encoding ? 'Codificando vídeo MP4…' : timelapse?.running ? '● Grabando' : 'Grabación detenida'}
              {timelapse?.running ? ' · ' + (timelapse.frames ?? 0) + ' fotogramas capturados' : ''}
              {timelapse?.error ? ' · Error: ' + timelapse.error : ''}</p>
            <div className="pm-actions">
              <label className="pm-capture-mode">Capture <select aria-label="Manual timelapse capture mode" value={captureMode}
                onChange={e => setCaptureMode(e.target.value)}>
                <option value="interval">Every 10 seconds</option>
                <option value="layer">Z change · experimental</option>
              </select></label>
              <button disabled={!bridge || !!busy || timelapse?.running || timelapse?.encoding} onClick={() => changeTimelapse('start')}>Record manually</button>
              <button disabled={!bridge || !!busy || !timelapse?.running} onClick={() => changeTimelapse('stop')}>Stop and save MP4</button>
            </div>
            <div className="pm-timelapse-heading"><strong>Saved videos ({timelapses.filter(item => item.video_ready).length})</strong>
              <button type="button" className="pm-small" disabled={!bridge} onClick={() => api('/timelapses').then(setTimelapses).catch(e => setError(e.message))}><Icon name="refresh"/> Actualizar</button>
            </div>
            {timelapses.length ? <div className="pm-list pm-timelapse-list">{timelapses.map(item => <div className="pm-list-item" key={item.id}>
              <div><strong>{displayDate(item.created_at)} · {item.id.slice(9, 11)}:{item.id.slice(11, 13)}</strong>
                <small>{item.video_ready ? 'MP4 · ' + (item.size_bytes / 1048576).toFixed(1) + ' MB' : item.encoding ? 'Comprimiendo vídeo…' : item.running ? 'Grabando…' : item.error ? 'Error: ' + item.error : 'Pendiente de MP4'}
                  {' · '}{item.frames} fotogramas</small></div>
              <div className="pm-inline">
                <button type="button" className="pm-small" disabled={!item.video_ready} onClick={() => setSelectedTimelapse(selectedTimelapse === item.id ? '' : item.id)}>
                  {selectedTimelapse === item.id ? 'Cerrar' : 'View'}</button>
                <a className={'pm-small pm-download ' + (!item.video_ready ? 'pm-disabled' : '')}
                  href={item.video_ready ? ENDPOINT + '/timelapses/download?id=' + encode(item.id) : undefined}
                  aria-disabled={!item.video_ready} download={'timelapse-' + item.id + '.mp4'}>MP4</a>
                <button type="button" className="pm-small pm-danger" disabled={!!busy || item.running || item.encoding}
                  onClick={() => deleteTimelapse(item.id)} aria-label={'Eliminar timelapse del ' + displayDate(item.created_at)}>×</button>
              </div>
            </div>)}</div> : <p className="pm-empty">Aún no hay grabaciones.</p>}
            {previewTimelapse?.video_ready && <video key={previewTimelapse.id} className="pm-timelapse-video" controls playsInline preload="metadata"
              src={ENDPOINT + '/timelapses/video?id=' + encode(previewTimelapse.id)}
              aria-label={'Timelapse en MP4 del ' + displayDate(previewTimelapse.created_at)}/>}
          </Card>
          <Card icon="bell" title="Notificaciones del CLI">
            <p className="pm-subtle">Avisos de escritorio en el ordenador Linux del puente (notify-send): pausa, desconexión, impresión y listo. No son notificaciones push al móvil.</p>
            <div className="pm-actions"><button disabled={!bridge || !!busy || session?.notifying} onClick={() => run('Activar avisos', () => post('/notifications', { action: 'start' }), refreshAll)}>Activar</button>
              <button disabled={!bridge || !!busy || !session?.notifying} onClick={() => run('Desactivar avisos', () => post('/notifications', { action: 'stop' }), refreshAll)}>Detener</button></div>
          </Card>
          <Card icon="layers" title="Connection profiles">
            <p className="pm-subtle">Perfiles de host/IP del CLI. No modifican los presets de calidad del laminador.</p>
            {profiles.length ? <div className="pm-list">{profiles.map(p => <div key={p} className="pm-list-item"><div><strong>{p}</strong><small>{profileSelection === p ? 'Activo' : 'Perfil del CLI'}</small></div>
              <div className="pm-inline"><button className="pm-small" disabled={!!busy || profileSelection === p} onClick={() => run('Select profile', () => post('/selection', { profile: p }), async () => { setCamera(''); await refreshAll() })}>Usar</button>
                <button className="pm-small pm-danger" disabled={!!busy} onClick={() => { if (window.confirm('¿Eliminar el perfil de conexión ' + p + '?')) run('Eliminar perfil', () => post('/profiles/delete', { name: p }), refreshAll) }}>×</button></div></div>)}</div> : <p className="pm-empty">No hay perfiles guardados.</p>}
            <div className="pm-inputs"><input maxLength={64} aria-label="Nombre del perfil" placeholder="Nombre del perfil" value={profileName} onChange={e => setProfileName(e.target.value)}/><input inputMode="decimal" aria-label="IP local de la impresora" placeholder="IP local (192.168.x.x)" value={profileHost} onChange={e => setProfileHost(e.target.value)}/></div>
            <button className="pm-small" disabled={!bridge || !!busy || !profileName.trim() || !profileHost.trim()} onClick={() => run('Save profile', () => post('/profiles', { name: profileName, host: profileHost }), async () => { setProfileName(''); setProfileHost(''); await refreshAll() })}>+ Guardar perfil</button>
          </Card>
          <Card icon="upload" title="Upload G-code or GX">
            <p className="pm-subtle">Elige un archivo de hasta 100 MB. El CLI convierte G-code a GX cuando corresponde.</p>
            <input ref={fileInput} className="pm-hidden-input" type="file" accept=".gx,.gcode,.gco,.g" onChange={e => setSelectedFile(e.target.files?.[0] || null)}/>
            <button className="pm-pick" disabled={!bridge || !!busy} onClick={() => fileInput.current?.click()}>{selectedFile?.name || 'Seleccionar archivo…'}</button>
            <div className="pm-actions"><button disabled={!available || !selectedFile || !!busy} onClick={() => sendFile(false)}><Icon name="upload"/> Upload only</button>
              <button className="pm-primary" disabled={!available || !selectedFile || !!busy} onClick={() => sendFile(true)}><Icon name="play"/> Subir e imprimir</button></div>
            <p className="pm-subtle">Supervisa la impresora: el modo «solo subir» evita solicitar M23/M24, pero el firmware puede tener efectos no documentados.</p>
          </Card>
        </div>
      </div>
    </div>
  </div>
}
