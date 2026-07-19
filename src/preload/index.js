import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('calendarAPI', {
  getUnifiedEvents: (rangeStart, rangeEnd) =>
    ipcRenderer.invoke('calendar:getUnifiedEvents', rangeStart, rangeEnd),
  getCachedEvents: () => ipcRenderer.invoke('calendar:getCachedEvents'),
  getSourceStatus: () => ipcRenderer.invoke('calendar:getSourceStatus'),
  refreshNow: (rangeStart, rangeEnd) => ipcRenderer.invoke('calendar:refreshNow', rangeStart, rangeEnd),
  startGoogleOAuth: (accountLabel) => ipcRenderer.invoke('calendar:startGoogleOAuth', accountLabel),
  openExternal: (url) => ipcRenderer.invoke('calendar:openExternal', url),
  getPreferences: () => ipcRenderer.invoke('preferences:get'),
  setCalendarColor: (calendarId, color) =>
    ipcRenderer.invoke('preferences:setCalendarColor', calendarId, color),
  setCalendarVisibility: (calendarId, visible) =>
    ipcRenderer.invoke('preferences:setCalendarVisibility', calendarId, visible),
  hideEvent: (hiddenEvent) => ipcRenderer.invoke('preferences:hideEvent', hiddenEvent),
  restoreHiddenEvent: (key) => ipcRenderer.invoke('preferences:restoreHiddenEvent', key)
})
