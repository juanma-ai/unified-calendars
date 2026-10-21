# Calendario familiar web (bloque E)

Web de Radicale y Vikunja, reutilizando el calendario de Electron. Los eventos de Radicale se crean, editan y mueven desde la web; las tareas de Vikunja son de solo lectura.

- URL: https://coolify-vps.tail96bc47.ts.net:8450
- Enlace de día: `/?view=day&date=2026-09-07`. La fecha es civil en la zona del calendario.
- Coolify: `calendario-familiar`, UUID `60lvpg1czhavu9o5gogomwpc`, proyecto Agente Familia.
- Rama de despliegue: `feature/family-web`. La rama principal de Electron no se ha cambiado.
- Contenedor: puerto 3000; host: `127.0.0.1:8290`; Tailscale Serve: 8450.
- Login: Pocket ID en 8448, callback `/auth/callback`; identidades de JuanMa y Laura por `sub`; `WEB_USER_MAP` (`sub=juanma,sub=laura`) dice quién entra y con qué usuario de Radicale actúa.
- Preferencias (colores, filtros y zonas): locales a cada navegador.
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
La red externa dedicada `family-calendar-backend` conecta la web, Radicale y Pocket ID. No es la red compartida `coolify`.
Radicale se lee por `http://family-radicale:5232`; el transporte OIDC interno usa `http://family-pocket-id:1411`, conservando el issuer público HTTPS y rechazando endpoints de otro origen. El navegador sigue entrando exclusivamente por HTTPS/Tailscale.
Los proveedores deben conservar esa red y sus alias en sus compose de Coolify.

Variables de runtime en Coolify (ninguna se inyecta al build). La API bulk no admite `is_buildtime`: verificar/desactivar esa casilla tras crear variables; no basta enviar `is_build_time: false`:

- `WEB_PUBLIC_URL`, `OIDC_ISSUER`, `OIDC_INTERNAL_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `WEB_USER_MAP`.
- `RADICALE_URL`, y una `RADICALE_PASSWORD_<USUARIO>` por cada usuario de `WEB_USER_MAP` (`RADICALE_PASSWORD_JUANMA`, `RADICALE_PASSWORD_LAURA`).
- `VIKUNJA_BASE_URL`, `VIKUNJA_TOKEN`, `VIKUNJA_PROJECT_IDS=20,27` (Family y el de Laura; compartir antes con `calendar-web`).

Cuenta de Vikunja: `calendar-web`, permiso de lectura sobre Family. Token restringido a lectura de proyectos y tareas; caduca el 1 de enero de 2036. El filtro por proyecto no reemplaza los permisos del usuario.
Radicale se lee con la cuenta de quien ha entrado: `PROPFIND /<usuario>/` descubre sus calendarios de eventos (Familia por el enlace `casa` y el personal; el de tareas VTODO del iPhone se ignora). Así el fichero de derechos de Radicale impide que uno vea el personal del otro. Cada usuario tiene su propio agregador y su propia caché.

El `personal` del otro miembro también se ve, en solo lectura: el servidor lo lee con la cuenta de Radicale del otro (`RADICALE_PASSWORD_<OTRO>`), nunca abriendo el fichero de derechos, y quita ahí los eventos privados antes de cachearlos. Sale con `readOnly`, así que la web no ofrece editarlo; y aunque el navegador lo intentara, el escritor solo acepta rutas del PROPFIND propio. En el iPhone no aparece.

## Escritura en Radicale

`POST /api/<método>` solo acepta los métodos de la lista blanca de `src/server/calendarApi.mjs`: las lecturas y `createEvent`, `updateEvent`, `updateEventTime` y `moveEventToCalendar`. Escribe `src/server/radicaleWrite.mjs` con ical.js, como el usuario que ha entrado.

- Rutas: en cada escritura un PROPFIND nuevo da los calendarios del usuario; el `href` del evento y el calendario de destino tienen que estar entre ellos. Nunca se fía del cliente. La frontera final sigue siendo el fichero de derechos de Radicale.
- Conflictos: GET del recurso, comparación con el etag del cliente y PUT con `If-Match`. Un 412 llega al navegador como 409 "Alguien ha cambiado este evento. Recarga y vuelve a intentarlo."
- Series: editar o mover una ocurrencia escribe una excepción RECURRENCE-ID con el TZID del DTSTART original; el resto de la serie no cambia. Desde la web no se crean series y `moveEventToCalendar` rechaza ocurrencias.
- Se conservan VALARM, X-APPLE-* y VTIMEZONE. MOVE no devuelve etag: se vuelve a leer tras invalidar la caché.
- Asistentes: una línea `X-FAMILIA-ASISTENTE:<Nombre>` por persona, solo JuanMa y Laura. ATTENDEE no sirve: el iPhone trata el evento como invitación y quita Editar. En la rejilla salen las iniciales en la píldora (ocultas en Mes por debajo de 600 px) y los nombres en el popover.
- Privado: `X-FAMILIA-PRIVADO:TRUE` en todos los VEVENT del fichero, solo en calendarios personales (en Familia se rechaza, y un evento privado no se mueve a Familia sin quitar la marca). Se marca desde la web; el iPhone no la edita pero la conserva. El otro miembro no lo ve en la web y el MCP de Hermes lo filtra. Marcar una ocurrencia marca la serie, sin crear excepción.
- En la web se arrastra en Día y Semana; la vista Mes no tiene arrastre.
- Las pruebas que escriben van en `juanma/personal`, nunca en `familia/casa`: Agatha lee Familia y avisa al grupo.

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

Pruebas: adaptador contra fixture real del iPhone; escritura con fixtures del iPhone (alarmas, X-APPLE, excepción con TZID, rutas de fuera, 412); ocurrencias expandidas y límites DST en casa-agent; caché, puente, rangos, rechazo de mutaciones, sesión, PKCE/state/nonce y restricción de identidad; deep links en zonas distintas; orden de fuentes.

`npm test` ejecuta la suite unitaria portable. `npm run test:integration` ejecuta las pruebas de Recordatorios que necesitan el helper nativo construido y autorizado en macOS; no confundir ese requisito con un fallo web.

Prueba visual con Playwright: datos controlados por la API, día concreto por URL, dos fuentes, ajustes sin Google/contador, ancho 1440 y 390.
La validación de producción y los pasos pendientes se registran al terminar el despliegue.

Si el Mac pierde el acceso al VPS, revisar ProtonVPN y las rutas antes de tocar Tailscale:

```sh
netstat -rn -f inet | grep '100.'
```

## Bloque F

Pendiente. Esta web solo fija el contrato de URL. El MCP deberá construir el enlace y el bot copiarlo.
