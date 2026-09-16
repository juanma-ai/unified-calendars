import { createCalendarPreferencesStore } from '../../shared/calendarPreferences.js'

export const FAMILY_CAPABILITIES = Object.freeze({ sources: ['radicale', 'vikunja'], readOnly: true, desktop: false })
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
  return {
    capabilities: FAMILY_CAPABILITIES,
    ...Object.fromEntries(READ_METHODS.map(method => [method, async (...args) => {
      const response = await request(`/api/${method}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args)
      })
      if (response.status === 401) {
        browser.location.assign(`/auth/login?returnTo=${encodeURIComponent(browser.location.pathname + browser.location.search)}`)
        throw new Error('Inicia sesión para ver el calendario')
      }
      if (!response.ok) throw new Error(`No se pudo cargar el calendario (${response.status})`)
      return response.json()
    }])),
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
