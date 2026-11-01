# Printer integration

Start the integrated UI/API with `.venv/bin/ffadv4manager-cura` or
`.venv/bin/ffadv4manager slicer`. GitHub Pages remains a static editor preview.

The existing Printer manager now includes:

- Select a discovered printer, or add/edit a saved connection with TCP port,
  timeout and camera configuration. Save/reset persistent server/CLI defaults
  separately from the selected in-memory connection.
- Upload an external GX/G-code, inspect its metadata and SHA-256, convert G-code
  to a downloadable GX, or export the current server slice as GX.
- Tap a stored filename to request its M662 thumbnail. Stored-print confirmation
  requests the thumbnail too. Firmware/file names that do not support M662
  display an unavailable preview without preventing other file operations.
- Read the raw M661 listing, rename the physical printer and open the CLI guide.
- Start/stop a bounded one-hour status history and download JSONL. Browser alerts
  require the browser's notification permission and an open page. Linux desktop
  alerts use the existing CLI `notify` and require `notify-send` on the server.
- Wait for bed cooling or a specific machine state. The worker is owned by the
  server and stops after one hour; closing the browser does not cancel it.

All file/tool routes use the bridge's existing same-origin authentication.
Uploads, new print starts and connection changes are serialized. All control-port
traffic also shares a per-host/port reentrant lock across service-user processes
(status, file listings, previews, position, monitor and timelapse readers). Status
holds it across M119/M105/M27; upload/start holds it from fresh preflight through
M29, listing verification and M23/M24. Lock acquisition fails busy after two
seconds instead of opening a concurrent TCP session. Pause, resume and cancel
bypass server bookkeeping and video encoding, but cannot interrupt an active
control-port transaction; a busy response means no control command was sent.
Camera HTTP traffic remains independent.
Tool routes never accept
arbitrary server file paths or shell commands. Connection forms accept private
IPv4 printer addresses. Diagnostics remain available if the printer is offline.

Fan control remains on/off: the AD4 firmware references examined do not establish
variable physical speed control. The read-only live status view provides the
equivalent of CLI `watch`; CLI `camera open` is represented by the embedded camera
and does not open a browser on the Linux host. `--force` and `--no-convert` remain
terminal-only options.

## Incomplete state and failed transfers

`status --json` and `/api/printer/status` expose `connection_status` (`online`,
`partial` or `unavailable`), `status_available`, `ready_to_print` and per-command
`status_errors`. M27 answering while M119/M105 are empty is a partial response,
not proof of disconnection. Each status command uses a two-second read budget
(or the configured timeout if shorter). Service display consumers share a
one-second cache keyed by their pinned CLI connection; unavailable observations
replace previous READY and are cached too to avoid a retry storm. Source
association/download validation always reads fresh status before and after
obtaining G-code, so the cache cannot hide a change of current job.

Desktop offline notifications and monitor offline records still report total
communication loss. Partial responses or a busy control lock are unknown-state
observations, not disconnect alerts. Doctor reports unavailable/partial status
as a failed check even when the camera remains accessible.

Only explicit READY/IDLE permits upload/start by default. The CLI repeats this
check under the control lock; the display cache never authorizes a print.
`--force` remains a terminal-only override for a known busy state and cannot
bypass an unknown state. No write or print-start command is automatically retried.

A failed transfer/start reports its `stage` (`preflight`, `upload_and_verify` or
`print_start`) and `outcome`. `unknown` with `retry_safe: false` means bytes or a
start command may already have reached the printer: inspect the printer before
retrying. Structured command/transaction errors appear both in operations.jsonl
and the service journal. Different Unix users, containers with separate temp
filesystems, different host aliases and unrelated third-party printer clients
do not share this cooperative lock; use one service account and a consistent
printer address for managed workers.

## Validation

`python -m pytest -q tests/cli tests/server tests/integration tests/cura tests/ui`
includes real HTTP authorization checks and protocol/controller regressions.
`python tests/ui/printer_manager_browser.py` exercises the actual manager modules
against a simulated API at 390 and 1280 px. It sends no commands to hardware.

The **Verify native CuraEngine slicing** workflow compiles the pinned engine on
Ubuntu 24.04 and exercises the real browser → HTTP API → native G-code → GX →
deposited-layer parser flow. It intercepts printer requests and retains output
and logs as artifacts. After installing the app, native engine and Playwright,
the same check can be run locally with:

```sh
.venv/bin/python scripts/verify_native_slicing.py --output-dir /tmp/ad4-native-validation
```

The server accepts the complete resolved Cura catalog within a bounded 1024
settings per group and 512 KiB JSON envelope. Machine, temperature and value
validation also applies to settings exported by the browser.

Physical firmware behavior, real camera frames and printing still need a local
hardware check; the static Pages preview cannot verify them.

## Current print, live layers and camera

