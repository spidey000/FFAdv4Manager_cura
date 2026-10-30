<div align="center">

# 🖨️ AD4 Studio
### Un espacio de trabajo para tu FlashForge Adventurer 4

**Prepara modelos · Ajusta Cura · Lamina en Linux · Envía a la impresora · Supervisa la impresión**

[![CI](https://github.com/spidey000/FFAdv4Manager_cura/actions/workflows/ci.yml/badge.svg)](https://github.com/spidey000/FFAdv4Manager_cura/actions/workflows/ci.yml)
[![Native CuraEngine](https://github.com/spidey000/FFAdv4Manager_cura/actions/workflows/native-engine.yml/badge.svg)](https://github.com/spidey000/FFAdv4Manager_cura/actions/workflows/native-engine.yml)
[![GitHub Pages](https://github.com/spidey000/FFAdv4Manager_cura/actions/workflows/pages.yml/badge.svg)](https://spidey000.github.io/FFAdv4Manager_cura/)
[![License: GPLv3 / AGPLv3](https://img.shields.io/badge/license-GPLv3%20%2B%20AGPLv3-informational)](#licencias-y-créditos)

[**Probar la interfaz**](https://spidey000.github.io/FFAdv4Manager_cura/) ·
[**Instalar**](#instalación-en-linux) ·
[**Funciones**](#qué-puedes-hacer) ·
[**Documentación**](#documentación-y-desarrollo)

</div>

> **Un proyecto para Adventurer 4, no un slicer genérico.** Interfaz web basada en [MosaicSlicer](https://github.com/ading2210/MosaicSlicer), motor CuraEngine **nativo en el servidor Linux** y gestor de impresora integrado mediante FFAdv4Manager. La demo pública es interactiva, pero **no lamina ni imprime**.

## Así se ve

[![AD4 Studio: visor 3D real en escritorio](https://spidey000.github.io/FFAdv4Manager_cura/screenshots/ad4-studio-desktop.png)](https://spidey000.github.io/FFAdv4Manager_cura/)

<div align="center">
  <img src="https://spidey000.github.io/FFAdv4Manager_cura/screenshots/ad4-studio-mobile.png" alt="AD4 Studio en móvil: visor 3D y herramientas" width="43%" />
  &nbsp;
  <img src="https://spidey000.github.io/FFAdv4Manager_cura/screenshots/ad4-studio-settings-mobile.png" alt="AD4 Studio en móvil: ajustes de impresión de Cura" width="43%" />
  <p><sub>Capturas auténticas generadas con Chromium durante la publicación de GitHub Pages: escritorio, visor móvil y ajustes móviles. Muestran la demo estática, sin hardware conectado.</sub></p>
</div>

**[Abrir demo interactiva →](https://spidey000.github.io/FFAdv4Manager_cura/)** Puedes cargar STL/3MF, explorar la escena, modificar modelos y recorrer el catálogo de ajustes. Se incluye un cubo de calibración de 20 mm; la vista de G-code de ejemplo es una **simulación no imprimible**, no el resultado del motor CuraEngine.

## Qué puedes hacer

| Área | Funciones |
| --- | --- |
| **Editor 3D** | Importación STL/3MF, varios modelos, selección, ocultar/mostrar, mover, girar, escalar proporcionalmente, controles táctiles y vistas de cámara. |
| **Ajustes de Cura** | Catálogo de parámetros de Mosaic/Cura, filtros All/Basic/Advanced/Expert, categorías Quality/Strength/Speed/Support/Material, búsqueda, presets locales y restauración de valores. Ayuda contextual de [SettingsGuide](https://github.com/Ghostkeeper/SettingsGuide). |
| **Slicing real** | Exportación de geometría y ajustes resueltos al servidor; CuraEngine nativo genera G-code. Vista previa de trayectorias por capas, rangos de capas, tiempo y material estimados. |
| **Archivos y envío** | Inspección de G-code/GX, conversión a GX con miniatura y metadatos, subida a almacenamiento de la impresora o envío con inicio de impresión tras confirmación. |
| **Gestor de impresora** | Detección LAN, conexiones y perfiles, estado, temperaturas, archivos almacenados, miniaturas M662, diagnósticos, cámara MJPEG, ventilador, pausa/reanudación/cancelación y avisos. |
| **Timelapse** | Captura de la cámara por intervalo o por capa Z **estimada** cuando hay datos disponibles; inicio opcional asociado a una impresión, MP4 persistentes y galería para ver, descargar o borrar. |
| **Impresión actual** | Cámara y representación 3D lado a lado, posición M114 y capa estimada a partir de alturas de depósito de material. Diferenciación explícita de la procedencia del G-code. |

La interfaz es adaptable a móvil y escritorio. Los controles que pueden alterar la impresora se ejecutan **exclusivamente en el servidor local**, nunca desde la demo de GitHub Pages.

## Instalación en Linux

Pensado principalmente para **Ubuntu 24.04** u otra distribución Linux reciente. La máquina Linux debe poder alcanzar la impresora en la **misma red local**.

**Requisitos:** Python 3.10 o superior (incluido <code>venv</code>), Git, Node.js **20+**, npm, CMake **3.20+**, Ninja y compilador **C++20** (por ejemplo GCC 12+). La compilación inicial del motor requiere Internet para obtener dependencias de GitHub, Conan Center y SourceForge.

### 1. Prepara el sistema

En Ubuntu instala las dependencias de compilación. Comprueba también que tu Node.js sea 20 o superior:

~~~bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip build-essential cmake ninja-build
node --version
npm --version
~~~

Si Node.js es antiguo, instala una versión LTS 20+ antes de continuar.

### 2. Descarga e instala

~~~bash
git clone --recurse-submodules https://github.com/spidey000/FFAdv4Manager_cura.git
cd FFAdv4Manager_cura
bash scripts/install.sh
~~~

El instalador prepara **<code>.venv/</code>** para Python, construye **<code>frontend/</code>** a partir del submódulo fijado de MosaicSlicer y, salvo configuración contraria, compila un CuraEngine compatible en **<code>.local/curaengine/</code>**. No instala paquetes Python globalmente. La primera compilación del motor puede ser considerable.

### 3. Configura tu Adventurer 4

Con la impresora encendida y conectada a la LAN:

~~~bash
.venv/bin/ffadv4manager discover
.venv/bin/ffadv4manager config set --host 192.168.1.50
.venv/bin/ffadv4manager status --json
~~~

Sustituye <code>192.168.1.50</code> por la IP real de tu impresora. El puerto TCP habitual de control es **8899** y la cámara MJPEG usa normalmente **8080**; ambos son configurables.

### 4. Arranca AD4 Studio

~~~bash
.venv/bin/ffadv4manager-cura
~~~

Abre **http://127.0.0.1:8765/** en el navegador del propio servidor. Por defecto el servicio escucha solo en loopback: no expongas el puerto directamente a Internet. Comprueba la disponibilidad del motor en **http://127.0.0.1:8765/api/slice/engine**.

<details>
<summary><strong>Opciones de instalación y resolución de problemas</strong></summary>

- Si necesitas repetir solo la compilación nativa: <code>bash scripts/build_engine.sh</code>.
- Para usar un ejecutable ya verificado con soporte de ajustes resueltos <code>-r</code>: <code>export AD4_CURAENGINE_BIN=/ruta/absoluta/CuraEngine</code> antes de arrancar el servidor.
- Para preparar solo la UI sin motor (pruebas o demo): <code>AD4_SKIP_ENGINE_BUILD=1 bash scripts/install.sh</code>. En ese modo **Slice no funciona**.
- Para limitar trabajos simultáneos durante la compilación: <code>AD4_BUILD_JOBS=2 bash scripts/build_engine.sh</code>.
- Si se queda en Loading, comprueba que se hayan inicializado ambos submódulos y que <code>scripts/install.sh</code> haya terminado, incluido el build del frontend.
- Si el motor devuelve HTTP 503 en <code>/api/slice/engine</code>, revisa la compilación y la variable <code>AD4_CURAENGINE_BIN</code>; instalar un CuraEngine convencional no garantiza compatibilidad.
- Si no hay comunicación con la impresora, ejecuta <code>.venv/bin/ffadv4manager doctor</code> y revisa host, red y puertos. El visor y los ajustes pueden seguir funcionando sin impresora.

</details>

## De STL a una impresión

1. **Modelo:** importa un STL/3MF y ajusta su posición, orientación y tamaño en la plataforma virtual.
2. **Material y proceso:** selecciona el perfil y revisa los parámetros Cura. El proyecto está configurado para **Adventurer 4** (220 × 200 × 250 mm, boquilla de 0,4 mm) con **Artillery PLA Basic** como punto de partida.
3. **Slice:** el servidor procesa la geometría con el motor nativo y devuelve G-code real, material y tiempo estimados. Revisa el recorrido por capas.
4. **Revisión y envío:** verifica la información del archivo y el estado físico de la impresora; elige **solo enviar** o **enviar e imprimir**. El G-code se encapsula en GX cuando corresponde.
5. **Seguimiento:** consulta cámara, progreso, temperaturas y, si existe una fuente de trayectorias asociada, visualiza la **capa estimada** de la impresión en curso. Puedes configurar un timelapse.

### Qué sucede por dentro

~~~text
Navegador (MosaicSlicer + AD4 Studio)
    │  modelo + parámetros Cura
    ▼
API Python local  ──►  CuraEngine nativo (-r)
    │                       │
    ◄─────── G-code real + estimaciones
    │
    ├── Preview por capas
    ├── Conversión G-code → GX (miniatura + metadatos)
    └── FFAdv4Manager CLI → LAN → Adventurer 4
                                  │
                                  └── estado, M114, archivos, cámara, timelapse
~~~

**La web pública de GitHub Pages solo sirve la primera parte visual.** No ejecuta CuraEngine WASM, no transmite G-code y no accede a tu red.

## Estado y límites importantes

Este proyecto está en **desarrollo activo (alpha)**. Los PR [#21](https://github.com/spidey000/FFAdv4Manager_cura/pull/21), [#22](https://github.com/spidey000/FFAdv4Manager_cura/pull/22), [#23](https://github.com/spidey000/FFAdv4Manager_cura/pull/23) y [#24](https://github.com/spidey000/FFAdv4Manager_cura/pull/24) introducen mejoras de fiabilidad, conexiones de impresora, visor de trabajo actual y slicing nativo.

- **Verificado en CI:** carga de STL real en Chromium, interfaz móvil y de escritorio, generación de G-code con CuraEngine compilado en Ubuntu 24.04, conversión a GX, metadatos térmicos, análisis de capas y pruebas de API/CLI con impresora simulada. [Ver workflows](https://github.com/spidey000/FFAdv4Manager_cura/actions).
- **Pendiente de validar físicamente:** funcionamiento extremo a extremo con tu firmware, impresión real, cámara y algunos comandos del dispositivo. Un test con impresora simulada **no acredita** un resultado físico.
- **Capa estimada, no telemetría exacta:** Adventurer 4 devuelve posición Z mediante M114 y porcentaje mediante M27; la capa se infiere de alturas depositadas en el archivo. Los Z-hop no crean una capa nueva, pero no se conoce la línea exacta ejecutada ni hay sincronización de fotogramas con la cámara.
- **Descarga de trabajo activo:** no hay un comando de descarga de G-code confirmado para el protocolo estándar de la AD4. La visualización usa archivos que el servidor conservó, asociación explícita del usuario o un descargador opcional **verificado y configurado por el administrador**. M661 lista archivos y M662 recupera miniaturas, no G-code.
- **Seguridad:** se aplican comprobaciones térmicas y de archivos, pero el operador debe revisar temperaturas, homing, geometría, superficie y máquina antes de iniciar cualquier impresión. Los límites para el perfil PLA integrado son 220 °C para boquilla y 65 °C para cama.

Para acceso remoto, utiliza un túnel privado protegido con autenticación y consulta la [guía de Cloudflare Access](docs/DEPLOY_CLOUDFLARE.md). No publiques los puertos **8899/8080** de la impresora ni el servidor local sin la protección prevista.

## Documentación y desarrollo

| Documento | Para qué sirve |
| --- | --- |
| [Gestor y visor de impresión actual](docs/PRINTER_INTEGRATION.md) | Conexiones, diagnósticos, origen del archivo, cámara y limitaciones |
| [Referencia CLI](docs/CLI.md) | Comandos y opciones de <code>ffadv4manager</code> |
| [API web](docs/WEB_API.md) | Endpoints locales y requisitos de autorización |
| [Formato GX](docs/AD4_GX_METADATA.md) | Metadatos, miniaturas y validación |
| [Despliegue protegido](docs/DEPLOY_CLOUDFLARE.md) | Acceso remoto y seguridad |
| [Auditoría de UI](docs/AD4_UI_REGRESSION_TESTS.md) | Matriz de pruebas y tamaños de pantalla |
| [Backlog de interfaz](docs/AD4_STUDIO_UI_BACKLOG.md) | Ideas, decisiones y pendientes; no confundir con funciones terminadas |
| [Instrucciones para agentes](AGENTS.md) | Arquitectura, workflow, reglas de seguridad y validaciones |

El código de la UI propia está en **<code>overlays/mosaic/</code>**. El directorio **<code>frontend/</code>** se genera con <code>scripts/prepare_mosaic.py</code> a partir del submódulo; **no debe modificarse como código fuente**. La API y CuraEngine están en <code>server/</code>, la lógica de impresora en <code>ffadv4manager/</code>, y los tests en <code>tests/</code>.

Para una comprobación local rápida tras instalar:

~~~bash
.venv/bin/python -m pip install pytest
.venv/bin/python -m pytest -q tests/cli tests/server tests/integration tests/cura tests/ui
~~~

Para verificar la cadena con motor real (requiere CuraEngine nativo y Chromium/Playwright):

~~~bash
.venv/bin/python scripts/verify_native_slicing.py --output-dir /tmp/ad4-native-validation
~~~

## Licencias y créditos

AD4 Studio integra componentes con **licencias distintas**. El CLI importado mantiene **GPL-3.0-or-later**; [MosaicSlicer](https://github.com/ading2210/MosaicSlicer), CuraEngine y [SettingsGuide](https://github.com/Ghostkeeper/SettingsGuide) mantienen sus respectivas obligaciones **AGPL-3.0**. Conserva avisos de copyright, atribuciones y las obligaciones de disponibilidad del código fuente (incluida la prestación por red cuando aplique). Consulta [LICENSE](LICENSE), [LICENSES](LICENSES) y [third_party_licenses](third_party_licenses).

---

<div align="center"><sub>Proyecto comunitario no afiliado a FlashForge ni a UltiMaker. Operar una impresora 3D exige supervisión y validación en el equipo físico.</sub></div>
