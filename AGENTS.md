# Instalar AD4 Studio — instrucciones para agentes

Esta guía explica cómo **instalar y poner en marcha AD4 Studio**, la interfaz web para una impresora **FlashForge Adventurer 4**. El objetivo es dejar la aplicación funcionando, sin modificar su código.

## 1. Comprobar los requisitos

Utiliza un equipo **Linux** (recomendado: Ubuntu 24.04) con acceso a Internet para descargar y compilar las dependencias. Necesitarás:

- Git, Python **3.10+** con `venv`, Node.js **20+** y npm.
- CMake **3.20+**, Ninja y un compilador C++20 (por ejemplo, GCC 12+).
- Para conectar la impresora, el servidor y la Adventurer 4 deben estar en la misma red local.

En Ubuntu, instala las herramientas del sistema:

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip build-essential cmake ninja-build
```

Comprueba `node --version` y `npm --version`. Si Node.js no está instalado o es anterior a la versión 20, instala una versión LTS compatible.

## 2. Descargar e instalar la aplicación

```bash
git clone --recurse-submodules https://github.com/spidey000/FFAdv4Manager_cura.git
cd FFAdv4Manager_cura
bash scripts/install.sh
```

El instalador prepara automáticamente las dependencias, la interfaz web y el motor de laminado CuraEngine. **No es necesario instalar paquetes Python globalmente.** La primera compilación puede tardar; comprueba que termina sin errores.

## 3. Conectar la impresora (opcional)

Con la Adventurer 4 encendida y accesible desde el servidor:

```bash
.venv/bin/ffadv4manager discover
.venv/bin/ffadv4manager config set --host IP_DE_LA_IMPRESORA
.venv/bin/ffadv4manager status --json
```

Sustituye `IP_DE_LA_IMPRESORA` por su dirección real. Si no está conectada, puedes usar igualmente el editor y preparar modelos. **No envíes archivos ni inicies una impresión como parte de la instalación.**

## 4. Arrancar y comprobar

```bash
.venv/bin/ffadv4manager-cura
```

Abre **http://127.0.0.1:8765/** en el propio equipo Linux. Para comprobar que el motor de laminado está disponible, abre **http://127.0.0.1:8765/api/slice/engine**: debe indicar `"available": true`.

El servidor solo es accesible localmente por defecto. Para acceso remoto, consulta la [guía de despliegue protegido](docs/DEPLOY_CLOUDFLARE.md); no publiques directamente los puertos de la impresora.

## 5. Acceso remoto con Cloudflare Tunnel (opcional)

Para acceder desde fuera de casa **sin abrir puertos en el router**, utiliza **Cloudflare Tunnel + Cloudflare Access**. Necesitas un dominio gestionado por Cloudflare, una cuenta de Cloudflare Zero Trust y `cloudflared` instalado en el equipo Linux.

1. **Proteger la web:** en **Cloudflare Zero Trust → Access controls → Applications**, crea una aplicación **Self-hosted** para el dominio completo, por ejemplo `impresora.example.com`. Añade una política **Allow** solo para tu correo o usuarios autorizados (preferiblemente con MFA), sin excepciones públicas. Guarda el **AUD** de la aplicación y el dominio de equipo `mi-equipo.cloudflareaccess.com`.
2. **Crear el túnel:** en **Cloudflare → Networking → Tunnels**, crea un túnel administrado desde el panel o reutiliza uno existente. Instala `cloudflared` siguiendo el comando que proporciona Cloudflare; si es un túnel nuevo y aún no existe el servicio, el comando habitual es `sudo cloudflared service install TOKEN_DEL_TUNEL`. **Nunca publiques ni incluyas el token en Git.** Configura una ruta **Published application** desde `impresora.example.com` hacia **`http://127.0.0.1:8765`**. Mantén intacto el encabezado Host público.
3. **Activar la validación de Access en AD4 Studio:** establece estas variables en el entorno del proceso (para un servicio permanente, guárdalas en un archivo privado de entorno de systemd, no en el repositorio):

```bash
export CF_ACCESS_TEAM_DOMAIN="mi-equipo.cloudflareaccess.com"
export CF_ACCESS_AUD="AUD_DE_LA_APLICACION"
export CF_ACCESS_EMAIL="correo-autorizado@example.com"
export CF_ACCESS_PUBLIC_ORIGIN="https://impresora.example.com"
.venv/bin/ffadv4manager-cura --require-access
```

4. **Comprobar desde fuera:** abre `https://impresora.example.com` desde una red externa. Debe solicitar autenticación con Cloudflare Access; después de entrar, comprueba que el editor y el estado de la impresora se muestran correctamente. Haz solo comprobaciones de lectura, **sin subir archivos ni iniciar impresiones**.

El servidor debe seguir escuchando **solo en 127.0.0.1**. **No abras ni redirijas los puertos 8765, 8899 o 8080**. Si el túnel ya tiene un servicio `cloudflared` instalado, reutilízalo sin crear otro. Para una instalación persistente con `systemd`, consulta [la guía de Cloudflare](docs/DEPLOY_CLOUDFLARE.md). Documentación oficial: [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/) y [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).

## Si algo falla

- **No arranca:** verifica que `bash scripts/install.sh` terminó y que Node.js cumple la versión requerida.
- **No lamina:** revisa el estado en `/api/slice/engine`. Puedes repetir la compilación con `bash scripts/build_engine.sh`.
- **No detecta la impresora:** verifica IP, conexión a la misma LAN y prueba `.venv/bin/ffadv4manager doctor`.

Para más detalles y capturas, consulta el [README principal](README.md). La [demo web](https://spidey000.github.io/FFAdv4Manager_cura/) permite explorar la interfaz, pero no lamina ni imprime.

## Regla obligatoria de versionado para todo PR

**Cada pull request debe incrementar como mínimo una versión SemVer respecto a `main`, incluso si solo cambia documentación o mantenimiento.** Esta regla se aplica a cualquier agente que prepare un PR, antes de crearlo y antes de solicitar el merge.

- **UI:** incrementar `const VERSION_UI = "X.Y.Z"` en `overlays/mosaic/public/ad4-v3.js` cuando cambien interfaz, visor, estilos, presets, empaquetado web o despliegue.
- **Backend:** incrementar `version = "X.Y.Z"` en `pyproject.toml` cuando cambien el servidor, API, CLI, CuraEngine o integración con impresora.
- **Mixto:** incrementar ambas versiones si el PR afecta a los dos componentes. Mantener las numeraciones independientes.
- **Solo documentación, tests generales o infraestructura:** incrementar al menos la versión UI como marcador de release; no incrementar innecesariamente el backend.
- Usar `MAJOR.MINOR.PATCH`: normalmente subir PATCH en 1; MINOR para nueva funcionalidad y MAJOR para cambios incompatibles. Comparar siempre con la rama base actualizada y no disminuir ni reutilizar su versión.
- El hash de commit automático no sustituye el incremento del número de versión.
- Incluir en el PR las versiones anteriores y nuevas. Revisar el check `PR version policy / version-bump`; si falla, corregir antes del merge.
- El control está en `scripts/check_pr_version.py` y `.github/workflows/version-policy.yml`. Para verificarlo localmente: `python3 scripts/check_pr_version.py --base "$(git merge-base HEAD origin/main)"`.