Open **Printer → Current file → View current print** (or **Live print** inside
the manager). This starts read-only status/M114 sampling and a second, independent
Three.js scene next to the camera. Both remain side by side on mobile. The initial
view looks from the bed's right wall (+X), with printer Z upright. Closing the
manager or pressing Stop viewing closes the camera and releases the renderer.
The existing editor model, slicing settings and exported G-code are not changed.

The parser extracts deposited layer heights from G-code/GX, supports absolute and
relative moves/extrusion, extrusion resets, FlashPrint A extrusion, and XY arcs.
Travel Z-hops do not create layers. The estimator requires separated stable M114
observations over at least 2.5 seconds, handles variable layer heights, avoids
advancing during PAUSED, and resets when the file/progress changes. Brief Z-hop
travels are filtered, but sustained Z-hop or parking within the model's Z range
can still overestimate the deposited layer. It cannot identify the exact
executed G-code line. The reported XYZ nozzle position is shown using a
high-contrast red downward-pointing cone whose tip marks the M114 coordinates. The camera stream
and position polling are not frame-synchronized. Timelapse by estimated layer can
use the exact uploaded G-code layer heights for automatic print sessions before
starting M24; if the uploaded file cannot be parsed, it explicitly falls back
to a uniform height, not the previous job's source.

Large toolpaths use disclosed rendering sampling, retaining the complete layer
height table. Non-planar jobs, more than one million lines/two million deposited
segments, and non-XY arcs return an explicit preview limitation rather than
inventing geometry. Source files are limited to 100 MB and retained in a bounded
20-entry/512 MiB server archive.

### File provenance and the AD4 download limitation

No G-code file-download command has been verified for the stock AD4 TCP protocol.
M661 lists filenames and M662 retrieves a thumbnail; neither downloads executable
G-code. References examined:

- https://github.com/Parallel-7/flashforge-api-docs/wiki/Adventurer-4-Series
- https://github.com/Parallel-7/flashforge-api-docs/wiki/TCP-Protocol

The viewer therefore identifies its source at all times:

1. **Retained server upload:** actual source bytes used for a successful transfer;
   not a printer readback, and not proof that another application has not later
   overwritten that remote filename.
2. **User association:** the user confirms the exact file for the current job.
   The server rechecks the current filename before accepting the association.
3. **Printer download:** optional, only when an administrator configures a
   separately verified read-only transport for this printer/firmware.

Without an available source, live XYZ and camera remain usable and the toolpath
states why it cannot be drawn. Fetch printer file is disabled when no verified
transport is configured. There is no use of an AD5M-only HTTP endpoint or a made-up
AD4 G-code download command.

The optional `AD4_JOB_DOWNLOAD_ARGV` environment variable is a JSON argv array for
an administrator-provided downloader, for example:

```json
["/opt/ad4/read-job", "--host", "{host}", "--file", "{remote_file}", "--output", "{output}"]
```

`{host}`, `{port}`, `{remote_file}` and `{output}` are substituted without a shell.
The supplied program must download that printer file to the temporary output
path. Execution is bounded to 60 seconds; output is checked as a print file and
the current printer filename is rechecked before use. This adapter is not a
working stock-AD4 downloader by itself. Its hardware transport must be validated
independently before configuring it.

`python tests/ui/live_job_browser.py` tests the actual bundled Three.js renderer,
side-by-side camera layout, provenance labels, cleanup, and editor isolation at
390 and 1280 px against a simulated printer API.


 
## Printer workspace unificado (interfaz 0.2.0)

La pestaña superior **Printer** es ahora el único punto de entrada al gestor
de la Adventurer 4. La opción anterior `App → Open printer manager` y el
diálogo modal separado se eliminan de la navegación.

El panel conserva las diez tarjetas de estado (siempre visibles, también
sin impresora) y monta **el controlador de impresora existente** bajo ellas,
sin duplicar lógica ni endpoints: controles de impresión y ventilador,
archivos almacenados, cámara, galería de timelapse, conexiones y diagnósticos,
y herramientas avanzadas del CLI. Las tarjetas enlazan mediante desplazamiento
a sus funciones correspondientes.

Diseño responsivo: tres columnas en escritorio ancho (a partir de 1100 px),
dos columnas intermedias y una columna para tarjetas de funciones en móvil.
Las tarjetas de resumen se mantienen en dos columnas cuando caben. Los
controles físicos no se activan sin conexión y la demo pública mantiene las
acciones deshabilitadas. La vista de cámara se cierra al abandonar Printer;
no se abre automáticamente ni se inicia ninguna impresión al entrar.

La verificación visual del diseño se obtiene de
`tests/ui/pages_browser_smoke.py`, que guarda capturas con Chromium a
320 px, 390 px y 1280 px en los artefactos de GitHub Actions. La prueba no
contacta directamente con una impresora ni usa credenciales del servidor
privado.
