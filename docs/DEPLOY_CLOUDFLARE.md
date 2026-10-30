# Acceso remoto seguro — Cloudflare Tunnel + Cloudflare Access

Esta guía complementa las [instrucciones de instalación de AD4 Studio](../AGENTS.md) y el [README](../README.md). Permite acceder desde Internet al **servidor Linux local** sin abrir los puertos de la impresora.

> **Importante:** Cloudflare Tunnel publica una dirección web; **Cloudflare Access controla quién puede entrar**. Configura y prueba Access antes de hacer pública la ruta. AD4 Studio realiza además su propia verificación del JWT de Access.

## Requisitos

- AD4 Studio instalado y funcionando en Linux: `http://127.0.0.1:8765/`.
- Impresora Adventurer 4 en la misma LAN del servidor, si quieres controlar hardware.
- Cuenta Cloudflare, dominio gestionado allí y Cloudflare Zero Trust.
- `cloudflared` instalado en el servidor desde las [instrucciones oficiales](https://developers.cloudflare.com/tunnel/downloads/). No dupliques un servicio existente.

## 1. Crear la protección de Cloudflare Access

1. Abre **Zero Trust → Access controls → Applications → Add application → Self-hosted**.
2. Protege el **hostname completo** que utilizarás, por ejemplo `impresora.example.com`, incluidas la web, cámara y rutas `/api/*`.
3. Configura una política **Allow** que incluya **solo** tu correo o usuarios autorizados; activa MFA cuando esté disponible. No crees una política Bypass ni excepciones públicas.
4. Guarda el **Application AUD tag** y tu dominio del equipo, por ejemplo `mi-equipo.cloudflareaccess.com`.

El backend de AD4 Studio está preparado para una dirección de correo autorizada concreta. Si quieres acceso para más usuarios será necesario adaptar previamente esa política interna: una política Allow amplia en Cloudflare no elimina el filtro de correo del servidor.

## 2. Crear el túnel y su ruta

1. En **Cloudflare → Networking → Tunnels** crea un túnel administrado desde el panel, o utiliza uno existente.
2. Sigue el procedimiento oficial para instalar `cloudflared` en Linux. Para un túnel nuevo puedes usar el comando que proporciona el panel, del tipo:

   ```bash
   sudo cloudflared service install TOKEN_DEL_TUNEL
   ```

   El token es secreto: no lo pegues en issues, chats públicos, logs, README ni archivos versionados. Si ya tienes un servicio `cloudflared` en el servidor, añade una ruta al túnel existente en vez de instalar un segundo servicio.

3. En **Routes → Add route → Published application**, configura el hostname `impresora.example.com` apuntando al servicio **`http://127.0.0.1:8765`**.
4. Mantén el `Host` original `impresora.example.com` (no lo sobrescribas con `localhost`). Revisa que no haya reglas de Access de exclusión para `/api/`.

No abras ni redirijas desde el router los puertos **8765**, **8899** ni **8080**. El origen local solo escucha en `127.0.0.1`.

## 3. Configurar la validación del servidor

El servidor exige estas **cuatro variables de entorno**. Sustituye sus valores por los propios; la URL debe ser HTTPS, sin ruta ni barra final:

```dotenv
CF_ACCESS_TEAM_DOMAIN=mi-equipo.cloudflareaccess.com
CF_ACCESS_AUD=AUD_DE_LA_APLICACION
CF_ACCESS_EMAIL=correo-autorizado@example.com
CF_ACCESS_PUBLIC_ORIGIN=https://impresora.example.com
```

Para una prueba manual, expórtalas en la misma shell y arranca:

```bash
.venv/bin/ffadv4manager-cura --require-access
```

Para mantener la aplicación ejecutándose después de cerrar la terminal, guarda los valores en un fichero privado, por ejemplo `/etc/ad4-studio/access.env`, **fuera del repositorio**, y configura systemd. Este ejemplo supone que la instalación está en `/opt/FFAdv4Manager_cura`, que ya existe un usuario Linux dedicado `ad4studio` y que ese usuario tiene acceso a los archivos y a la configuración de la impresora:

```ini
[Unit]
Description=AD4 Studio (protected by Cloudflare Access)
After=network-online.target
Wants=network-online.target

[Service]
User=ad4studio
WorkingDirectory=/opt/FFAdv4Manager_cura
EnvironmentFile=/etc/ad4-studio/access.env
ExecStart=/opt/FFAdv4Manager_cura/.venv/bin/ffadv4manager-cura --require-access
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Guarda el servicio como `/etc/systemd/system/ad4-studio.service`; protege el fichero de entorno (por ejemplo, propietario `root`, permisos `0600`) y activa el servicio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ad4-studio.service
sudo systemctl status ad4-studio.service
```

Si tu instalación y usuario tienen nombres diferentes, adapta **solo** esas rutas y el usuario. La configuración de `ffadv4manager` debe existir para el mismo usuario que ejecuta el servicio o proporcionarse mediante `FFADV4MANAGER_CONFIG`.

Con `--require-access`, el proceso **rechaza el arranque** si faltan las variables de Access. Una petición directa a `http://127.0.0.1:8765` no incluirá el JWT de Access y será rechazada: eso es normal en modo protegido.

## 4. Verificación sin imprimir

- Desde datos móviles o una red externa, abre `https://impresora.example.com`. Confirma que se exige iniciar sesión con Cloudflare Access.
- Con el correo autorizado, comprueba que cargan el editor, los ajustes y la información de estado.
- Prueba un usuario no autorizado o una sesión anónima: **no** debe entrar.
- Revisa que no hayas publicado excepciones para las rutas API, cámara o archivos.
- No subas archivos, no actives ventiladores ni inicies impresiones solo para probar el túnel.

## Problemas habituales

- **Error 502 en Cloudflare:** asegúrate de que AD4 Studio esté arrancado y el destino del túnel sea `http://127.0.0.1:8765` en **el mismo servidor**.
- **401 después de iniciar sesión:** comprueba `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_ACCESS_EMAIL`, `CF_ACCESS_PUBLIC_ORIGIN` y que no se esté modificando el encabezado `Host`.
- **Access pide login pero la UI no carga:** revisa si la política cubre el hostname completo y los recursos/API.
- **cloudflared service already installed:** usa el túnel existente; no reinstales ni elimines servicios compartidos.
- **La web carga pero no hay impresora:** comprueba su IP LAN y ejecuta `.venv/bin/ffadv4manager doctor` como el usuario del servicio.

Fuentes: [crear Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/), [proteger con Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) y [tokens del túnel](https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/).
