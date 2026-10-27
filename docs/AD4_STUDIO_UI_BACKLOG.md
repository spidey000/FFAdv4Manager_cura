# AD4 Studio — Documento vivo de mejoras UX/UI

> **Versión:** 0.1 · **Fecha:** 27 de octubre de 2026 · **Estado:** lluvia de ideas y definición, **sin implementar cambios de interfaz**.
>
> **Repositorio:** [FFAdv4Manager_cura](https://github.com/spidey000/FFAdv4Manager_cura) · **Referencia técnica revisada:** \`main\` @ \`ea0e9cb\` (AD4 Studio v3).
>
> Este documento es la fuente de decisiones para futuras mejoras. Se actualizará con nuevas ideas, diseños, hallazgos y criterios de aceptación **antes de crear PR de implementación**.

## 1. Objetivo y reglas del proyecto

Queremos una app móvil de laminado y gestión de **FlashForge Adventurer 4** que siga el lenguaje visual de las capturas: negro/antracita, verde brillante, componentes redondeados, iconos coherentes, poco ruido y buen aprovechamiento del espacio.

### Restricciones inamovibles

1. **CuraEngine lamina exclusivamente en el servidor Linux**; nunca trasladar el laminado al navegador.
2. El visor real 3D, la carga de STL, los perfiles y la previsualización de G-code deben seguir conectados a MosaicSlicer. Evitar duplicar motores o dibujar un visor simulado.
3. **Adventurer 4 como única máquina**, perfil inicial **Artillery PLA Basic** y comprobación térmica en el backend (220 °C boquilla / 65 °C cama como límites ya implementados).
4. GitHub Pages es una **demo visual e interactiva**: visor STL, parámetros y controles locales visibles, pero sin afirmar que pueda laminar, subir, conectar cámara ni imprimir.
5. La gestión de impresora, vídeo MJPEG, timelapses MP4, perfiles y acciones físicas sigue usando el puente autenticado y las medidas de seguridad existentes.
6. Respetar accesibilidad táctil, teclado, estados de carga y compatibilidad móvil. **Ninguna función debe desaparecer por un rediseño puramente visual.**

## 2. Backlog confirmado por el usuario

| ID | Prioridad | Pantalla | Requisito | Estado |
| --- | --- | --- | --- | --- |
| **UI-01** | P0 | Global | Una sola biblioteca profesional para **todos los iconos**, coherente con la estética | **Acordado · pendiente** |
| **UI-02** | P0 | Navegación inferior | Eliminar **Orient** y unificar **todas** las transformaciones bajo **Transform** | **Acordado · pendiente** |
| **UI-03** | P0 | Acciones de modelo | Rediseñar los botones **Open Model / Remove Model / Demo STL** | **Acordado · pendiente** |
| **UI-04** | P0 | Visor 3D | Quitar los controles laterales duplicados de **mover/rotar/orientar** | **Acordado · pendiente** |
| **UI-05** | P0 | Cabecera | Rediseñar el selector/indicador de impresora superior derecho | **Acordado · pendiente** |
| **UI-06** | **P0 — bloqueo** | **Print** | Mostrar **todos los parámetros** aunque no exista conexión con el backend de laminado | **Acordado · fallo a investigar** |
| **UI-07** | Mantener | Cabecera superior | Mantener la navegación superior **Preview / Print / Filament / Printer / App** | **Acordado · sin rediseño estructural** |

### UI-01 · Paquete de iconos único

**Decisión de diseño propuesta:** **Lucide**, versión fijada en dependencias, utilizando el paquete oficial **\`lucide\`** para JavaScript y empaquetado local mediante el build, sin CDN en ejecución. Documentación: https://lucide.dev/guide/lucide

- Sustituir SVG hechos a mano, emojis, símbolos Unicode e iconos mezclados en las barras, menús, botones de acción, gestor de impresora y cuadros de ajustes.
- Conservar la identidad gráfica propia del **logotipo AD4 Studio**, si se considera un logo y no un botón de interfaz.
- Tamaños orientativos: **24 px** en navegación, **18–20 px** en acciones, **16–18 px** en elementos secundarios; trazo uniforme entre **1,75 y 2 px**; borde redondeado y colores definidos por tokens CSS.
- Las etiquetas tienen que aclarar siempre las acciones de riesgo; los iconos por sí solos no deben ser el único texto accesible.
- Definir un mapa único entre acción e icono; no dejar definiciones SVG duplicadas en \`ad4-v3.js\` y otras capas.
- **Criterio de aceptación:** el mismo estilo aparece en todas las cinco secciones y diálogos; no hay iconos visualmente heterogéneos, imágenes perdidas ni dependencia de red externa.

### UI-02 · Transformaciones reunidas en un solo lugar

**Estructura inferior solicitada:**

\`File  |  Camera  |  Transform  |  Slice\`

- Eliminar el botón **Orient** de la barra inferior.
- Pulsar **Transform** abre un único espacio de trabajo con pestañas o segmentos:
  - **Move / Position**: desplazamiento XYZ.
  - **Rotate / Orientation**: ángulos XYZ, giro rápido de 90° y herramientas de orientación.
  - **Scale**: tamaño uniforme/por eje y restablecimiento.
  - **Otras operaciones del visor que realmente estén soportadas**, p. ej. centrar o colocar sobre la cama.
- Trabajar sobre el modelo realmente seleccionado. Mostrar un mensaje claro si no hay selección.
- Evitar duplicidades de transformaciones con herramientas nativas ocultas; conservar sus conexiones con el editor y el estado de G-code pendiente de regeneración.
- **Criterio de aceptación:** no existe \`Orient\` en la barra, pero toda su capacidad queda accesible y funcional dentro de \`Transform\`.

### UI-03 · Botones de modelo con una jerarquía más estética

Actualmente **Open Model**, **Remove Model** y **Demo STL** están presentados como tarjetas parecidas. Deseamos un nuevo patrón:

- **Open model:** botón secundario destacado, icono \`folder-plus\`, texto completo y tacto cómodo.
- **Remove model:** botón discreto o icono con etiqueta, deshabilitado si no hay modelo seleccionado; confirmar borrados si procede.
- **Demo STL:** acción secundaria de menor peso, visible prioritariamente en Pages/demo.
- **Slice model:** **única acción primaria verde**, visualmente dominante cuando corresponde; su estado deshabilitado debe ser inequívoco.
- Preferencia: botones compactos con icono sobre/antes del texto, radios de 12–16 px, contorno tenue y espaciado homogéneo; evitar cuatro cajas grandes e idénticas.
- Sin scroll horizontal ni textos recortados a anchos móviles de 320–390 px.
- **Criterio de aceptación:** la barra diferencia acción primaria, secundaria y destructiva; conserva exactamente la funcionalidad existente.

### UI-04 · Limpieza de controles en el visor 3D

- Ocultar/eliminar las **superposiciones laterales de Move/Rotate/Orient** que duplican \`Transform\`.
- No quitar los controles internos de Three.js/MosaicSlicer responsables de **órbita, zoom, selección, gestos táctiles** y manipulación desde el nuevo panel.
- Recuperar el espacio útil del visor; el modelo y la cama deben permanecer centrados y sin botones que tapen la geometría.
- **Criterio de aceptación:** no se ve la botonera lateral, pero siguen funcionando arrastre, zoom, selección y las transformaciones inferiores.

### UI-05 · Estado de impresora superior derecho

El botón actual puede aparecer cortado como **“De…”** y con un gran desplegable. Propuesta:

- Una **píldora compacta** y armonizada con la cabecera: icono de impresora pequeño, punto de estado y texto breve que quepa.
- Estados diferenciados: **Demo**, **Online**, **Printing**, **Paused**, **Offline**, **Connecting** y **Error** según datos reales.
- En Pages: **Demo** con aspecto informativo; **no** mostrar indicador verde de máquina conectada.
- Separar la disponibilidad del **servidor de CuraEngine** de la **conectividad de la impresora**: son dos estados diferentes.
- Al pulsar, abrir el gestor/diagnóstico real cuando exista servidor; en demo mostrar por qué no hay impresora conectada.
- No depender solo del color; etiqueta visible o texto accesible.
- **Criterio de aceptación:** no hay texto truncado ni desbordamiento a 320 px; los estados son honestos y visualmente claros.

### UI-06 · Print debe presentar parámetros sin backend

**Problema declarado:** al abrir **Print**, no aparecen los ajustes. **Condición deseada:** los parámetros de Cura deben poder **consultarse y navegarse aun en GitHub Pages**, sin servidor disponible; idealmente, permitir editarlos como configuración local sin prometer laminado real.

**Hallazgo inicial al leer el código:** AD4 Studio abre la vista Print mediante \`activate("print")\` → \`ensureSheet()\`, que reutiliza \`#sidebar-container\`, \`#sidebar\` y \`#sections\`. Los filtros y la visibilidad se gestionan en \`overlays/mosaic/src/gui/ad4-settings.mjs\` (\`filterRows()\`). Esto crea varios puntos potenciales de fallo de **inicialización, visibilidad, CSS y pestaña activa**. **No hay evidencia suficiente para afirmar que el fallo se deba al CuraEngine del servidor.** De hecho, la prueba anterior de Chromium en Pages encontró parámetros visibles en Quality y Material.

**Definición propuesta:**

1. Cargar el **catálogo completo de parámetros y metadatos disponibles para Adventurer 4** desde el esquema/recursos incluidos en el frontend, **independiente de** \`/api/slice/engine\`. No depender de cargar un STL.
2. Mostrar de forma inmediata secciones accesibles: Layers & Perimeters, Infill, Skirt & Brim, Support, Speed, Material y Advanced, adecuándolas a las categorías actuales de Mosaic. Mantener siempre accesible **All / Expert / ver todos los parámetros nativos**.
3. **Modo demo:** mostrar valores reales del perfil local; permitir inspeccionar explicaciones, buscar y ajustar valores locales si es seguro, etiquetando claramente **“Cambios locales · Sin laminado disponible”**. No simular el resultado del slicing.
4. **Modo servidor:** utilizar **la misma vista y el mismo modelo de parámetros**; permitir enviar los ajustes efectivos al CuraEngine y obtener G-code real.
5. Resolver estados separados: parámetros cargando, parámetros disponibles, servidor desconectado, error de esquema, perfil corrupto. Nunca mostrar una sección vacía silenciosamente.
6. Garantizar la coexistencia de filtros personalizados y categorías completas; revisar \`[hidden]\`, \`aria-hidden\`, \`data-ad4-screen\`, capas \`z-index\`, scroll vertical y el viejo bottom-sheet.
7. Permitir restablecer valores, comparar con los defaults, guardar perfiles nombrados y conservar límites de temperatura, independientemente del motor.
8. Probar **Pages con la red de API bloqueada** y con/sin STL, tanto en móvil como escritorio.

**Criterio de aceptación principal:** al abrir Print en Pages, se muestran inmediatamente categorías con parámetros legibles, buscables y explicables, y el hecho de que no exista servidor afecta **solo al slicing**, nunca a la visualización del panel.

### UI-07 · Navegación superior

**Mantener** las cinco pestañas existentes \`Preview / Print / Filament / Printer / App\`; respetar colores, selección verde, títulos y jerarquía. Sólo sustituir los iconos por los de la familia común. Evitar cambios de posición o renombres no solicitados.

## 3. Ideas adicionales para seguir debatiendo (NO aprobadas todavía)

| ID | Idea | Beneficio | Prioridad sugerida |
| --- | --- | --- | --- |
| UI-08 | Secciones de Print plegables con **contadores de parámetros** y un breve resumen de su configuración | Menos desplazamiento y mayor claridad | P1 |
| UI-09 | Resumen flotante/colapsable: altura de capa, relleno, soporte, velocidad y temperaturas | Entender el perfil sin abrir diez menús | P1 |
| UI-10 | Separar el estado **perfil cambiado / valor por defecto** únicamente mediante reset activo; evitar indicadores redundantes | Consistencia | P1 |
| UI-11 | Filament con ficha dedicada Artillery PLA Basic, temperatures y flow; guardar variantes | No mezclar ajustes de proceso con material | P1 |
| UI-12 | Navegación gestual de **subpantallas** en \`Transform\`, pero sin activar accidentalmente gestos cuando se arrastra el STL | Ergonomía | P2 |
| UI-13 | Controles del visor: **Fit to model**, vista cenital e isométrica, sin superposición permanente | Manipulación más fácil | P2 |
| UI-14 | Previsualización de capas con slider grande, botones anterior/siguiente y código de color claro | Revisar laminados mejor en móvil | P1 |
| UI-15 | Tarjeta resumen antes de imprimir: nombre, temperaturas, duración, material, miniatura y confirmación | Evitar impresiones involuntarias | P1 |
| UI-16 | Pantalla de impresora con estados compactos, cámara, lista de archivos y timelapses bajo pestañas consistentes | Unificar experiencia | P2 |
| UI-17 | Modo demo seguro: cargar STL de prueba, personalizar perfil local, importarlo/exportarlo y reconocer qué funciona sin backend | Facilitar pruebas en Pages | P1 |
| UI-18 | Guía de tamaños y espaciados: objetivos táctiles de al menos ~44 px, sin scroll horizontal | Calidad móvil | P1 |
| UI-19 | Estados de error útiles: reconexión, servidor no disponible, cambios sin guardar, G-code caducado | Menor confusión | P1 |
| UI-20 | Revisar el coste de la UI: solo los iconos Lucide usados, sin cargar catálogo completo ni CDN | Rendimiento y robustez | P2 |

## 4. Incidencias técnicas a verificar antes de programar

- **BUG-01 · Print aparentemente vacío.** Priorizar reproducción en el Pages real. Investigar sincronización de inicialización de contenedores Mosaic, filtros, CSS de \`#sidebar-container\` y transición \`activate("print")\`.
- **BUG-02 · Barra inferior redundante.** Actualmente están \`Orient\` y \`Transform\` y se usan rutas distintas hacia el mismo panel. Consolidar estado y eventos.
- **BUG-03 · Iconografía dispersa.** \`overlays/mosaic/public/ad4-v3.js\` incluye un diccionario de geometrías SVG propio; también hay símbolos Unicode y controles nativos en otros overlays. Evitar carga y mantenimiento duplicados.
- **BUG-04 · Estado de impresora truncado.** El texto del chip en móvil puede perder información útil; comprobar estados largos y sin API.
- **BUG-05 · Estado de Slice.** La implementación actual de \`refreshState()\` usa la variable \`progress\` en la expresión del botón \`ad4-v3-run-slice\` **antes** de declarar \`const progress\` más abajo. Revisar y cubrir la ejecución periódica con modelo cargado; podría interrumpir las actualizaciones de estado.
- **BUG-06 · Imports de perfiles.** Verificar que la importación JSON valida completamente nombres, claves, rangos y límites Artillery PLA, y no conserve valores fuera de catálogo.
- **BUG-07 · Pruebas insuficientes de visibilidad.** Un DOM con IDs presentes no garantiza que el usuario vea parámetros. Probar visibilidad real, captura de pantalla, scroll, teclado virtual y ausencia de errores JS.

> Nota: esta lista procede de una revisión estática del código y de resultados de pruebas anteriores, no de una sesión actual de depuración en el móvil físico.

## 5. Principios y tokens visuales propuestos

| Elemento | Decisión propuesta |
| --- | --- |
| Fondo | Negro \`#0B0D0F\` |
| Tarjetas | Antracita \`#222628\` y bordes \`#32393B\` |
| Acción principal | Verde \`#2DEC79\` |
| Texto secundario | Gris suave \`#9DA9AB\` |
| Iconos | Lucide, contorno redondeado, grosor unificado; versionado y empaquetado localmente |
| Radios | 12 px controles, 16 px tarjetas, 18 px paneles mayores |
| Navegación | Superior: cinco secciones fijas; inferior: cuatro acciones \`File / Camera / Transform / Slice\` |
| Táctil | Control de ~44 px en interacciones frecuentes, foco visible y sin zonas de toque superpuestas |
| Feedback | Estado claro \`Demo / Offline / Online / Printing / Error\`, sin fingir éxito |
| Texto | Todo el producto en **inglés**; este documento de planificación en español |

## 6. Matriz de pruebas y condiciones para aprobar futuros PR

| Escenario | Qué debe pasar |
| --- | --- |
| Pages, móvil 320 / 360 / 390 / 430 px | Las cinco pestañas superiores caben, cuatro inferiores no se cortan, no hay scroll horizontal |
| Pages, sin servidor y sin STL | Print y Filament muestran perfiles y parámetros; herramientas de impresión siguen inhabilitadas |
| Pages, STL de demostración cargado | Vista 3D real, gesto de cámara y selección sin iconos duplicados |
| Pages, cualquier parámetro | Tooltip funciona, editado local/restablecer funcionan según modo; sin fingir slicing |
| Transform, STL seleccionado | Move/Rotate/Scale realmente modifican el modelo, con valores correctos |
| Transform, sin selección | Explicación visible; nada cambia por error |
| Vista Slice sin G-code | No aparece vista de capas ficticia |
| Servidor, después de Slice | Aparece G-code real, vista de capas y acciones de envío/impresión separadas |
| Impresora offline | Estado de cabecera correcto y acceso al diagnóstico |
| Temperaturas inseguras | Backend rechaza el G-code/GX aunque se omita la UI |
| Cámara / timelapse | Las funcionalidades existentes se conservan y usan únicamente el proxy autenticado |
| Accesibilidad | Iconos etiquetados, estados indicados por texto, foco visible, reducción de movimiento |

**Automatización obligatoria prevista:** Playwright contra una build estática de Pages (API ausente) y contra una sesión con API simulada/controlada; tests de unidad para lógica de perfiles y navegación; comprobación visual responsive; pruebas de compilación e2e; no fusionar si fallan.

## 7. Propuesta de fases cuando aprobemos el documento

1. **PR A — Corrección crítica de Print**. Desacoplar catálogo de ajustes del backend, arreglar visibilidad real en Pages y añadir tests offline.
2. **PR B — Sistema de iconos y cabecera**. Iconos Lucide globales, chips de estado, estilos compartidos.
3. **PR C — Navegación y Transform**. Barra inferior con cuatro iconos, Move/Rotate/Scale unificados y eliminación de superposiciones laterales.
4. **PR D — Botones y pulido responsive**. Acciones de modelo, estados vacíos, jerarquía de botones y accesibilidad.
5. **PR E — Auditoría de pantallas**. Print, Filament, App, capas y Printer; pruebas de regresión móvil/escritorio.

**Ninguna de estas fases ha sido autorizada para implementación por este documento.** Se trata de un orden sugerido, que podremos modificar al cerrar los criterios visuales.

## 8. Registro de decisiones

| Fecha | Decisión | Estado |
| --- | --- | --- |
| 2026-10-27 | Mantener el diseño actual de la navegación superior Preview / Print / Filament / Printer / App | Acordada |
| 2026-10-27 | Iconografía homogénea procedente de un paquete profesional | Acordada; Lucide propuesto |
| 2026-10-27 | Unificar orientación y movimiento dentro de Transform | Acordada |
| 2026-10-27 | Sustituir los botones de acciones de modelo por otros más estéticos | Acordada, pendiente de decidir variante |
| 2026-10-27 | Retirar controles duplicados laterales del visor | Acordada |
| 2026-10-27 | Rediseñar chip de estado de impresora | Acordada |
| 2026-10-27 | Mostrar todos los parámetros de impresión en Pages sin backend | Acordada |
| Próxima revisión | Validar estilo exacto de botones y formato de chip de estado | Abierta |
| Próxima revisión | Decidir las nuevas ideas UI-08 a UI-20 | Abierta |

## 9. Cómo continuaremos este documento

Cada petición nueva puede añadirse como \`UI-21\`, \`UI-22\`, etc., con descripción, motivo, boceto si hace falta, prioridad y criterio de aceptación. El estado de cada entrada seguirá este ciclo:

\`Idea → Definida → Aprobada → En PR → Probada → Fusionada\`.

**Próximo paso sugerido:** cerrar el estilo definitivo de los botones de modelo y del indicador de impresora, y reproducir el fallo de Print sin tocar todavía el diseño de las demás pantallas.
