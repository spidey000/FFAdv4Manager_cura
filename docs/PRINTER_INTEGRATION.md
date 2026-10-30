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
