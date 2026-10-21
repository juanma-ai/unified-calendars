import { createCalendarPreferencesStore } from '../../shared/calendarPreferences.js'

// readOnly still switches off the desktop-only actions (reminders, time
// tracker); editableSources is what lets Radicale events be dragged here.
export const FAMILY_CAPABILITIES = Object.freeze({ sources: ['radicale', 'vikunja'], readOnly: true, editableSources: Object.freeze(['radicale']), desktop: false })
const WRITE_METHODS = ['updateEventTime', 'createEvent', 'updateEvent', 'moveEventToCalendar', 'deleteEvent']
const READ_METHODS = ['getUnifiedEvents', 'refreshNow', 'getCachedEvents', 'getSourceStatus', 'getAvailableCalendars']
const PREFERENCE_METHODS = ['setCalendarColor', 'setCalendarSidebarVisibility', 'setCalendarVisibility', 'toggleFocusedCalendar', 'setSourceEnabled', 'setTimeZone', 'setTimeZoneCity', 'setSecondaryTimeZones', 'setSecondaryTimeZoneNote', 'hideEvent', 'restoreHiddenEvent']

export function createWebBridge(browser = window, request = fetch) {
  const storage = {
    get(key, fallback) {
      try { return JSON.parse(browser.localStorage.getItem(`family:${key}`)) || { ...fallback, timeZone: 'Europe/Madrid' } }
      catch { return { ...fallback, timeZone: 'Europe/Madrid' } }
    },
    set(key, value) { browser.localStorage.setItem(`family:${key}`, JSON.stringify(value)) }
  }
  const preferences = createCalendarPreferencesStore(storage)
  const call = (method, failure) => async (...args) => {
    const response = await request(`/api/${method}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args)
    })
    if (response.status === 401) {
      browser.location.assign(`/auth/login?returnTo=${encodeURIComponent(browser.location.pathname + browser.location.search)}`)
      throw new Error('Inicia sesión para ver el calendario')
    }
    if (!response.ok) throw new Error(await failure(response))
    return response.json()
  }
  return {
    capabilities: FAMILY_CAPABILITIES,
    ...Object.fromEntries(READ_METHODS.map(method => [method, call(method, response => `No se pudo cargar el calendario (${response.status})`)])),
    // A failed write says why (a conflict asks to reload), so the server's
    // message is shown rather than a bare status.
    ...Object.fromEntries(WRITE_METHODS.map(method => [method, call(method, async response => {
      const body = await response.json().catch(() => null)
      return body?.error || `No se pudo guardar el cambio (${response.status})`
    })])),
    ...Object.fromEntries(PREFERENCE_METHODS.map(method => [method, async (...args) => preferences[method](...args)])),
    getPreferences: async () => preferences.get(),
    getGoogleAccounts: async () => [],
    openExternal: async value => {
      const url = new URL(value)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Unsupported link')
      browser.open(url.href, '_blank', 'noopener,noreferrer')
    }
  }
}
