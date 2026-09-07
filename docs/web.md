# Calendario familiar web (bloque E)

Web de solo lectura de Radicale y Vikunja, reutilizando el calendario de Electron.

- URL: https://coolify-vps.tail96bc47.ts.net:8450
- Enlace de día: `/?view=day&date=2026-09-07`. La fecha es civil en la zona del calendario.
- Coolify: `calendario-familiar`, UUID `60lvpg1czhavu9o5gogomwpc`, proyecto Agente Familia.
- Rama de despliegue: `feature/family-web`. La rama principal de Electron no se ha cambiado.
- Contenedor: puerto 3000; host: `127.0.0.1:8290`; Tailscale Serve: 8450.
- Login: Pocket ID en 8448, callback `/auth/callback`; identidades de JuanMa y Laura por `sub`.
- Preferencias (colores, filtros y zonas): locales a cada navegador. Eventos y tareas no se modifican.
- Las sesiones caducan a las 12 horas; un reinicio requiere volver a iniciar sesión.

## Código compartido y entradas separadas

Electron conserva `src/renderer/index.html`, `src/renderer/src/main.jsx`, su preload IPC y electron-store.
Web usa `src/web/index.html`, `src/web/main.jsx`, `webBridge.js` y el servidor `src/server/`.
Los estilos móviles se cargan exclusivamente desde la entrada web.
El servidor solo importa Radicale y Vikunja; no importa Electron ni las fuentes personales/de trabajo.

`vendor/casa-agent` es un submódulo privado fijado a un commit. El parser y `dates.mjs` se importan del original, sin copias mantenidas a mano.

```sh
git submodule update --init --recursive
npm ci
npm run build          # Electron
npm run build:web      # Web y servidor empaquetado, sin node_modules en runtime
npm run start:web     # Requiere las variables de la sección siguiente
```

## Configuración y despliegue

Compose: `docs/web.compose.yaml` (usar `docker compose --project-directory . -f docs/web.compose.yaml`; Coolify ya fija el directorio raíz). Dockerfile: `Dockerfile.web`.
La red es propia y `connect_to_docker_network` está desactivado en Coolify.
El nombre del VPS tiene entrada explícita en `extra_hosts`, ya que el DNS del VPS no resuelve su propio nombre MagicDNS.
HTTPS sigue validando su certificado.

Variables de runtime en Coolify (ninguna se inyecta al build). La API bulk no admite `is_buildtime`: verificar/desactivar esa casilla tras crear variables; no basta enviar `is_build_time: false`:

- `WEB_PUBLIC_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `WEB_ALLOWED_SUBJECTS`.
- `RADICALE_URL`, `RADICALE_USER`, `RADICALE_PASSWORD`, `RADICALE_CALENDAR_PATH`.
- `VIKUNJA_BASE_URL`, `VIKUNJA_TOKEN`, `VIKUNJA_PROJECT_IDS=20`.

Cuenta de Vikunja: `calendar-web`, permiso de lectura sobre Family. Token restringido a lectura de proyectos y tareas; caduca el 1 de enero de 2036. El filtro por proyecto no reemplaza los permisos del usuario.
Radicale utiliza la identidad `hermes`, acotada al calendario familiar. El servidor HTTP solo expone consultas; no existe ruta de escritura DAV.

Se han configurado los submódulos y el webhook de GitHub en Coolify.
**Cada push despliega por webhook. No lanzar además un despliegue por API.**
No se debe actualizar el submódulo a un commit que no esté publicado en casa-agent.

```sh
ssh coolify-vps 'tailscale serve --bg --https=8450 http://127.0.0.1:8290'
```

## Acceso de Laura: condición de aceptación

La política está en `casa-agent/docs/tailscale-policy.hujson` (rama de trabajo `fix/expanded-calendar-occurrences`).
`group:familia` necesita **8448 y 8450**, además de 8446 y 8447.
El 8448 permite el login; permitir solo 8450 deja la web inaccesible al redirigir a Pocket ID.
Tras aplicar la política, comprobar el filtro real con `tailscale debug netmap` y abrir desde un dispositivo de Laura.

## Validación

Pruebas: adaptador contra fixture real del iPhone; ocurrencias expandidas y límites DST en casa-agent; caché, puente, rangos, rechazo de mutaciones, sesión, PKCE/state/nonce y restricción de identidad; deep links en zonas distintas; orden de fuentes.

`npm test` ejecuta la suite unitaria portable. `npm run test:integration` ejecuta las pruebas de Recordatorios que necesitan el helper nativo construido y autorizado en macOS; no confundir ese requisito con un fallo web.

Prueba visual con Playwright: datos controlados por la API, día concreto por URL, dos fuentes, ajustes sin Google/contador, ancho 1440 y 390.
La validación de producción y los pasos pendientes se registran al terminar el despliegue.

Si el Mac pierde el acceso al VPS, revisar ProtonVPN y las rutas antes de tocar Tailscale:

```sh
netstat -rn -f inet | grep '100.'
```

## Bloque F

Pendiente. Esta web solo fija el contrato de URL. El MCP deberá construir el enlace y el bot copiarlo.
