/**
 * A stand-in for the `calendarAPI` bridge that `src/preload/index.js` exposes, so the
 * renderer can be opened in a plain browser tab (the dev server at localhost:5173) for
 * UI review and annotation. Electron always installs the real preload first, and
 * `installDevBrowserMock` refuses to overwrite it, so this can never shadow real data.
 *
 * The fixtures mirror the shapes the mappers emit — `mapGoogleEvent` / `mapTrelloCard` /
 * `mapTrackedEntry` in `src/main/sources/calendarEventMappers.js`, `mapReminder` in
 * `src/main/sources/reminders.js` — because the renderer reads those fields directly.
 * They are dated relative to "now" so events always land in the week being looked at.
 */

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function at(dayOffset, hour, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

function allDayDate(dayOffset) {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  return date.toISOString().slice(0, 10)
}

const GOOGLE_ACCOUNTS = [
  { id: 'work', label: 'work@example.com', canEdit: true },
  // Connected before the calendar.events scope existed, so the grid must refuse to
  // move its events until it is reconnected.
  { id: 'personal', label: 'personal@example.com', canEdit: false }
]

// A light and a dark colour, so both branches of `getEventPalette` are on screen.
const CALENDARS = [
  {
    source: 'google',
    sourceAccountId: 'work',
    sourceAccountName: 'work@example.com',
    calendarId: 'google:work:primary',
    calendarName: 'Work',
    calendarDefaultColor: '#3858e9',
    calendarDefaultVisible: true
  },
  {
    source: 'google',
    sourceAccountId: 'work',
    sourceAccountName: 'work@example.com',
    calendarId: 'google:work:team',
    calendarName: 'Team rituals',
    calendarDefaultColor: '#c5d9ff',
    calendarDefaultVisible: true
  },
  {
    source: 'google',
    sourceAccountId: 'personal',
    sourceAccountName: 'personal@example.com',
    calendarId: 'google:personal:primary',
    calendarName: 'Personal',
    calendarDefaultColor: '#1a7f37',
    calendarDefaultVisible: true
  },
  {
    source: 'google',
    sourceAccountId: 'personal',
    sourceAccountName: 'personal@example.com',
    calendarId: 'google:personal:birthdays',
    calendarName: 'Birthdays',
    calendarDefaultColor: '#f5e6a8',
    calendarDefaultVisible: false
  },
  {
    source: 'trello',
    calendarId: 'trello:board-roadmap',
    calendarName: 'Roadmap',
    calendarDefaultColor: '#9b7a00',
    calendarDefaultVisible: false
  },
  {
    source: 'reminders',
    calendarId: 'reminders:Recordatorios',
    calendarName: 'Recordatorios',
    calendarDefaultColor: '#9b7a00',
    calendarDefaultVisible: true
  },
  {
    source: 'timetracker',
    calendarId: 'timetracker:calendar-app',
    calendarName: 'calendar-app',
    calendarDefaultColor: '#4b6bdf',
    calendarDefaultVisible: true
  },
  {
    source: 'timetracker',
    calendarId: 'timetracker:gutenberg',
    calendarName: 'gutenberg',
    calendarDefaultColor: '#b84b8a',
    calendarDefaultVisible: true
  }
]

function googleEvent({ account, calendar, id, title, start, end, allDay = false, seriesId = null }) {
  const calendarId = `google:${account}:${calendar}`
  const source = CALENDARS.find((entry) => entry.calendarId === calendarId)

  return {
    source: 'google',
    sourceAccountId: account,
    calendarId,
    calendarName: source.calendarName,
    calendarDefaultColor: source.calendarDefaultColor,
    calendarDefaultVisible: source.calendarDefaultVisible,
    id: `${calendarId}:${id}`,
    providerCalendarId: calendar,
    providerEventId: id,
    seriesId: seriesId ? `${calendarId}:series:${seriesId}` : null,
    title,
    start,
    end,
    allDay,
    url: `https://calendar.google.com/event?eid=${id}`,
    status: 'confirmed',
    raw: {}
  }
}

function trelloCard({ id, title, due, assignedToMe }) {
  return {
    source: 'trello',
    calendarId: 'trello:board-roadmap',
    calendarName: 'Roadmap',
    calendarDefaultColor: '#9b7a00',
    calendarDefaultVisible: false,
    id: `trello:${id}`,
    providerCalendarId: 'board-roadmap',
    providerEventId: id,
    seriesId: null,
    title,
    start: due,
    end: due,
    allDay: false,
    url: `https://trello.com/c/${id}`,
    status: 'confirmed',
    assignees: assignedToMe
      ? [{ id: 'me', name: 'JuanMa', initials: 'JM', username: 'juanma', isMe: true }]
      : [{ id: 'other', name: 'Alex Rivera', initials: 'AR', username: 'alex', isMe: false }],
    assignedToMe,
    raw: {}
  }
}

function reminder({ id, title, due, allDay = false }) {
  return {
    source: 'reminders',
    calendarId: 'reminders:Recordatorios',
    calendarName: 'Recordatorios',
    calendarDefaultColor: '#9b7a00',
    calendarDefaultVisible: true,
    id: `reminders:${id}`,
    providerCalendarId: 'Recordatorios',
    providerEventId: id,
    seriesId: null,
    title,
    start: due,
    end: due,
    allDay,
    status: 'confirmed',
    raw: {}
  }
}

function trackedSession({ id, project, start, end, isRunning = false, notes = [] }) {
  const calendar = CALENDARS.find((entry) => entry.calendarId === `timetracker:${project}`)

  return {
    source: 'timetracker',
    calendarId: `timetracker:${project}`,
    calendarName: project,
    calendarDefaultColor: calendar.calendarDefaultColor,
    calendarDefaultVisible: true,
    id: `timetracker:${id}`,
    providerCalendarId: project,
    providerEventId: String(id),
    seriesId: null,
    title: project,
    start,
    end,
    allDay: false,
    status: 'confirmed',
    isRunning,
    notes,
    raw: {}
  }
}

function buildEvents() {
  const runningStart = new Date(Date.now() - 40 * 60 * 1000).toISOString()

  return [
    googleEvent({
      account: 'work',
      calendar: 'primary',
      id: 'standup',
      title: 'Daily standup',
      start: at(0, 9, 30),
      end: at(0, 9, 45),
      seriesId: 'standup-series'
    }),
    googleEvent({
      account: 'work',
      calendar: 'team',
      id: 'design-review',
      title: 'Design review — calendar redesign',
      start: at(0, 11),
      end: at(0, 12)
    }),
    // Deliberately overlaps the design review, to see how the grid stacks columns.
    googleEvent({
      account: 'personal',
      calendar: 'primary',
      id: 'dentist',
      title: 'Dentista',
      start: at(0, 11, 30),
      end: at(0, 12, 30)
    }),
    googleEvent({
      account: 'work',
      calendar: 'primary',
      id: 'onepassword',
      title: 'Interview — frontend candidate',
      start: at(1, 15),
      end: at(1, 16)
    }),
    googleEvent({
      account: 'work',
      calendar: 'team',
      id: 'offsite',
      title: 'Team offsite',
      start: allDayDate(2),
      end: allDayDate(3),
      allDay: true
    }),
    googleEvent({
      account: 'work',
      calendar: 'primary',
      id: 'standup-tomorrow',
      title: 'Daily standup',
      start: at(1, 9, 30),
      end: at(1, 9, 45),
      seriesId: 'standup-series'
    }),
    googleEvent({
      account: 'personal',
      calendar: 'primary',
      id: 'gym',
      title: 'Gimnasio',
      start: at(-1, 19),
      end: at(-1, 20)
    }),
    trelloCard({
      id: 'card-mine',
      title: 'Ship the sidebar overflow menu',
      due: at(0, 17),
      assignedToMe: true
    }),
    trelloCard({
      id: 'card-theirs',
      title: 'Audit notification scheduling',
      due: at(1, 12),
      assignedToMe: false
    }),
    reminder({ id: 'rem-1', title: 'Renovar el pasaporte', due: at(0, 8) }),
    reminder({ id: 'rem-2', title: 'Comprar regalo', due: at(2, 10) }),
    trackedSession({
      id: 101,
      project: 'calendar-app',
      start: at(-1, 10),
      end: at(-1, 13, 20)
    }),
    trackedSession({
      id: 102,
      project: 'gutenberg',
      start: at(-1, 15),
      end: at(-1, 17)
    }),
    trackedSession({
      id: 103,
      project: 'calendar-app',
      start: at(0, 8, 15),
      end: at(0, 9, 25),
      notes: [{ ts: at(0, 8, 40), text: 'Revisando el legend en día y semana' }]
    }),
    // Still running: this is what feeds the growing lane bar and the popover.
    trackedSession({
      id: 104,
      project: 'calendar-app',
      start: runningStart,
      end: new Date().toISOString(),
      isRunning: true,
      notes: [{ ts: runningStart, text: 'Mock del bridge para revisar la UI' }]
    })
  ]
}

function buildStatuses() {
  const lastSyncedAt = new Date().toISOString()

  return [
    { source: 'google', sourceAccountId: 'work', sourceAccountName: 'work@example.com', ok: true, lastSyncedAt },
    // One failing source, so the sidebar footer and the Settings badges have something
    // to render. Per AGENTS.md the footer only shows what is broken.
    {
      source: 'google',
      sourceAccountId: 'personal',
      sourceAccountName: 'personal@example.com',
      ok: false,
      lastError: 'invalid_grant: token expired or revoked'
    },
    { source: 'trello', ok: true, lastSyncedAt },
    { source: 'reminders', ok: true, lastSyncedAt },
    { source: 'timetracker', ok: true, detected: true, lastSyncedAt }
  ]
}

function defaultPreferences() {
  return {
    calendarColors: {},
    calendarSidebarVisibility: {},
    calendarVisibility: {},
    hiddenCalendars: [],
    hiddenEvents: [],
    sourceEnabled: {},
    timetrackerDataDir: null
  }
}

function browserOnly(action) {
  return Promise.reject(
    new Error(`${action} necesita Electron: no está disponible en el navegador.`)
  )
}

export function createDevBrowserApi() {
  let events = buildEvents()
  const calendars = CALENDARS
  const statuses = buildStatuses()
  let preferences = defaultPreferences()
  const accounts = GOOGLE_ACCOUNTS.map((account) => ({ ...account }))

  // The real store returns a fresh snapshot after every write, and the renderer feeds
  // that straight back into state, so hand back copies rather than the live object.
  const snapshot = () => JSON.parse(JSON.stringify(preferences))

  function eventsInRange(rangeStart, rangeEnd) {
    const start = new Date(rangeStart).getTime()
    const end = new Date(rangeEnd).getTime()

    return events
      .filter((event) => {
        const eventStart = new Date(event.start).getTime()
        const eventEnd = new Date(event.end).getTime()
        return eventEnd >= start && eventStart <= end
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start))
  }

  return {
    getUnifiedEvents: async (rangeStart, rangeEnd) => eventsInRange(rangeStart, rangeEnd),
    getCachedEvents: async () => ({
      rangeStart: new Date(Date.now() - DAY_MS).toISOString(),
      rangeEnd: new Date(Date.now() + 6 * DAY_MS).toISOString(),
      events: eventsInRange(
        new Date(Date.now() - DAY_MS).toISOString(),
        new Date(Date.now() + 6 * DAY_MS).toISOString()
      ),
      calendars,
      statuses,
      savedAt: Date.now()
    }),
    getSourceStatus: async () => statuses,
    getAvailableCalendars: async () => calendars,
    refreshNow: async (rangeStart, rangeEnd) => eventsInRange(rangeStart, rangeEnd),

    updateEventTime: async ({ event, start, end }) => {
      const account = accounts.find(({ id }) => id === event.sourceAccountId)
      if (event.source === 'google' && account && !account.canEdit) {
        throw new Error('Esta cuenta está conectada en modo solo lectura. Reconéctala.')
      }
      events = events.map((entry) =>
        entry.id === event.id ? { ...entry, start, end: end ?? entry.end } : entry
      )
      return { ok: true }
    },

    startGoogleOAuth: () => browserOnly('Conectar con Google'),
    getGoogleAccounts: async () => accounts,
    connectGoogleAccount: () => browserOnly('Conectar con Google'),
    disconnectGoogleAccount: () => browserOnly('Desconectar la cuenta'),
    openExternal: () => browserOnly('Abrir el enlace'),

    getTimetrackerStats: async () => ({
      dataDir: '/Users/mock/.timetracker',
      dbPath: '/Users/mock/.timetracker/timetracker.db',
      displayPath: '~/.timetracker/timetracker.db',
      detected: true,
      projectCount: 2,
      sessionCount: 4,
      lastError: null
    }),
    chooseTimetrackerFolder: () => browserOnly('Elegir carpeta'),

    getPreferences: async () => snapshot(),

    // Tracking writes nothing in the browser mock: the tray and the note window are the
    // only callers and neither exists here, so these just have to be present and inert.
    getRunningTracking: async () => null,
    startTracking: async (project) => ({ project, start: Math.floor(Date.now() / 1000) }),
    stopTracking: async () => Math.floor(Date.now() / 1000),
    addTrackingNote: async () => {
      throw new Error('No timer running — start one before adding a note.')
    },
    closeNoteWindow: async () => {},

    listProjects: async () => [...mockProjects],
    addProject: async (name) => {
      mockProjects.push(name.trim())
      return [...mockProjects]
    },
    removeProject: async (name) => {
      mockProjects = mockProjects.filter((project) => project !== name)
      return [...mockProjects]
    },
    renameProject: async (from, to) => {
      mockProjects = mockProjects.map((project) => (project === from ? to.trim() : project))
      return [...mockProjects]
    },
    getLaunchAtLogin: async () => false,
    setLaunchAtLogin: async (enabled) => enabled,

    setCalendarColor: async (calendarId, color) => {
      preferences.calendarColors[calendarId] = color
      return snapshot()
    },

    setCalendarSidebarVisibility: async (calendarId, visible) => {
      preferences.calendarSidebarVisibility[calendarId] = visible
      preferences.hiddenCalendars = preferences.hiddenCalendars.filter((id) => id !== calendarId)
      return snapshot()
    },

    setCalendarVisibility: async (calendarId, visible) => {
      if (!Object.prototype.hasOwnProperty.call(preferences.calendarSidebarVisibility, calendarId)) {
        preferences.calendarSidebarVisibility[calendarId] = true
      }
      preferences.calendarVisibility[calendarId] = visible
      return snapshot()
    },

    setSourceEnabled: async (source, enabled) => {
      preferences.sourceEnabled[source] = enabled
      return snapshot()
    },

    hideEvent: async (hiddenEvent) => {
      const targetId = hiddenEvent.scope === 'series' ? hiddenEvent.seriesId : hiddenEvent.eventId
      if (!targetId) throw new Error(`Cannot hide ${hiddenEvent.scope} without an identifier`)

      // Same key shape as `createCalendarPreferencesStore.hideEvent`, so Settings ->
      // Hidden events can restore what the sidebar hid.
      const entry = { ...hiddenEvent, key: `${hiddenEvent.scope}:${targetId}` }
      preferences.hiddenEvents = [
        ...preferences.hiddenEvents.filter((item) => item.key !== entry.key),
        entry
      ]
      return snapshot()
    },

    restoreHiddenEvent: async (key) => {
      preferences.hiddenEvents = preferences.hiddenEvents.filter((entry) => entry.key !== key)
      return snapshot()
    },

    onOpenSettings: () => () => {}
  }
}

/**
 * Installs the mock only when the preload did not run. Returns whether it installed,
 * so the caller can tell "browser, mocked" from "Electron, real bridge".
 */
let mockProjects = ['certification', 'admin']

export function installDevBrowserMock(target = globalThis) {
  if (target.calendarAPI) return false

  target.calendarAPI = createDevBrowserApi()
  console.info('[dev] calendarAPI bridge is missing — using the browser mock with sample data.')
  return true
}
