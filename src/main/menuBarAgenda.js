import { createRequire } from 'node:module'

const AGENDA_REFRESH_MS = 60 * 1000
const require = createRequire(import.meta.url)
const electron = require('electron')
const { Menu, nativeImage, shell, Tray } = electron

function createTrayIcon() {
  const image = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAEJJREFUOE9jZKAQMFKon2HUAIb/R8L0LwMDA8N/BgYGJmQHIyPDfyYGBgYGRkYGJneQGWRYoFREQEnBBKMGqgEAzDgSCQqklqUAAAAASUVORK5CYII='
  )
  image.setTemplateImage(true)
  return image
}

function eventStartMs(event) {
  const value = new Date(event.start).getTime()
  return Number.isFinite(value) ? value : null
}

function eventEndMs(event) {
  const value = new Date(event.end ?? event.start).getTime()
  return Number.isFinite(value) ? value : eventStartMs(event)
}

function isSameLocalDay(value, day) {
  return (
    value.getFullYear() === day.getFullYear() &&
    value.getMonth() === day.getMonth() &&
    value.getDate() === day.getDate()
  )
}

function overlapsDay(event, day) {
  const start = new Date(event.start)
  const end = new Date(event.end ?? event.start)
  if (!Number.isFinite(start.getTime())) return false
  if (isSameLocalDay(start, day)) return true
  return Number.isFinite(end.getTime()) && isSameLocalDay(end, day)
}

function normalizePreferences(preferences = {}) {
  return {
    calendarSidebarVisibility: preferences.calendarSidebarVisibility ?? {},
    calendarVisibility: preferences.calendarVisibility ?? {},
    hiddenCalendars: preferences.hiddenCalendars ?? [],
    hiddenEvents: preferences.hiddenEvents ?? []
  }
}

function isCalendarVisible(event, preferences) {
  if (Object.prototype.hasOwnProperty.call(preferences.calendarVisibility, event.calendarId)) {
    return preferences.calendarVisibility[event.calendarId]
  }
  if (preferences.hiddenCalendars.includes(event.calendarId)) return false
  return Boolean(event.calendarDefaultVisible)
}

function isCalendarInSidebar(event, preferences) {
  if (Object.prototype.hasOwnProperty.call(preferences.calendarSidebarVisibility, event.calendarId)) {
    return preferences.calendarSidebarVisibility[event.calendarId]
  }
  if (preferences.hiddenCalendars.includes(event.calendarId)) return false
  return isCalendarVisible(event, preferences)
}

function isHiddenEvent(event, preferences) {
  const hiddenEvents = new Set(preferences.hiddenEvents.map((item) => item.key))
  if (hiddenEvents.has(`occurrence:${event.id}`)) return true
  return Boolean(event.seriesId && hiddenEvents.has(`series:${event.seriesId}`))
}

