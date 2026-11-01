# API web integrada — AD4 Studio

La interfaz se sirve desde **`server/cura_bridge.py`** y reutiliza las rutas del puente **`server/ad4_bridge.py`**, además de `server/manager_tools.py` y `server/current_job.py`. El servidor escucha por defecto en **127.0.0.1:8765**; todas las llamadas del navegador son relativas al mismo origen. Consulta el [README](../README.md) para instalación y la [guía de seguridad](DEPLOY_CLOUDFLARE.md) antes de habilitar acceso remoto.

> La API no es una puerta de acceso pública a la impresora. El modo remoto requiere sesiones válidas de Cloudflare Access; el modo local solo es seguro mientras permanezca limitado a loopback. La demo de GitHub Pages **no proporciona** estas rutas ni ejecuta acciones físicas.

## Slicing — solo en el servidor

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/slice/engine` | Disponibilidad del CuraEngine nativo compatible; 503 cuando no está configurado |
| POST | `/api/slice` | STL y ajustes resueltos en el framing `application/vnd.ffadv4-slice`; responde G-code, tiempo, filament y `engine: server` |
| POST | `/api/slice/cancel` | Solicita la cancelación de una ejecución de slicing activa |

El servidor valida tamaño, tipos, settings, geometría de máquina y límites. El catálogo completo de Cura se admite hasta **1024 ajustes por grupo** y 512 KiB de ajustes JSON. No enviar peticiones arbitrarias de G-code ni usar CuraEngine WASM en el navegador.

### Logs y trazas de slicing e impresión

El servidor guarda eventos JSON Lines en `~/.local/share/ffadv4manager-cura/logs/operations.jsonl` (o en `$AD4_DATA_DIR/logs/operations.jsonl`; si no se define, respeta `$XDG_DATA_HOME`). Conserva hasta cinco archivos de 5 MiB y restringe los permisos del directorio/archivo al usuario del servicio. La misma secuencia aparece en la salida estándar del proceso.

Cada petición de API recibe un `trace_id` en el log y en la cabecera de respuesta `X-Trace-ID`. La interfaz conserva el ID de un slice y lo envía con la posterior subida, de modo que se pueden correlacionar laminado, envío y arranque. Los eventos registran inicio y resultado, duración, código de salida y respuesta resumida de los comandos del gestor, así como tamaño y SHA-256 del modelo y del G-code enviado. No se guardan el STL ni el contenido G-code. Los textos de respuesta se limitan y las URLs se ocultan; no se registran tokens ni credenciales.

Ejemplos de eventos: `slice.started/completed/failed`, `printer.upload.received/confirmed`, `printer.print.start_acknowledged`, `printer.command.completed` y `http.request.completed`. La aceptación del comando de inicio se registra como acuse del comando; no prueba por sí sola que el movimiento físico haya comenzado.

### Consulta desde App

El panel **App → Server activity** usa dos rutas autenticadas de solo lectura:

| Método | Ruta | Datos |
| --- | --- | --- |
| GET | `/api/observability/summary?hours=24` | Actividad por hora, slices, subidas, errores, latencia p50/p95, último estado conocido de la impresora, memoria del proceso, carga del sistema, espacio libre y tamaño de logs |
| GET | `/api/observability/events?hours=24&level=error&event=slice&trace_id=...&q=...&offset=0&limit=100` | Eventos filtrados y paginados, con severidad calculada |

`hours` se limita a 1–720, `limit` a 1–200 y `offset` a 0–100 000. La consulta lee solo los cinco ficheros rotativos del servidor y como máximo 100 000 líneas; no admite rutas arbitrarias. Las lecturas del propio panel no se registran para evitar realimentación. La exportación de la interfaz descarga la página filtrada que se está mostrando.

## Estado y conectividad de impresora

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/printer/session` | Estado y selección de conexión actuales |
| GET | `/api/printer/status` | Estado observado y temperaturas (`status --json`) |
| GET | `/api/printer/discover` | Descubrimiento UDP (solo impresoras de red privada) |
| GET | `/api/printer/files` | Listado de archivos; `?details=1` agrega metadatos disponibles |
| GET | `/api/printer/profiles` | Perfiles de conexión |
| GET | `/api/printer/diagnostics?kind=doctor|info|position` | Diagnóstico, identidad y coordenadas M114 |
| POST | `/api/printer/selection` | Selección de un perfil existente o una impresora descubierta |
| POST | `/api/printer/profiles` | Añade un perfil |
| POST | `/api/printer/profiles/delete` | Elimina un perfil |

