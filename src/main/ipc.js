import { ipcMain, shell } from 'electron'
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
  setCalendarVisibility
} from './calendarPreferences.js'

export function registerIpcHandlers() {
  ipcMain.handle('calendar:getUnifiedEvents', (_event, rangeStart, rangeEnd) => {
    return getUnifiedEvents(rangeStart, rangeEnd)
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

  ipcMain.handle('calendar:refreshNow', (_event, rangeStart, rangeEnd) => {
    return getUnifiedEvents(rangeStart, rangeEnd, { force: true })
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
  ipcMain.handle('preferences:setCalendarVisibility', (_event, calendarId, visible) => {
    return setCalendarVisibility(calendarId, Boolean(visible))
  })
  ipcMain.handle('preferences:hideEvent', (_event, hiddenEvent) => {
    return hideCalendarEvent(hiddenEvent)
  })
  ipcMain.handle('preferences:restoreHiddenEvent', (_event, key) => {
    return restoreHiddenCalendarEvent(key)
  })
}
