import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getUnifiedEvents } from './aggregator.js'
import { getCalendarPreferences } from './calendarPreferences.js'
import { registerIpcHandlers } from './ipc.js'
import { createMenuBarAgenda } from './menuBarAgenda.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
let mainWindow = null
let menuBarAgenda = null

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  menuBarAgenda = createMenuBarAgenda({
    app,
    createWindow,
    getCalendarPreferences,
    getUnifiedEvents,
    getMainWindow: () => mainWindow
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