function formatTime(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

function formatDay(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(date)
}

function formatRemaining(ms) {
  if (ms <= 0) return 'now'
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`
}

export function getTodayRange(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return {
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString()
  }
}

export function buildAgenda(events, { locale = undefined, now = new Date(), preferences = undefined } = {}) {
  const nowMs = now.getTime()
  const normalized = preferences ? normalizePreferences(preferences) : null
  const todayEvents = events
    .filter((event) => {
      if (event.status === 'cancelled' || !overlapsDay(event, now)) return false
      if (!normalized) return true
      return (
        isCalendarInSidebar(event, normalized) &&
        isCalendarVisible(event, normalized) &&
        !isHiddenEvent(event, normalized)
      )
    })
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return (eventStartMs(a) ?? 0) - (eventStartMs(b) ?? 0)
    })

  const nextEvent = todayEvents.find((event) => {
    if (event.allDay || event.status === 'completed') return false
    const startMs = eventStartMs(event)
    const endMs = eventEndMs(event)
    return startMs !== null && endMs !== null && endMs >= nowMs
  })

  return {
    dayLabel: `Today (${formatDay(now, locale)}):`,
    remainingLabel: nextEvent ? formatRemaining(eventStartMs(nextEvent) - nowMs) : 'No more events',
    events: todayEvents.map((event) => {
      const startMs = eventStartMs(event)
      const endMs = eventEndMs(event)
      const isPast = !event.allDay && endMs !== null && endMs < nowMs
      const isNext = nextEvent?.id === event.id

      return {
        id: event.id,
        title: event.title || '(no title)',
        timeLabel: event.allDay || startMs === null ? 'All day' : formatTime(new Date(startMs), locale),
        url: event.url ?? null,
        source: event.source,
        isPast: isPast || event.status === 'completed',
        isNext
      }
    })
  }
}

export function getTrayTitle(agenda) {
  const nextEvent = agenda.events.find((event) => event.isNext)
  if (!nextEvent) return 'No events'

  const remaining = agenda.remainingLabel === 'now'
    ? 'now'
    : agenda.remainingLabel.replace(/^in\s+/, '')

  return `${remaining} ${nextEvent.title}`.slice(0, 32)
}

export function buildMenuTemplate(
  agenda,
  {
    openCalendar = () => {},
    openEvent = () => {},
    openSettings = () => {},
    quit = () => {}
  } = {}
) {
  const nextLabel = agenda.remainingLabel === 'No more events'
    ? 'No more events today'
    : `Next ${agenda.remainingLabel}`
  const eventItems = agenda.events.length
    ? agenda.events.map((event) => ({
        label: `${event.timeLabel}  ${event.title}`,
        toolTip: event.isNext ? 'Next event' : undefined,
        enabled: true,
        click: () => {
          if (event.url) {
            openEvent(event.url)
          } else {
            openCalendar()
          }
        }
      }))
    : [{ label: 'No events today', enabled: false }]

  return [
    { label: agenda.dayLabel, enabled: false },
    { label: nextLabel, enabled: false },
    { type: 'separator' },
    ...eventItems,
    { type: 'separator' },
    { label: 'Open Calendar', click: openCalendar },
    { label: 'Settings', click: openSettings },
    { type: 'separator' },
    { label: 'Quit Unified Calendar', click: quit }
  ]
}

function showWindow(win) {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function createMenuBarAgenda({
  app,
  createWindow,
  getCalendarPreferences,
  getMainWindow,
  getUnifiedEvents,
  onEventsRefreshed = () => {}
}) {
  let tray
  let refreshTimer
  let lastAgenda = null

  async function loadAgenda({ force = false } = {}) {
    const range = getTodayRange()
    const events = await getUnifiedEvents(range.rangeStart, range.rangeEnd, { force })
    // This range already rolls with the day on a short interval, so it doubles
    // as the feed for event notifications.
    onEventsRefreshed(events)
    return buildAgenda(events, { preferences: getCalendarPreferences() })
  }

  async function updatePopover() {
    try {
      const agenda = await loadAgenda()
      lastAgenda = agenda
      tray.setTitle(getTrayTitle(agenda))
    } catch (error) {
      console.warn('Failed to load menu bar agenda:', error)
      tray.setTitle('Agenda unavailable')
    }
  }

  function openCalendar() {
    const existing = getMainWindow()
    const win = existing && !existing.isDestroyed() ? existing : createWindow()
    showWindow(win)
    return win
  }

  function openSettings() {
    const win = openCalendar()
    const notifyRenderer = () => win.webContents.send('calendar:openSettings')
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', notifyRenderer)
    } else {
      notifyRenderer()
    }
  }

  function showMenu() {
    const agenda = lastAgenda ?? {
      dayLabel: buildAgenda([], {}).dayLabel,
      remainingLabel: 'Loading...',
      events: []
    }
    const menu = Menu.buildFromTemplate(buildMenuTemplate(agenda, {
      openCalendar,
      openEvent: (url) => shell.openExternal(url),
      openSettings,
      quit: () => app.quit()
    }))

    tray.popUpContextMenu(menu)
    updatePopover()
  }

  function start() {
    tray = new Tray(createTrayIcon())
    tray.setTitle('Loading...')
    tray.setToolTip('Unified Calendar')
    tray.on('click', showMenu)
    tray.on('right-click', showMenu)

    loadAgenda()
      .then((agenda) => {
        lastAgenda = agenda
        tray.setTitle(getTrayTitle(agenda))
      })
      .catch((error) => {
        console.warn('Failed to load menu bar agenda title:', error)
        tray.setTitle('Agenda unavailable')
      })
    refreshTimer = setInterval(updatePopover, AGENDA_REFRESH_MS)
  }

  function stop() {
    if (refreshTimer) clearInterval(refreshTimer)
    if (tray) tray.destroy()
  }

  return { start, stop }
}
