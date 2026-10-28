# AD4 Studio — Documento vivo de mejoras UX/UI

> **Versión:** 0.2 · **Fecha:** 27 de octubre de 2026 · **Estado:** catálogo de componentes y requisitos confirmados, **sin implementar cambios de interfaz**.
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
| **UI-08** | P1 | Print | **Accordion Group**, **Accordion Trigger/Panel** y categorías plegables de ajustes | **Aprobado · pendiente** |
| **UI-14** | P1 | Slice | **Toolpath Preview** real y **Layer Range Selector** con dos reglas | **Aprobado · pendiente** |
| **UI-21** | P0 | Transform | **Ruler Picker** tipo regla desplazable basado en `wusb/slide-ruler`, **sin slider inferior** | **Aprobado · pendiente** |
| **UI-22** | P0 | Transform / Move | Desplazamiento X/Y/Z en mm con **Snap 5 mm** opcional | **Aprobado · pendiente** |
| **UI-23** | P0 | Transform / Rotate | Rotación X/Y/Z con **Snap 5°** opcional y botones de giro **−45° / +45°** | **Aprobado · pendiente** |
| **UI-24** | P0 | Transform / Scale | **Resize Locked** proporcional activo por defecto; desbloqueo por eje; snap opcional | **Aprobado · pendiente** |
| **UI-25** | P1 | Transform | **Segmented Control**, **Draggable Bottom Sheet** y **Drag Handle** | **Aprobado · pendiente** |
| **UI-26** | P1 | File / Slice | **Action Tiles** y **Contextual Action Toolbar** según pantalla | **Aprobado · pendiente** |
| **UI-27** | P1 | Visor | **3D Viewport / Build Plate Grid / Axis Helper / Selection Brackets** coherentes | **Aprobado · pendiente** |
| **UI-28** | P1 | Ajustes | **Dropdown Select / Inline Edit / Tooltip / Sticky Footer / Reset** | **Aprobado · pendiente** |
| **UI-29** | P1 | Slice | Acciones independientes **Export / Send Only / Send & Print** con estados reales | **Aprobado · pendiente** |
| **UI-30** | P1 | Global | **Modal Dialog / Toast / Snackbar / Empty State / Loading State** | **Aprobado · pendiente** |

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
  - **Move / Position**: desplazamiento XYZ en mm, con `Snap 5 mm` opcional.
  - **Rotate / Orientation**: ángulos XYZ, `Snap 5°` opcional, **giros relativos ±45° por eje**, giro 90° y herramientas de orientación.
  - **Scale / Resize**: dimensiones XYZ con **Resize Locked proporcional** por defecto, desbloqueo, snap opcional y restablecimiento.
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


## 2.1. Componentes identificados en las cinco capturas y especificación nueva (aprobado)

Los términos en inglés deben utilizarse para definir tickets/componentes de implementación. Son patrones UX/UI y **no obligan a adoptar React, recrear el visor 3D ni trasladar CuraEngine al navegador**.

