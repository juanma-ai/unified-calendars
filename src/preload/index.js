import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('calendarAPI', {
  getUnifiedEvents: (rangeStart, rangeEnd) =>
    ipcRenderer.invoke('calendar:getUnifiedEvents', rangeStart, rangeEnd),
  getCachedEvents: () => ipcRenderer.invoke('calendar:getCachedEvents'),
  getSourceStatus: () => ipcRenderer.invoke('calendar:getSourceStatus'),
  getAvailableCalendars: () => ipcRenderer.invoke('calendar:getAvailableCalendars'),
  refreshNow: (rangeStart, rangeEnd) => ipcRenderer.invoke('calendar:refreshNow', rangeStart, rangeEnd),
  updateEventTime: (payload) => ipcRenderer.invoke('calendar:updateEventTime', payload),
  setReminderCompleted: (payload) => ipcRenderer.invoke('calendar:setReminderCompleted', payload),
  startGoogleOAuth: (accountLabel) => ipcRenderer.invoke('calendar:startGoogleOAuth', accountLabel),
  getGoogleAccounts: () => ipcRenderer.invoke('accounts:getGoogle'),
  connectGoogleAccount: () => ipcRenderer.invoke('accounts:connectGoogle'),
  disconnectGoogleAccount: (accountId) => ipcRenderer.invoke('accounts:disconnectGoogle', accountId),
  openExternal: (url) => ipcRenderer.invoke('calendar:openExternal', url),
  getTimetrackerStats: () => ipcRenderer.invoke('timetracker:getStats'),
  chooseTimetrackerFolder: () => ipcRenderer.invoke('timetracker:chooseDataDir'),
  getPreferences: () => ipcRenderer.invoke('preferences:get'),
  getRunningTracking: () => ipcRenderer.invoke('tracking:getRunning'),
  startTracking: (project) => ipcRenderer.invoke('tracking:start', project),
  stopTracking: () => ipcRenderer.invoke('tracking:stop'),
  addTrackingNote: (text) => ipcRenderer.invoke('tracking:addNote', text),
  addSessionNote: (entryId, text) => ipcRenderer.invoke('tracking:addSessionNote', entryId, text),
  updateSessionNote: (noteId, text) => ipcRenderer.invoke('tracking:updateNote', noteId, text),
  deleteSessionNote: (noteId) => ipcRenderer.invoke('tracking:deleteNote', noteId),
  deleteSession: (entryId) => ipcRenderer.invoke('tracking:deleteSession', entryId),
  closeNoteWindow: () => ipcRenderer.invoke('tracking:closeNoteWindow'),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  addProject: (name) => ipcRenderer.invoke('projects:add', name),
  removeProject: (name) => ipcRenderer.invoke('projects:remove', name),
  renameProject: (from, to) => ipcRenderer.invoke('projects:rename', from, to),
  getLaunchAtLogin: () => ipcRenderer.invoke('app:getLaunchAtLogin'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('app:setLaunchAtLogin', enabled),
  setCalendarColor: (calendarId, color) =>
    ipcRenderer.invoke('preferences:setCalendarColor', calendarId, color),
  setCalendarSidebarVisibility: (calendarId, visible) =>
    ipcRenderer.invoke('preferences:setCalendarSidebarVisibility', calendarId, visible),
  setCalendarVisibility: (calendarId, visible) =>
    ipcRenderer.invoke('preferences:setCalendarVisibility', calendarId, visible),
  toggleFocusedCalendar: (calendarId) =>
    ipcRenderer.invoke('preferences:toggleFocusedCalendar', calendarId),
  setSourceEnabled: (source, enabled) =>
    ipcRenderer.invoke('preferences:setSourceEnabled', source, enabled),
  hideEvent: (hiddenEvent) => ipcRenderer.invoke('preferences:hideEvent', hiddenEvent),
  restoreHiddenEvent: (key) => ipcRenderer.invoke('preferences:restoreHiddenEvent', key),
  onOpenSettings: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('calendar:openSettings', listener)
    return () => ipcRenderer.removeListener('calendar:openSettings', listener)
  }
})
