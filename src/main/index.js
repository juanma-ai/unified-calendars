import { app, BrowserWindow, nativeImage } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getUnifiedEvents, invalidateSourceCache } from './aggregator.js'
import { getCalendarPreferences } from './calendarPreferences.js'
import { registerIpcHandlers, scheduleEventNotifications } from './ipc.js'
import { createMenuBarAgenda } from './menuBarAgenda.js'
import { createTrackingController } from './tracking.js'
import { createProjectAdmin } from './trackingProjects.js'
import { renameCalendarPreferences } from './calendarPreferences.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const appIcon = nativeImage.createFromPath(join(__dirname, '../../assets/icon.png'))
let mainWindow = null
let noteWindow = null
let menuBarAgenda = null
let tracking = null
let projects = null

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function createNoteWindow() {
  if (noteWindow && !noteWindow.isDestroyed()) {
    noteWindow.show()
    noteWindow.focus()
    return noteWindow
  }

  const win = new BrowserWindow({
    width: 400,
    height: 240,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    // Opening a note must not drag the whole calendar to the front — that is the point of
    // taking notes from the tray.
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  noteWindow = win
  win.on('closed', () => {
    if (noteWindow === win) noteWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?window=note`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: 'window=note' })
  }

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  return win
}

app.whenReady().then(() => {
  tracking = createTrackingController({ invalidateCache: invalidateSourceCache })
  projects = createProjectAdmin({
    renamePreferences: renameCalendarPreferences,
    invalidateCache: invalidateSourceCache
  })
  registerIpcHandlers({
    tracking,
    projects,
    // macOS is the source of truth for a login item, so read it back rather than keeping
    // a preference that could drift from what System Settings actually has.
    launchAtLogin: {
      get: () => app.getLoginItemSettings().openAtLogin,
      set: (openAtLogin) => {
        app.setLoginItemSettings({ openAtLogin })
        return app.getLoginItemSettings().openAtLogin
      }
    },
    openNoteWindow: createNoteWindow,
    closeNoteWindow: () => noteWindow?.close()
  })
  createWindow()
  menuBarAgenda = createMenuBarAgenda({
    app,
    createWindow,
    getCalendarPreferences,
    getUnifiedEvents,
    loadTracking: () => tracking.readState(),
    startTracking: (project) => tracking.start(project),
    stopTracking: () => tracking.stop(),
    addNote: () => createNoteWindow(),
    getMainWindow: () => mainWindow,
    onEventsRefreshed: (events) => scheduleEventNotifications(events)
  })
  menuBarAgenda.start()

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  menuBarAgenda?.stop()
})