| Imagen | Nombre técnico de los elementos | Comportamiento que implementaremos |
| --- | --- | --- |
| **1 — Rotate** | `Top Icon Tab Bar`, `Active Pill Indicator`, `3D Viewport`, `Build Plate Grid`, `Selection Brackets`, `Axis Rotation Controls`, `Ruler Picker`, `Center Indicator`, `Inline Numeric Editor`, `Primary Apply Button`, `Back Navigation Button` | Reglas X/Y/Z, valor editable y marcadores coloreados sin slider auxiliar; Apply/Undo integrados con el modelo real |
| **2 — Model / File** | `3D Model Mesh`, `Axis Helper`, `Action Tiles / Shortcut Cards`, `Horizontal Contextual Action Toolbar`, `Bottom Navigation Bar` | File muestra Open/Remove/Demo y perfiles si están soportados; mantener barra de navegación compacta |
| **3 — Slice** | `Color-coded Toolpath Preview`, `Layer Preview Action`, `Contextual Action Toolbar`, `Export Action`, `Share Sheet Trigger`, `Upload Action`, `Upload-and-Start Action` | Tras slicing **real**: Layers, Export, Send Only y Send & Print. Share opcional si se soporta |
| **4 — Layers** | `Cross-section / Toolpath Renderer`, `Layer Visibility Clipping`, `Lower Bound Ruler Picker`, `Upper Bound Ruler Picker`, `Dual-Ended Range Selector` | Ver únicamente capas A–B del G-code real. Dos reglas sincronizadas, **nunca un slider adicional debajo** |
| **5 — Print** | `Dropdown Select`, `Accordion Group`, `Accordion Item`, `Accordion Header/Trigger`, `Disclosure Chevron`, `Accordion Panel`, `Leading Icon`, `Sticky Footer Action Bar`, `Primary Save Action`, `Reset Defaults Action` | Parámetros agrupados y plegables, selección de perfiles/material y barra de guardar/restablecer fija, sin esperar al backend |

**Patrones transversales confirmados:** `Segmented Control` para Move/Rotate/Scale, `Draggable/Collapsible Bottom Sheet` con `Drag Handle`, `Tooltip/Popover` al tocar la etiqueta de cada parámetro, `Modal Dialog` para confirmaciones, `Toast/Snackbar` para resultados, `Loading/Error/Empty States` y `Sticky Primary Action`.

**No copiar literalmente:** impresora Kingroon KP3S, selector multimpresora, ajustes `Multiple Extruders`, botón inferior `Orientation`, controles laterales redundantes, una pantalla de ajustes que tape permanentemente el STL, previsualizaciones de capas simuladas en GitHub Pages ni segundos sliders debajo de reglas.

### UI-21 — Biblioteca seleccionada para Ruler Picker

