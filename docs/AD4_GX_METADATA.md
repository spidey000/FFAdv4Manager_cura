# Adventurer 4 GX thumbnail and print metadata

The AD4 CLI accepts plain `.gcode` (`.g`/`.gco`) and transparently converts
it into a FlashForge xgcode 1.0 `.gx` file at upload time. Already-converted GX
files pass through without double-wrapping.

## Format

The legacy GX container is a 58-byte header followed by an 80×60 24-bit BMP
(14,454 bytes), then the unchanged machine G-code from byte offset 14,512.

Header metadata: estimated print time (seconds), right/left filament lengths
(mm), single/dual-extruder type, layer height (micrometres), perimeter count,
print speed (mm/s), platform/nozzle temperatures (°C). The legacy touch screen
is chiefly known to use the **thumbnail and time estimate**. Other fields
inform metadata viewers; heater commands still come from executable G-code.

`ffadv4manager convert part.gcode --output part.gx` converts locally.
`ffadv4manager upload part.gcode` also converts before uploading.

## Homing final obligatorio (backend)

Todo archivo de impresión que pase por el backend (laminado Cura, subida web
G-code/GX y subida mediante CLI) garantiza que el último movimiento físico
sea el homing de **X/Y** de la Adventurer 4, después de retirar la plataforma
en Z según el cierre oficial de Cura:

```gcode
G162 Z F1800
G28 X Y
```

Los comandos de apagado de motores (`M18`/`M84`) o fin de programa
(`M2`/`M30`) se mantienen **después** del homing para que este no se
omita. Si el último movimiento ya era `G28 X Y` (o `G28`), no se
duplica. El homing completo de Z no se impone al finalizar: podría acercar
el cabezal a la pieza. La secuencia de la máquina hace primero `G162 Z`
para retirarla. La transformación modifica únicamente el segmento ejecutable
del GX; conserva cabecera y miniatura, además de los metadatos de tiempo y
filamento. No altera el archivo local de origen ni los trabajos almacenados
previamente en la impresora.

Las conversiones locales con `ffadv4manager convert` siguen siendo un
envoltorio fiel del G-code original; la modificación se aplica al preparar
un trabajo para imprimir y en el G-code generado por el servidor.

## G-code annotations

Put optional slicer-produced comments at the beginning of G-code:

```gcode
; estimated printing time (normal mode) = 1h 2m 3s
; filament used [mm] = 1234.50
; layer_height = 0.20
; wall_loops = 3
; print_speed = 45
; bed_temperature = 60
; nozzle_temperature = 205
; thumbnail begin 80x60 1234
; <base64-encoded PNG image, wrapped to multiple commented lines>
; thumbnail end
```

The numeric value following `thumbnail begin` must equal the actual Base64
payload length (1234 above is illustrative). Supported time formats include
`1h 2m 3s`, `HH:MM:SS`, numeric seconds and Cura-style `;TIME:<seconds>`.
Material usage is measured in millimetres; the optional `; filament used [m]`
form is also recognized. The converter composites transparent thumbnail pixels
onto black, rescales to 80×60 and emits a grayscale BMP as widely documented
for legacy FlashForge touchscreen firmware.

When no valid estimate is provided, the GX header holds **zero** to indicate
unknown rather than claiming a one-second print. The CLI does not try to
recalculate the entire print from raw G-code moves. ThreeSlicer supplies the
kernel's actual estimated time whenever available.

## Limitations and testing

Compatibility is based on community reverse engineering of xgcode 1.0 and
requires confirmation against a FlashPrint-generated Adventurer 4 GX and
your own printer firmware. A syntactically valid GX does not prove the
touchscreen displays it. Check thumbnails, estimated durations, and filament
usage on the printer **before** relying on those values. Never change nozzle
or bed heater commands just to match metadata comments.

Sources:
- https://github.com/slic3r/Slic3r/issues/4869
- https://github.com/HellEvro/FF_Gcode_to_GX