## Archivos y acciones

| Método | Ruta | Función |
| --- | --- | --- |
| POST | `/api/printer/jobs?name=...&start=false|true` | Subida del slice desde la UI (texto G-code) |
| POST | `/api/printer/upload?name=...&start=false|true` | Subida binaria de G-code o GX (límite 100 MiB) |
| POST | `/api/printer/actions` | Lista de acciones permitidas: `print`, `pause`, `resume`, `cancel`, `fan_on`, `fan_off` |
| GET | `/api/printer/tools/preview?file=...` | Miniatura BMP obtenida mediante M662, no el contenido completo del G-code |
| GET | `/api/printer/tools/raw` | Respuesta textual de listado M661 |
| POST | `/api/printer/tools/inspect?name=...` | Inspección local de archivo recibido |
| POST | `/api/printer/tools/convert?name=...` | Conversión validada de G-code recibido a GX descargable |
| POST | `/api/printer/tools/rename` | Cambia nombre de impresora (requiere confirmación de firmware) |

`start=true` autoriza inicio físico; `start=false` no debe mandar M23/M24. Una subida exitosa confirma listado de nombre en la impresora, **no** una comparación byte a byte con su almacenamiento ni la seguridad del movimiento real. La validación térmica se repite en servidor, al margen de la interfaz. Los errores y los trabajos activos se gestionan de forma conservadora.

Para asociar captura automática a un inicio de impresión pueden utilizarse `timelapse=true` y `timelapse_mode=interval|layer` en las rutas de subida con `start=true`; `actions` también permite esas opciones al arrancar un archivo almacenado. Un fallo posterior al inicio físico se señala con `timelapse_error` en vez de fingir que no se inició la impresión.

## Confirmación previa y estimación de vídeo

Antes de «Enviar» o «Enviar e imprimir» se muestra un resumen de los
datos realmente disponibles: nombre, impresora, material, temperaturas,
altura y número de capas, velocidad, soportes, adhesión, filamento,
tiempo estimado y tamaño del G-code. Se consulta el estado de la
impresora y la sesión de grabación cada 5 segundos mientras el cuadro
permanece abierto. Si la impresora no está disponible, está ocupada
o el archivo laminado deja de estar vigente, se bloquea el envío.
La validación térmica del servidor sigue siendo obligatoria.

En un inicio de impresión puede activarse la grabación automática
por altura Z estimada mediante M114 o por intervalo temporal. La interfaz
ofrece intervalo fotográfico (5, 10, 15, 30 o 60 segundos) y FPS del
MP4 (5, 10, 15, 20, 24 o 30), y actualiza instantáneamente el cálculo:

- Modo por capas: fotogramas ≈ capas identificadas en el G-code.
- Modo por tiempo: fotogramas ≈ techo(tiempo estimado / intervalo).
- Duración estimada del vídeo = fotogramas estimados / FPS.

**No es una duración garantizada:** pausas, duración real distinta,
fotogramas perdidos o saltos en las medidas M114 pueden alterarla.
Si faltan capas o tiempo fiable, se indica «no disponible» y no se
inventan resultados. La opción «Solo enviar» no inicia una captura;
puede activarse cuando se lance el archivo almacenado.

Las rutas de subida admiten con `start=true` los parámetros opcionales
`timelapse=true|false`, `timelapse_mode=layer|interval`,
`timelapse_interval` (entero de 2 a 300 segundos) y
`timelapse_fps` (entero de 1 a 60). El cuerpo JSON de
`POST /api/printer/actions` con `action=print` admite las mismas claves.
La captura manual de `POST /api/printer/timelapse` admite `fps` e `interval`.
Cada sesión guarda las opciones elegidas y el servidor utiliza
sus FPS al codificar o recuperar el MP4; las sesiones antiguas sin dato
de FPS usan 10 por compatibilidad.

