import Store from 'electron-store'
import { createCalendarPreferencesStore } from '../shared/calendarPreferences.js'
export { createCalendarPreferencesStore } from '../shared/calendarPreferences.js'

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
export const setTimeZone = (timeZone, city) => getDefaultStore().setTimeZone(timeZone, city)
export const setTimeZoneCity = (city) => getDefaultStore().setTimeZoneCity(city)
export const setSecondaryTimeZones = (zones) => getDefaultStore().setSecondaryTimeZones(zones)
export const setSecondaryTimeZoneNote = (zone, note) =>
  getDefaultStore().setSecondaryTimeZoneNote(zone, note)
export const hideCalendarEvent = (event) => getDefaultStore().hideEvent(event)
export const restoreHiddenCalendarEvent = (key) => getDefaultStore().restoreHiddenEvent(key)
