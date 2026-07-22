import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import {
  getAvailableCalendars,
  getSourceStatus,
  getStartupCache,
  getUnifiedEvents,
  invalidateSourceCache
} from './aggregator.js'
import { config } from './config.js'
import { disconnectGoogleAccount, startOAuthFlow } from './sources/google.js'
import { getGoogleAccounts } from './tokenStore.js'
import {
  getCalendarPreferences,
  hideCalendarEvent,
  restoreHiddenCalendarEvent,
  setCalendarColor,
  setCalendarSidebarVisibility,
  setCalendarVisibility
} from './calendarPreferences.js'
import { createEventNotificationScheduler } from './eventNotifications.js'

let activeBounceId = null

function stopWindowAttention(win) {
  if (win && !win.isDestroyed()) win.flashFrame(false)
  if (activeBounceId !== null && app.dock) {
    app.dock.cancelBounce(activeBounceId)
    activeBounceId = null
  }
}

function requestWindowAttention() {
  const win = BrowserWindow.getAllWindows()[0]

  if (app.dock) {
    if (activeBounceId !== null) app.dock.cancelBounce(activeBounceId)
    activeBounceId = app.dock.bounce('critical')
  }

  if (!win || win.isDestroyed()) return

  win.flashFrame(true)
  win.once('focus', () => stopWindowAttention(win))
  if (win.isMinimized()) win.restore()
  win.show()
  app.focus({ steal: true })
  win.focus()
}

const eventNotificationScheduler = createEventNotificationScheduler({
  requestAttention: requestWindowAttention,
  showNotification({ title, body }) {
    if (typeof Notification.isSupported === 'function' && !Notification.isSupported()) return

    try {
      new Notification({ title, body }).show()
    } catch (error) {
      console.warn('Failed to show event notification:', error)
    }
  }
})

let lastNotificationEvents = []

function scheduleEventNotifications(events, preferences = getCalendarPreferences()) {
  lastNotificationEvents = events
  eventNotificationScheduler.schedule(events, preferences)
  return events
}

function rescheduleEventNotifications(preferences) {
  eventNotificationScheduler.schedule(lastNotificationEvents, preferences)
}

export function registerIpcHandlers() {
  ipcMain.handle('calendar:getUnifiedEvents', async (_event, rangeStart, rangeEnd) => {
    const events = await getUnifiedEvents(rangeStart, rangeEnd)
    return scheduleEventNotifications(events)
  })

  ipcMain.handle('calendar:getCachedEvents', () => {
    return getStartupCache()
  })

  ipcMain.handle('calendar:getSourceStatus', () => {
    return getSourceStatus()
  })

  ipcMain.handle('calendar:getAvailableCalendars', () => {
    return getAvailableCalendars()
  })

  ipcMain.handle('calendar:refreshNow', async (_event, rangeStart, rangeEnd) => {
    const events = await getUnifiedEvents(rangeStart, rangeEnd, { force: true })
    return scheduleEventNotifications(events)
  })

  ipcMain.handle('calendar:startGoogleOAuth', (_event, accountLabel) => {
    return startOAuthFlow(accountLabel)
  })

  ipcMain.handle('accounts:getGoogle', () => {
    return getGoogleAccounts(config.google.accountLabels)
  })

  ipcMain.handle('accounts:connectGoogle', () => {
    return startOAuthFlow()
  })

  ipcMain.handle('accounts:disconnectGoogle', (_event, accountId) => {
    disconnectGoogleAccount(accountId)
    invalidateSourceCache('google')
    return getGoogleAccounts(config.google.accountLabels)
  })

  ipcMain.handle('calendar:openExternal', (_event, value) => {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error('Unsupported external URL protocol')
    }
    return shell.openExternal(url.toString())
  })

  ipcMain.handle('preferences:get', () => getCalendarPreferences())
  ipcMain.handle('preferences:setCalendarColor', (_event, calendarId, color) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Invalid calendar color')
    return setCalendarColor(calendarId, color)
  })
  ipcMain.handle('preferences:setCalendarSidebarVisibility', (_event, calendarId, visible) => {
    const preferences = setCalendarSidebarVisibility(calendarId, Boolean(visible))
    rescheduleEventNotifications(preferences)
    return preferences
  })
  ipcMain.handle('preferences:setCalendarVisibility', (_event, calendarId, visible) => {
    const preferences = setCalendarVisibility(calendarId, Boolean(visible))
    rescheduleEventNotifications(preferences)
    return preferences
  })
  ipcMain.handle('preferences:hideEvent', (_event, hiddenEvent) => {
    const preferences = hideCalendarEvent(hiddenEvent)
    rescheduleEventNotifications(preferences)
    return preferences
  })
  ipcMain.handle('preferences:restoreHiddenEvent', (_event, key) => {
    const preferences = restoreHiddenCalendarEvent(key)
    rescheduleEventNotifications(preferences)
    return preferences
  })
}