**Elección para web: [wusb/slide-ruler](https://github.com/wusb/slide-ruler)** (JavaScript nativo, sin frameworks, MIT; **334 estrellas en GitHub verificadas el 2026-10-27**). Documentación y [demo del autor](https://wusb.github.io/slide-ruler/). Su interfaz configurable ofrece `minValue`, `maxValue`, `currentValue`, `precision`, `divide`, marcas de escala, desplazamiento con inercia y callback de valor.

**Comparación y criterio de popularidad:** [daybrush/ruler](https://github.com/daybrush/ruler) tiene aproximadamente **365 estrellas** pero es un renderizador de reglas y guías, **no un selector móvil de valores completo**. [adcentury/react-mobile-picker](https://github.com/adcentury/react-mobile-picker) es un picker tipo rueda React, distinto del control solicitado. Paquetes React Native, Android y Flutter no son directamente reutilizables en la UI web. Seleccionamos `wusb/slide-ruler` por popularidad *dentro de las alternativas comparables de selector tipo regla*, adecuación visual y compatibilidad con JavaScript sin React; no se afirma que sea el repositorio de «ruler» más estrellado de todo GitHub.

**Advertencia técnica:** la actividad pública del paquete es antigua (2023). Antes de implementar, auditar licencia, versión, bugs abiertos, API, seguridad, compatibilidad móvil y carga local; fijar versión e incluir un adaptador propio y mantenible (o fork versionado si fuera necesario), **sin CDN ni framework adicional**. La elección es de referencia funcional y visual, no una integración ya realizada.

**Diseño exigido:**
- Una sola **regla horizontal desplazable** por valor. Las marcas y números avanzan bajo una **línea/aguja central fija**; número grande encima como `X = 0.00 mm`, `Z = -135.00°` o `Scale X = 125%` e icono **pencil** para edición numérica exacta.
- Colores de eje X rojo, Y verde, Z azul; etiquetas visibles, unidades explícitas y contraste sobre fondo antracita.
- **Prohibido añadir debajo un `input type=range`, slider convencional u otra barra de desplazamiento.** La propia regla es el control táctil.
- Soportar swipe/arrastre con inercia moderada, snapping al terminar el gesto, accesibilidad por teclado y lector, entrada numérica directa, enter/escape, negativos cuando corresponda y límites válidos.
- API interna propuesta (no es la API literal de la biblioteca): `RulerValuePicker({axis, value, min, max, unit, fineStep, snapEnabled, snapStep, onPreview, onCommit, onEdit})`. La lógica del modelo vive en Mosaic, **no en el componente visual**.
- Mantener valor interno preciso y formatear sólo para visualización; evitar redondeo acumulativo. Cambiar el toggle `Snap` no debe modificar por sí solo un valor existente. Invalidar previsualización G-code anterior **sólo al confirmar** una transformación.

### UI-22 — Transform → Move: Snap 5 mm opcional

- Tres `RulerValuePicker` independientes X, Y, Z; valores de **posición en mm**, colores de ejes y edición numérica.
- **Toggle `Snap 5 mm`** visible que afecta a los tres ejes. ON: al mover mediante la regla, snap a posiciones cuantizadas de **5 mm** y acciones de ±5 mm cuando estén disponibles. OFF: ajuste fino y entrada exacta; sin cuantización forzada.
- La rejilla de snap se interpreta **en coordenadas de posición del modelo**, no mediante acumulaciones de redondeos. Los negativos y el origen del volumen se tratan de manera consistente.
- Mantener `Center on Bed`, `Place on Bed / Drop to Bed` y `Reset Position` únicamente si los soporta el editor real; diferenciar centrar XY y colocar Z=0.
- Límites de cama y volumen de Adventurer 4, estado fuera de volumen, Undo/Reset y precisión. El toggle no mueve el modelo hasta la siguiente manipulación.

### UI-23 — Transform → Rotate: Snap 5° y botones ±45°

- Tres reglas X/Y/Z expresadas en **grados** y editables tocando el valor/lápiz.
- **Toggle `Snap 5°`** opcional e independiente de los accesos rápidos. Con snap ON: reglas en múltiplos de 5°; OFF: precisión fina y edición libre.
- Acciones `−45°` y `+45°` **en cada eje**: **rotación relativa**, no fijar el ángulo absoluto a ±45°. Dos pulsaciones de +45° acumulan +90°, y −45° invierte una pulsación, sin modificar la escala.
- Mantener `Reset Rotation`, giros de 90° y orientación sobre cara si existen; preservar orden Euler/quaternion y evitar saltos al actualizar la escena. Aviso si la orientación excede volumen.
- El paso rápido de 45° y Snap 5° coexisten: el primero actúa incluso si el toggle está OFF. La vista y el estado de transformación deben permanecer sincronizados.

### UI-24 — Transform → Scale / Resize: proporciones bloqueadas

- Mostrar **dimensiones actuales X/Y/Z en mm** y escala en **%**, con `100%` como referencia del modelo original.
- **`Resize Locked / Keep Proportions` activo por defecto** (icono `lock`); no deshabilitar la entrada de X, Y o Z. Con ON, cambiar un solo eje aplica **el mismo factor multiplicativo a los tres**, conservando la proporción X:Y:Z dentro de la precisión numérica.
- Con lock OFF, cada eje se puede escalar independientemente. Si el usuario vuelve a activar el lock, **no deshacer automáticamente las diferencias ya aplicadas**: tomar las proporciones actuales como base de futuras modificaciones.
- Para mantener la opción de **Snap de 5 en 5** también en Size: ofrecer `Snap 5%` en modo porcentaje y `Snap 5 mm` en modo dimensiones; sólo cuantizar el **eje que se está editando**, calculando los otros mediante proporción exacta cuando lock está ON. Con Snap OFF, ajuste fino.
- `Reset Scale` restaura escala base sin borrar rotaciones ni traslaciones. Impedir factores 0/negativos si la geometría no los soporta y validar límites físicos.
- Criterio: un cambio uniforme al 125% preserva proporciones; con lock OFF un cambio de X no altera Y/Z; el nuevo bloqueo no deforma un modelo ya alterado.

### UI-25 — Navegación, Bottom Sheet y gestos

- **Mantener** `Preview / Print / Filament / Printer / App` en la barra superior (**Top Icon Tabs**) y `File / Camera / Transform / Slice` en la inferior (**Bottom Navigation**). `Active Pill Indicator` verde para opción activa. La ilustración anterior de Settings en la barra inferior **no sustituye esta decisión**.
- En Transform, cambiar entre `Move / Rotate / Scale` mediante **Segmented Control** interno. Presentar controles en un **Draggable Bottom Sheet** con `Drag Handle` y estados compacto / medio / expandido; usar el patrón también para parámetros donde tenga sentido.
- Visor 3D visible cuando el panel está colapsado. Arrastrar la regla **no desplaza el Bottom Sheet ni orbita el STL**; arrastrar STL no abre el sheet. Resolver `touch-action`, scroll interior, z-index, safe areas, teclado móvil y focus.
- Botón **Apply** explícito cuando la operación tiene confirmación diferida; si se usa preview en directo, separar `onPreview` de `onCommit` y ofrecer Cancel/Undo. Al confirmar, G-code laminado previamente pasa a `stale` hasta recalcular.

### UI-26 — Action Tiles y Contextual Action Toolbar

- **`Action Tile`**: tarjeta compacta, icono de la familia Lucide y etiqueta clara. **File:** Open Model, Remove Model, Demo STL y perfiles donde haya soporte; Remove disabled cuando no hay modelo y modal si la operación es destructiva.
- **`Contextual Action Toolbar`**: conjunto que cambia al activar File o Slice; **Slice:** Layers / Export to File / Send Only / Send & Print tras G-code **real**. Diferenciar primaria verde, secundaria neutra y destructiva.
- `Share` sólo si existe capacidad del navegador/plataforma y alternativa honesta. `Calibrate` sólo si está implementado. No botones que simulen éxito en Pages.
- Implementar tarjeta genérica y catálogo declarativo de acciones, no duplicar SVG, llamadas API ni lógica por sección. Sin scroll horizontal ni recortes a 320 px.

### UI-27 y UI-14 — Visor, capas y Toolpath Preview

- `3D Viewport` de Mosaic/Three.js real, `Build Plate Grid` con cama de Adventurer 4, `Axis Helper` de coordenadas, `Selection Brackets` no intrusivos sobre el modelo seleccionado. Eliminar `Transform Gizmo` lateral duplicado sin perder selección, órbita ni zoom táctil.
- **`Color-coded Toolpath Preview`** exclusivamente desde G-code de CuraEngine; colores/leyenda para walls, infill, top/bottom, support y travel cuando esos tipos estén efectivamente identificados. `Cross-section` real y `Layer Visibility Clipping` para ocultar capas no deseadas.
- `Layer Range Selector`: **dos reglas** (`Lower Bound` y `Upper Bound`), cada una con centro fijo y valor editable, rango `Layers A–B`; `1 ≤ A ≤ B ≤ N`; actualización sincronizada con datos G-code y gestos sin slider inferior.
- Botones opcionales anterior/siguiente capa; sin G-code en Pages mostrar estado vacío informativo, **nunca toolpaths ficticios**.

### UI-08 y UI-28 — Print Settings, Accordion, Popover, Sticky Footer

- **`Accordion Group`** con `Accordion Item`, icono izquierdo `Leading Icon`, `Accordion Header/Trigger`, chevron y `Accordion Panel` desplegable; preservar scroll, apertura y valores cuando se navega.
- Categorías conforme a los parámetros reales de CuraEngine: Layers & Perimeters, Infill, Skirt & Brim, Support Material, Speed, Advanced, Output Options, Notes **sólo si están soportadas**. No crear `Multiple Extruders` en una máquina monoextrusora.
- Conservar filtros/taxonomías existentes `Quality / Strength / Speed / Support` y `All / Basic / Advanced / Expert`; no ocultar parámetros expertos ni repetir un campo en varias fuentes de estado.
- **`Dropdown Select`** para perfiles de proceso y material (Artillery PLA Basic predeterminado), guardado de variantes. La impresora única Adventurer 4 se indica, no se elige entre otras.
- Clic en el **nombre del parámetro** abre `Tooltip/Popover` explicativo; clic fuera o segundo clic lo cierra. `Inline Numeric Input` para edición, unidades y validación accesibles **aunque Pages no tenga backend**.
- **`Sticky Footer Action Bar`** para Save/Apply y Reset Defaults. **Único indicador de diferencia con default = botón Reset** (gris si no hay diferencia, activo si la hay); eliminar circulitos extra. Panel expandido Profiles/Filters con fondo verde **muy tenue** para hacerlo identificable.

### UI-29 y UI-30 — Acciones, diálogos, estados y accesibilidad

- **Export** genera archivo; **Send Only** sube GX sin iniciar impresión; **Send & Print** sube e inicia. Dos acciones separadas, mismas validaciones de backend, nombres/metadatos correctos, autenticación y estado confirmable. En Pages, inhabilitadas con explicación.
- `Modal Dialog` de confirmación antes de iniciar o cancelar impresión, mostrando nombre, material, temperaturas, duración y miniatura **sólo si se conocen**; marcar los desconocidos como tal.
- `Toast/Snackbar` para errores/success, `Loading State`, `Empty State`, `Error State`, sin afirmaciones falsas de impresora conectada, envío completado o slicing real.
- Objetivos táctiles >=44×44 CSS px, `aria-expanded` en acordeones, rangos accesibles, navegación teclado, foco visible, contraste y `prefers-reduced-motion`. Mensajes de error con texto, nunca solo un color.

### Matriz de pruebas nueva para los componentes aprobados

| Prueba | Resultado esperado |
| --- | --- |
| Ruler Picker XYZ a 320/360/390/430 px | Una única regla por eje sin slider debajo, valor editable, línea central fija, touch+teclado funcionales |
| Snap Move | Con ON: cuantización/acciones a 5 mm; OFF conserva precisión, también para valores negativos |
| Snap Rotate / Steps | Snap 5° en cada eje; +45° dos veces suma +90° relativo; −45° revierte; sin alterar escala |
| Scale Locked | ON por defecto, X/Y/Z ligados por factor común, OFF permite cambiar uno, re-lock no cambia dimensiones actuales; Snap 5%/5 mm opcional |
| Undo/Apply | Valor interno sin drift; cancel restaura; commit cambia el modelo seleccionado y marca G-code `stale` |
| Bottom Sheet | Scroll y gestos de regla no orbitan el modelo ni desplazan accidentalmente el panel; safe area y teclado correctos |
| Settings Accordion | Expandir/contraer mantiene valores, restablecer correcto, tooltip fuera/segundo clic cierra; sin backend siguen visibles |
| Layer Range | 1 ≤ A ≤ B ≤ N, toolpaths reales actualizan con el rango, sin G-code no existen capas falsas |
| Contextual Actions | File/Slice enseñan acciones correspondientes; Send Only no inicia; Send & Print requiere confirmación real |
| Seguridad e integración | Sin CDN/framework extra; Playwright móvil, consola libre de errores, accesibilidad, API desconectada y CLI autenticado |

**Fuentes:** [wusb/slide-ruler](https://github.com/wusb/slide-ruler) y [demo](https://wusb.github.io/slide-ruler/); [daybrush/ruler](https://github.com/daybrush/ruler); [react-mobile-picker](https://github.com/adcentury/react-mobile-picker). Los detalles visuales derivan de las **cinco capturas facilitadas el 2026-10-27**, no de activos versionados en este repositorio.

## 3. Ideas adicionales para seguir debatiendo (NO aprobadas todavía)

> UI-08 (acordeones) y UI-14 (capas) pasan de propuestas a requisitos aprobados; se detallan en el catálogo de referencia 2.1.

| ID | Idea | Beneficio | Prioridad sugerida |
| --- | --- | --- | --- |
| UI-09 | Resumen flotante/colapsable: altura de capa, relleno, soporte, velocidad y temperaturas | Entender el perfil sin abrir diez menús | P1 |
| UI-10 | Separar el estado **perfil cambiado / valor por defecto** únicamente mediante reset activo; evitar indicadores redundantes | Consistencia | P1 |
| UI-11 | Filament con ficha dedicada Artillery PLA Basic, temperatures y flow; guardar variantes | No mezclar ajustes de proceso con material | P1 |
| UI-12 | Navegación gestual de **subpantallas** en \`Transform\`, pero sin activar accidentalmente gestos cuando se arrastra el STL | Ergonomía | P2 |
| UI-13 | Controles del visor: **Fit to model**, vista cenital e isométrica, sin superposición permanente | Manipulación más fácil | P2 |
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
3. **PR C — Navegación y Transform**. Barra inferior con cuatro iconos, Move/Rotate/Scale unificados, **ruler pickers sin slider inferior, Snap 5 mm, Snap 5°, ±45° y Resize Locked**, y eliminación de superposiciones laterales.
4. **PR D — Botones y pulido responsive**. Acciones de modelo, estados vacíos, jerarquía de botones y accesibilidad.
5. **PR E — Auditoría de pantallas**. Print, Filament, App, capas y Printer; acordeones, rango de capas, bottom sheets, acciones contextuales y pruebas de regresión móvil/escritorio.

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
| 2026-10-27 | Catalogar los componentes de las cinco capturas y aplicarlos al diseño de AD4 Studio | Aprobada |
| 2026-10-27 | Elegir `wusb/slide-ruler` como referencia web para el Ruler Picker, **sin segundo slider** | Aprobada |
| 2026-10-27 | Move con Snap 5 mm; Rotate con Snap 5° y botones ±45° | Aprobada |
| 2026-10-27 | Resize Locked/Keep Proportions por defecto en Scale | Aprobada |
| 2026-10-27 | Toolpath Preview, selector de rango de capas, Action Tiles, Accordions y Bottom Sheet | Aprobada |
| Próxima revisión | Validar estilo exacto de botones y formato de chip de estado | Abierta |
| Próxima revisión | Decidir las nuevas ideas UI-08 a UI-20 | Abierta |

## 9. Cómo continuaremos este documento

Cada petición nueva puede añadirse como \`UI-21\`, \`UI-22\`, etc., con descripción, motivo, boceto si hace falta, prioridad y criterio de aceptación. El estado de cada entrada seguirá este ciclo:

\`Idea → Definida → Aprobada → En PR → Probada → Fusionada\`.

**Próximo paso sugerido:** cerrar el estilo definitivo de los botones de modelo y del indicador de impresora, y reproducir el fallo de Print sin tocar todavía el diseño de las demás pantallas.

### UI-31 — SettingsGuide modal (implemented)

- Click setting label **or** its trailing 15px Lucide `circle-help` icon to open a scrollable help dialog.
- Icon has an accessible 28×30 target, a short hover/focus tooltip and a readable screen-reader label.
- Native Cura metadata stays in the summary; detailed article Markdown, images, GIFs, and cross-article links load on demand from bundled offline resources. Links to another guide article open in the same modal with a Back control; external links open safely in a new tab.
- Header and Lucide X stay fixed; Escape and backdrop close the dialog. Preserve input/profile values, scroll and accordion state.
- Content: pinned `vendor/settings-guide` git submodule (`d7d700427b45743845f0eac8dceec575bee19332`); all 633 source Markdown articles and images copied at build time, with AGPL-3.0 license and source credit.
- No client-side CuraEngine; GitHub Pages uses the same bundled help.
