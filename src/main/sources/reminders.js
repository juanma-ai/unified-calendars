import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'

// Vite bundles this file into a single out/main/index.js, so its own
// location can't be used to find the project root — the app is always
// launched from the project root via the npm scripts, so process.cwd() works.
const isPackaged = Boolean(process.versions.electron && !process.defaultApp)
const HELPER_PATH = isPackaged
  ? join(process.resourcesPath, 'reminders/RemindersHelper.app/Contents/MacOS/RemindersHelper')
  : join(
      process.cwd(),
      'native/reminders-helper/.build/release/RemindersHelper.app/Contents/MacOS/RemindersHelper'
    )

async function runHelper(rangeStart, rangeEnd) {
  try {
    await access(HELPER_PATH)
  } catch {
    const error = new Error(`Reminders helper executable not found at ${HELPER_PATH}`)
    error.code = 'HELPER_NOT_BUILT'
    throw error
  }

  return new Promise((resolve, reject) => {
    const child = spawn(HELPER_PATH, ['--start', rangeStart, '--end', rangeEnd])
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `reminders-helper exited with code ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch (error) {
        reject(new Error(`Failed to parse reminders-helper output: ${error.message}`))
      }
    })
  })
}

function mapReminder(item) {
  const calendarId = `reminders:${item.listName}`
  return {
    source: 'reminders',
    calendarId,
    calendarName: item.listName,
    calendarDefaultColor: '#9b7a00',
    calendarDefaultVisible: true,
    id: `reminders:${item.id}`,
    seriesId: null,
    title: item.title,
    start: item.dueDate,
    end: item.dueDate,
    allDay: item.allDay,
    status: item.isCompleted ? 'completed' : 'confirmed',
    raw: item
  }
}

export async function fetchRemindersEvents(rangeStart, rangeEnd) {
  try {
    const items = await runHelper(rangeStart, rangeEnd)
    return {
      events: items.map(mapReminder),
      statuses: [{ source: 'reminders', ok: true, lastSyncedAt: new Date().toISOString() }]
    }
  } catch (err) {
    let lastError = err.message
    if (err.code === 'HELPER_NOT_BUILT') lastError = 'not-built'
    else if (err.message.startsWith('permission-denied')) lastError = 'not-connected'

    return { events: [], statuses: [{ source: 'reminders', ok: false, lastError }] }
  }
}