## Cámara, timelapses y seguimiento

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/printer/camera` | JPEG de la cámara |
| GET | `/api/printer/camera/live` | Stream MJPEG con control de ciclo de vida |
| GET / POST | `/api/printer/timelapse` | Estado; iniciar o detener la captura |
| GET | `/api/printer/timelapses` | Galería de sesiones persistentes |
| GET | `/api/printer/timelapses/frame?id=...&index=...` | Fotograma concreto |
| GET | `/api/printer/timelapses/video?id=...` | Reproducción del MP4 |
| GET | `/api/printer/timelapses/download?id=...` | Descarga del MP4 |
| POST | `/api/printer/timelapses/delete` | Elimina una sesión finalizada |
| GET | `/api/printer/current-job` | Estado del trabajo actual, origen de G-code, M114 y capa estimada |
| GET | `/api/printer/current-job/toolpath` | Geometría por capas cuando hay fuente fiable |
| POST | `/api/printer/current-job/associate` | Asociar explícitamente archivo de usuario al nombre remoto activo |
| POST | `/api/printer/current-job/fetch` | Descarga solo mediante transporte **opcional verificado**, si está configurado |

**El stock Adventurer 4 no tiene un transporte de descarga de G-code acreditado en este proyecto.** M661 y M662 no son comandos de descarga del fichero. El servidor puede retener bytes originales de un upload previo y etiquetar su procedencia, o permitir asociar un archivo local. El adaptador de descarga externa se configura con `AD4_JOB_DOWNLOAD_ARGV`, pero no proporciona un descargador AD4 por sí solo. La capa se estima con alturas depositadas y M114; no representa la instrucción exacta en ejecución.

## Configuración, monitorización y avisos

| Método | Ruta | Función |
| --- | --- | --- |
| GET / POST | `/api/printer/tools/config` | Leer, guardar o restablecer defaults persistentes de conexión |
| GET / POST | `/api/printer/tools/profile` | Consultar, crear o editar un perfil |
| GET | `/api/printer/tools/telemetry` | Estado e historial reciente de monitor |
| POST | `/api/printer/tools/monitor` | Iniciar/parar monitorización acotada |
| GET | `/api/printer/tools/log` | Descarga JSONL del monitor |
| POST | `/api/printer/tools/wait` | Esperar estado o temperatura de cama con límite de tiempo |
| POST | `/api/printer/notifications` | Iniciar/parar notificaciones Linux vía `notify-send` |

Los nombres de las acciones son allowlists, no ejecución de comandos arbitrarios. La monitorización/espera está limitada a una hora y se descartan valores de configuración no admitidos. Los controles urgentes de pausa/reanudar/cancelar se atienden sin mantener bloqueada la operación completa de transferencia o codificación.

## Seguridad e integración

- Todas las rutas `/api/` requieren pasar los controles de sesión/origen; las escrituras hacen comprobaciones adicionales. En modo remoto se verifica JWT/issuer/audience y demás requisitos de Access.
- No admitir rutas arbitrarias del sistema de archivos, proxies genéricos, URLs de cámara abiertas al usuario, texto libre que se convierta en shell o comandos FlashForge arbitrarios.
- Limitar tamaños de archivos y respuestas; proteger los workers persistentes; cerrar conexiones de cámara y renderer cuando se abandona la vista.
- Probar con `tests/server`, `tests/integration`, `tests/ui/printer_manager_browser.py` y `tests/ui/live_job_browser.py` usando transporte simulado. La impresión física no está cubierta por esas pruebas.

**Referencia de implementación:** para los formatos exactos de solicitudes/respuestas y códigos de error consulta `server/cura_bridge.py`, `server/ad4_bridge.py`, `server/manager_tools.py` y `server/current_job.py`: sus contratos y validaciones prevalecen sobre ejemplos incompletos de esta guía.


### Runtime build versions

`GET /api/version` (authenticated, read-only, no printer connection required)
returns the **running backend** build, for example:

```json
{"version":"0.2.0","revision":"abc12345"}
```

`version` is the Python package version from `pyproject.toml` / installed
package metadata; `revision` is the running backend Git commit prefix, or
`null` if the deployed source is not a Git checkout. In packaged deployments,
`AD4_BACKEND_REVISION` may explicitly supply the build commit.

The UI has a separately maintained `VERSION_UI` in
`overlays/mosaic/public/ad4-v3.js`. `scripts/prepare_mosaic.py` embeds the
frontend checkout revision at **build time**. The bottom-right viewer overlay
shows both running versions, with `API offline` on connection failures and
`API —` on the static GitHub Pages preview. A new commit changes the build
revision automatically; bump the UI semantic version deliberately on UI releases.
