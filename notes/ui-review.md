# Revisión de UI — rama `juanmaguitar/tt-integration`

Apunta el **síntoma**, no el veredicto. Ya decidiremos después si es bug,
preferencia o regla de diseño. Una línea por observación.

Al terminar cada bloque, mándalo al agente desde la preview de Markdown.

Triaje al final: `fix` (arreglo directo) · `issue` (GitHub `juanma-ai/unified-calendars`) · `regla` (`AGENTS.md`) · `descartado`.

---

## Top bar — `AppHeader.jsx`
Navegación de semana, etiqueta de rango, selector de vista, Settings, Refresh now.

-

## Sidebar — `CalendarSidebar.jsx`
Buscador fijo, lista de calendarios con scroll, toggle hide/show por fila,
menú de tres puntos (color), footer de estado de fuentes, enlace a eventos ocultos.

-

## Vista día — `CalendarGrid.jsx`
Rejilla horaria, fila de todo el día, carril de tiempo trackeado.

-

## Vista semana — `CalendarGrid.jsx`
-

## Vista mes — `MonthView.jsx`
-

## Vista año — `YearView.jsx`
-

## Agenda — `AgendaView.jsx`
Lista rodante desde el día ancla. Excluye `timetracker`.

-

## Leyenda — `SourceLegend.jsx`
Solo en día y semana. Distingue pill programado vs barra de carril trackeado.

-

## Eventos — `EventPill.jsx` / `eventColors.js`
Colores, contraste, Trello sin asignar (aclarado 60%), arrastrar y redimensionar.

-

## Popover de sesión trackeada — `TrackedSessionPopover.jsx`
-

## Settings — `SettingsScreen.jsx`
Cuentas, selección de calendarios, eventos ocultos, carpeta del time tracker,
estado por fuente.

-

## Menu bar / tray
Título visible en la barra de estado, agenda desplegable, resumen de tiempo
trackeado de hoy, notificaciones.

-

## Transversal
Estados vacíos, de carga y de error; teclado y foco; contraste; textos.

-
