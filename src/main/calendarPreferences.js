import Store from 'electron-store'

const PREFERENCES_KEY = 'calendarPreferences'
const DEFAULT_PREFERENCES = {
  calendarColors: {},
  calendarSidebarVisibility: {},
  calendarVisibility: {},
  focusedCalendars: [],
  hiddenCalendars: [],
  hiddenEvents: [],
  sourceEnabled: {},
  timetrackerDataDir: null
}

function normalize(value = {}) {
  return {
    calendarColors: value.calendarColors ?? {},
    calendarSidebarVisibility: value.calendarSidebarVisibility ?? {},
    calendarVisibility: value.calendarVisibility ?? {},
    focusedCalendars: value.focusedCalendars ?? [],
    hiddenCalendars: value.hiddenCalendars ?? [],
    hiddenEvents: value.hiddenEvents ?? [],
    // Whole-source master switch, distinct from per-calendar visibility: turning a
    // source off must not lose which of its calendars were individually hidden.
    sourceEnabled: value.sourceEnabled ?? {},
    // Where the calendar *reads* the tracker's database from. The tracker keeps writing to
    // its own directory; null means fall back to TIMETRACKER_DIR then ~/.timetracker.
    timetrackerDataDir: value.timetrackerDataDir ?? null
  }
}

export function createCalendarPreferencesStore(storage) {
  const get = () => normalize(storage.get(PREFERENCES_KEY, DEFAULT_PREFERENCES))
  const save = (preferences) => storage.set(PREFERENCES_KEY, normalize(preferences))

  return {
    get,

    setCalendarColor(calendarId, color) {
      const preferences = get()
      preferences.calendarColors[calendarId] = color
      save(preferences)
      return get()
    },

    setCalendarSidebarVisibility(calendarId, visible) {
      const preferences = get()
      preferences.calendarSidebarVisibility[calendarId] = visible
      preferences.hiddenCalendars = preferences.hiddenCalendars.filter((id) => id !== calendarId)
      save(preferences)
      return get()
    },

    setCalendarVisibility(calendarId, visible) {
      const preferences = get()
      if (!Object.prototype.hasOwnProperty.call(preferences.calendarSidebarVisibility, calendarId)) {
        preferences.calendarSidebarVisibility[calendarId] = true
      }
      preferences.calendarVisibility[calendarId] = visible
      save(preferences)
      return get()
    },

    toggleFocusedCalendar(calendarId) {
      const preferences = get()
      const index = preferences.focusedCalendars.indexOf(calendarId)
      if (index === -1) {
        preferences.focusedCalendars.push(calendarId)
      } else {
        preferences.focusedCalendars.splice(index, 1)
      }
      save(preferences)
      return get()
    },

    /**
     * Move every preference keyed by a calendar id when that id changes. Renaming a
     * tracker project changes its calendarId, and without this the project silently loses
     * its colour and its hide/show state — the preferences would still be filed under a
     * calendar that no longer exists.
     */
    renameCalendar(oldId, newId) {
      if (!oldId || !newId || oldId === newId) return get()
      const preferences = get()

      for (const map of [
        preferences.calendarColors,
        preferences.calendarVisibility,
        preferences.calendarSidebarVisibility
      ]) {
        if (Object.prototype.hasOwnProperty.call(map, oldId)) {
          map[newId] = map[oldId]
          delete map[oldId]
        }
      }

      preferences.hiddenCalendars = preferences.hiddenCalendars.map((id) =>
        id === oldId ? newId : id
      )
      preferences.focusedCalendars = preferences.focusedCalendars.map((id) =>
        id === oldId ? newId : id
      )

      save(preferences)
      return get()
    },

    setSourceEnabled(source, enabled) {
      const preferences = get()
      preferences.sourceEnabled[source] = enabled
      save(preferences)
      return get()
    },

    setTimetrackerDataDir(dataDir) {
      const preferences = get()
      preferences.timetrackerDataDir = dataDir || null
      save(preferences)
      return get()
    },

    hideEvent(event) {
      const targetId = event.scope === 'series' ? event.seriesId : event.eventId
      if (!targetId) throw new Error(`Cannot hide ${event.scope} without an identifier`)

      const preferences = get()
      const hiddenEvent = {
        ...event,
        key: `${event.scope}:${targetId}`
      }
      preferences.hiddenEvents = [
        ...preferences.hiddenEvents.filter((item) => item.key !== hiddenEvent.key),
        hiddenEvent
      ]
      save(preferences)
      return get()
    },

    restoreHiddenEvent(key) {
      const preferences = get()
      preferences.hiddenEvents = preferences.hiddenEvents.filter((item) => item.key !== key)
      save(preferences)
      return get()
    }
  }
}

let defaultPreferencesStore

function getDefaultStore() {
  if (!defaultPreferencesStore) {
    defaultPreferencesStore = createCalendarPreferencesStore(
      new Store({ name: 'calendar-personal-app' })
    )
  }
  return defaultPreferencesStore
}

export const getCalendarPreferences = () => getDefaultStore().get()
export const setCalendarColor = (calendarId, color) =>
  getDefaultStore().setCalendarColor(calendarId, color)
export const setCalendarSidebarVisibility = (calendarId, visible) =>
  getDefaultStore().setCalendarSidebarVisibility(calendarId, visible)
export const setCalendarVisibility = (calendarId, visible) =>
  getDefaultStore().setCalendarVisibility(calendarId, visible)
export const toggleFocusedCalendar = (calendarId) =>
  getDefaultStore().toggleFocusedCalendar(calendarId)
export const renameCalendarPreferences = (oldId, newId) =>
  getDefaultStore().renameCalendar(oldId, newId)
export const setSourceEnabled = (source, enabled) =>
  getDefaultStore().setSourceEnabled(source, enabled)
export const setTimetrackerDataDir = (dataDir) =>
  getDefaultStore().setTimetrackerDataDir(dataDir)
export const hideCalendarEvent = (event) => getDefaultStore().hideEvent(event)
export const restoreHiddenCalendarEvent = (key) => getDefaultStore().restoreHiddenEvent(key)
