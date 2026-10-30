# AD4 Studio — matriz de regresiones de interfaz

La UI viene de **MosaicSlicer fijado como submódulo** y de los overlays propios en `overlays/mosaic/`. `frontend/` es un producto generado; nunca modificarlo para arreglar un fallo.

## Entornos y pruebas

- **Páginas públicas:** demo estática con modelo 3D real, catálogo Cura y controles de edición. Sin CuraEngine nativo ni conexión a impresora.
- **Aplicación Linux privada:** API same-origin, CuraEngine nativo en servidor, gestor FlashForge y opciones de envío a hardware.
- **Playwright/Chromium:** pruebas de viewport 320 × 568, 390 × 844 y 1280 × 800. Son **emulaciones**, no pruebas en Android/iOS físico.
- **Smoke:** `tests/ui/pages_browser_smoke.py`, `tests/ui/printer_manager_browser.py`, `tests/ui/live_job_browser.py`.
- **CI nativa:** `.github/workflows/native-engine.yml` compila CuraEngine y comprueba browser → API → motor → G-code → GX → parser de capas, con comandos a impresora interceptados.

## Estados que no pueden romperse

| ID | Interacción | Afirmación / evidencia |
| --- | --- | --- |
| R01 | Inicio de UI | Desaparece Loading, carga cubo STL 20 mm como geometría real, consola sin errores |
| R02 | Importación | STL adicional se importa y aparece en el registro de modelos Three.js |
| R03 | Modelos | Seleccionar, ocultar sin quitar del export STL, volver a mostrar y eliminar conserva estados correctos |
| R04 | Eliminación final | Al borrar el último modelo se limpia la escena y los botones dependientes |
| R05 | Navegación | Preview / Print / Filament / Printer / App llevan a vistas diferenciadas; dock File / Models / Slice coherente |
| R06 | Preview y Slice | Se ve el visor 3D; Pages mantiene el slicing deshabilitado con explicación clara |
| R07 | Ajustes Print | Panel con scroll propio, sin botones fijos tapando parámetros ni desbordamiento a 320/390/1280 |
| R08 | Catálogo Cura | All + Quality / Strength / Speed / Support / Material; contenido nativo completo, sin catálogo duplicado ni contador intrusivo |
| R09 | Accordions | Grupos colapsados inicialmente; grupos vacíos ocultos, valores accesibles al abrir |
| R10 | Filtros | All / Basic / Advanced / Expert y búsqueda global accesibles, filtros sin scroll horizontal |
| R11 | Filament | Muestra opciones Material reales; no es una pestaña muerta |
| R12 | Presets | Material y proceso recuperados; Guardar/Reset con estados acordes a los cambios reales |
| R13 | Ayuda Cura | Icono Lucide de interrogación y nombre abren SettingsGuide empaquetado localmente |
| R14 | Modal ayuda | Imágenes y artículos cargan; scroll propio, X, Escape y backdrop cierran limpiamente |
| R15 | Transformaciones | Move/Rotate/Scale actúan sobre malla real, snapping configurable, rotación por pasos y escala proporcional |
| R16 | Sliced Preview | Capas reales del G-code generado en Linux; navegación y selección de rango compatibles con los datos depositados |
| R17 | Gestión offline | Todas las tarjetas de Printer están presentes y explican indisponibilidad cuando no hay servidor |
| R18 | Cámara y timelapse | Sus controles responden en gestor con API simulada; stream y temporizadores se liberan al cerrar |
| R19 | Impresión actual | Visor independiente de modelo + cámara lado a lado; M114/capa estimada y procedencia del G-code visibles |
| R20 | Acciones críticas | Upload-only, Print, Pause/Resume/Cancel y captura no se activan en Pages; fail closed, confirmaciones y estados en gestor |
| R21 | Accesibilidad | Etiquetas en botones/inputs/rulers, keyboard dismiss, foco y estados disabled comprensibles |
| R22 | Móvil | Sin overflow horizontal ni pie cortado, áreas táctiles alcanzables, scroll de Print y App |
| R23 | End-to-end nativo | Prueba independiente con CuraEngine real y transporte de impresora simulado; **no prueba firmware físico** |
| R24 | Publicación Pages | El HTML, recursos, subruta y capturas del README responden; no hay worker de CuraEngine en el frontend |

## Capturas reales para el README

Las imágenes de documentación **no son ilustraciones generadas ni capturas de un mockup**. Las produce el mismo test de Chromium sobre el bundle de Pages tras cargar el cubo STL real.

En la compilación de `.github/workflows/pages.yml`, la variable `AD4_DOC_SCREENSHOT_DIR` solicita:

| Fichero publicado en `/screenshots/` | Estado capturado |
| --- | --- |
| `ad4-studio-desktop.png` | Visor 3D en 1280 × 800 |
| `ad4-studio-mobile.png` | Visor 3D en 390 × 844 |
| `ad4-studio-settings-mobile.png` | Print / ajustes Cura en 390 × 844 |

Las capturas se guardan en `frontend/dist/screenshots/` solo durante el pipeline, **no se versiona `frontend/`**. El workflow comprueba que son PNG no vacíos y que están disponibles tras desplegar Pages. Las capturas adicionales de pruebas funcionales se almacenan como artefactos durante 14 días y no sustituyen a las del README.

## Comprobación local

~~~bash
AD4_SKIP_ENGINE_BUILD=1 bash scripts/install.sh
.venv/bin/python -m pip install pytest 'playwright==1.56.0'
.venv/bin/python -m pytest -q tests/cli tests/server tests/integration tests/cura tests/ui
~~~

Para reproducir el smoke de Pages, sigue las etapas de `.github/workflows/ci.yml`: copiar `frontend/dist/` bajo `/tmp/ad4-pages/FFAdv4Manager_cura/`, añadir el flag estático, levantar `http.server` y ejecutar `tests/ui/pages_browser_smoke.py` contra ese origen. Las pruebas de gestor utilizan una API simulada; **no ejecutar pruebas automáticas contra hardware real**.

## Pendientes de validación física

Antes de declarar el proyecto listo para producción, comprobar en dispositivos Android/iOS reales la respuesta táctil, teclados, safe area, accesibilidad y orientación; y en el servidor protegido validar con la Adventurer 4 real cámara, transferencia de GX, estados, interruptores físicos, pausa, inicio y timelapse. Ningún test estático acredita un comando de descarga de G-code desde la impresora: consultar [integración](PRINTER_INTEGRATION.md).
