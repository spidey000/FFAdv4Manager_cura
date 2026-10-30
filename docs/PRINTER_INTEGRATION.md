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
Uploads and connection changes are serialized. Tool routes never accept
arbitrary server file paths or shell commands. Connection forms accept private
IPv4 printer addresses. Diagnostics remain available if the printer is offline.

Fan control remains on/off: the AD4 firmware references examined do not establish
variable physical speed control. The read-only live status view provides the
equivalent of CLI `watch`; CLI `camera open` is represented by the embedded camera
and does not open a browser on the Linux host. `--force` and `--no-convert` remain
terminal-only options.

## Validation

`python -m pytest -q tests/cli tests/server tests/integration tests/cura tests/ui`
includes real HTTP authorization checks and protocol/controller regressions.
`python tests/ui/printer_manager_browser.py` exercises the actual manager modules
against a simulated API at 390 and 1280 px. It sends no commands to hardware.

The native CuraEngine build and physical firmware behavior still need a local
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
observations, handles variable layer heights, and resets when the file/progress
changes. It cannot identify the exact executed G-code line. The camera stream
and position polling are not frame-synchronized. Timelapse by estimated layer can
use the same source layer heights for automatic print sessions when available.

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
