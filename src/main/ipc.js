import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import {
  getAvailableCalendars,
  getSourceStatus,
  getStartupCache,
  getUnifiedEvents,
  invalidateSourceCache
} from './aggregator.js'
import { config } from './config.js'
import { disconnectGoogleAccount, startOAuthFlow, updateGoogleEventTime } from './sources/google.js'
import { setReminderCompleted, updateReminderDue } from './sources/reminders.js'
import { updateTrelloCardDue } from './sources/trello.js'
import { readTimetrackerStats, validateDataDir } from './sources/timetracker.js'
import { getGoogleAccounts } from './tokenStore.js'
import {
  getCalendarPreferences,
  hideCalendarEvent,
  restoreHiddenCalendarEvent,
  setCalendarColor,
  setCalendarSidebarVisibility,
  setCalendarVisibility,
  setSecondaryTimeZones,
  setSecondaryTimeZoneNote,
  setSourceEnabled,
  setTimetrackerDataDir,
  setTimeZone,
  setTimeZoneCity,
  toggleFocusedCalendar
} from './calendarPreferences.js'
import { createEventNotificationScheduler } from './eventNotifications.js'
import { createEventTimeUpdater } from './eventMutations.js'
import { createReminderCompleter } from './reminderCompletion.js'

const updateEventTime = createEventTimeUpdater(
  {
    google: updateGoogleEventTime,
    trello: updateTrelloCardDue,
    reminders: updateReminderDue
  },
  invalidateSourceCache
)

const setReminderCompletedHandler = createReminderCompleter(
  setReminderCompleted,
  invalidateSourceCache
)

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

// Fed by the menu bar agenda's rolling "today" refresh, never by the calendar
// grid: which range the user happens to be looking at must not decide which
// events get notified.
export function scheduleEventNotifications(events, preferences = getCalendarPreferences()) {
  lastNotificationEvents = events
  eventNotificationScheduler.schedule(events, preferences)
  return events
}

function rescheduleEventNotifications(preferences) {
  eventNotificationScheduler.schedule(lastNotificationEvents, preferences)
}

export function registerIpcHandlers({
  tracking = null,
  projects = null,
  launchAtLogin = null,
  openNoteWindow = () => {},
  closeNoteWindow = () => {}
} = {}) {
  if (projects) {
    ipcMain.handle('projects:list', () => projects.list())
    ipcMain.handle('projects:add', (_event, name) => projects.add(String(name ?? '')))
    ipcMain.handle('projects:remove', (_event, name) => projects.remove(String(name ?? '')))
    ipcMain.handle('projects:rename', (_event, from, to) =>
      projects.rename(String(from ?? ''), String(to ?? ''))
    )
  }
  if (launchAtLogin) {
    ipcMain.handle('app:getLaunchAtLogin', () => launchAtLogin.get())
    ipcMain.handle('app:setLaunchAtLogin', (_event, enabled) => launchAtLogin.set(Boolean(enabled)))
  }

  if (tracking) {
    ipcMain.handle('tracking:getRunning', () => tracking.getRunning())
    ipcMain.handle('tracking:start', (_event, project) => tracking.start(String(project ?? '')))
    ipcMain.handle('tracking:stop', () => tracking.stop())
    ipcMain.handle('tracking:addNote', (_event, text) => tracking.addNote(String(text ?? '')))
    // The session channels carry a row id from the renderer, so they are the one tracking
    // path where the number is not ours. Number() them here rather than trusting the
    // caller: the writer rejects anything that is not an integer.
    ipcMain.handle('tracking:addSessionNote', (_event, entryId, text) =>
      tracking.addSessionNote(Number(entryId), String(text ?? ''))
    )
    ipcMain.handle('tracking:updateNote', (_event, noteId, text) =>
      tracking.updateNote(Number(noteId), String(text ?? ''))
    )
    ipcMain.handle('tracking:deleteNote', (_event, noteId) => tracking.deleteNote(Number(noteId)))
    ipcMain.handle('tracking:deleteSession', (_event, entryId) =>
      tracking.deleteSession(Number(entryId))
    )
  }
  ipcMain.handle('tracking:openNoteWindow', () => {
    openNoteWindow()
  })
  ipcMain.handle('tracking:closeNoteWindow', () => {
    closeNoteWindow()
  })

  ipcMain.handle('calendar:getUnifiedEvents', async (_event, rangeStart, rangeEnd) => {
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

  ipcMain.handle('calendar:refreshNow', async (_event, rangeStart, rangeEnd) => {
    return getUnifiedEvents(rangeStart, rangeEnd, { force: true })
  })

  ipcMain.handle('calendar:updateEventTime', (_event, payload) => {
    return updateEventTime(payload ?? {})
  })

  ipcMain.handle('calendar:setReminderCompleted', (_event, payload) => {
    return setReminderCompletedHandler(payload ?? {})
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

  ipcMain.handle('timetracker:getStats', () => readTimetrackerStats())

  // The tracker keeps writing to its own directory; this only tells the calendar where to
  // read. Validating before saving means a mis-picked folder never becomes the stored one.
  ipcMain.handle('timetracker:chooseDataDir', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    const { canceled, filePaths } = await (win
      ? dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : dialog.showOpenDialog({ properties: ['openDirectory'] }))

    if (canceled || filePaths.length === 0) return { cancelled: true }

    const [dataDir] = filePaths
    await validateDataDir(dataDir)
    setTimetrackerDataDir(dataDir)
    invalidateSourceCache('timetracker')

    return { cancelled: false, stats: await readTimetrackerStats() }
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
  ipcMain.handle('preferences:toggleFocusedCalendar', (_event, calendarId) => {
    const preferences = toggleFocusedCalendar(calendarId)
    rescheduleEventNotifications(preferences)
    return preferences
  })
  ipcMain.handle('preferences:setSourceEnabled', (_event, source, enabled) => {
    const preferences = setSourceEnabled(String(source), Boolean(enabled))
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

  ipcMain.handle('preferences:setTimeZone', (_event, timeZone, city) => {
    const preferences = setTimeZone(String(timeZone ?? ''), city)
    rescheduleEventNotifications(preferences)
    return preferences
  })

  ipcMain.handle('preferences:setTimeZoneCity', (_event, city) => {
    const preferences = setTimeZoneCity(city)
    rescheduleEventNotifications(preferences)
    return preferences
  })

  ipcMain.handle('preferences:setSecondaryTimeZones', (_event, zones) => {
    const preferences = setSecondaryTimeZones(Array.isArray(zones) ? zones : [])
    rescheduleEventNotifications(preferences)
    return preferences
  })

  ipcMain.handle('preferences:setSecondaryTimeZoneNote', (_event, zone, note) => {
    const preferences = setSecondaryTimeZoneNote(String(zone ?? ''), note)
    rescheduleEventNotifications(preferences)
    return preferences
  })
}
