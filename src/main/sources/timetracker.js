import { spawn } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mapTrackedEntry } from './calendarEventMappers.js'
import { parseProjectsFile, projectColor } from './timetrackerProjects.js'

// Electron 33 ships Node 20, so `node:sqlite` (Node >= 22.13) is unavailable in the main
// process. Shelling out to the system sqlite3 keeps this dependency-free and read-only,
// the same shape as the Reminders source spawning its native helper.
const SQLITE_PATH = '/usr/bin/sqlite3'
const DB_FILE = 'timetracker.db'
const PROJECTS_FILE = 'projects.txt'

/**
 * Single point of truth for where the tracker's data lives. Issue #11 adds a stored
 * preference as a new first branch here rather than reworking the callers.
 */
export function resolveDataDir() {
  return process.env.TIMETRACKER_DIR || join(homedir(), '.timetracker')
}

function toSeconds(ms) {
  if (!Number.isFinite(ms)) throw new Error(`Invalid timestamp: ${ms}`)
  return Math.floor(ms / 1000)
}

function toEntryId(value) {
  if (!Number.isInteger(value)) throw new Error(`Invalid entry id: ${value}`)
  return value
}

// The sqlite3 CLI has no bind parameters, so query values are interpolated. Every
// interpolated value passes through toSeconds/toEntryId first, which reject anything that
// is not a finite number — the ids come from our own preceding query, never from input.
function entriesQuery(startSeconds, endSeconds, nowSeconds) {
  return (
    'SELECT id, project, start, end FROM entries ' +
    `WHERE start < ${endSeconds} AND COALESCE(end, ${nowSeconds}) > ${startSeconds} ` +
    'ORDER BY start;'
  )
}

function notesQuery(ids) {
  return `SELECT entry_id, ts, text FROM notes WHERE entry_id IN (${ids.join(',')}) ORDER BY ts;`
}

function createSqliteRunner(dbPath) {
  return (sql) =>
    new Promise((resolve, reject) => {
      const child = spawn(SQLITE_PATH, ['-readonly', '-json', dbPath, sql])
      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      child.on('error', reject)
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `sqlite3 exited with code ${code}`))
          return
        }
        try {
          // `sqlite3 -json` prints nothing at all for an empty result set.
          resolve(JSON.parse(stdout.trim() || '[]'))
        } catch (error) {
          reject(new Error(`Failed to parse sqlite3 output: ${error.message}`))
        }
      })
    })
}

async function groupNotesByEntry(runQuery, entries) {
  const byEntry = new Map()
  if (entries.length === 0) return byEntry

  const rows = await runQuery(notesQuery(entries.map((entry) => toEntryId(entry.id))))
  for (const row of rows) {
    const existing = byEntry.get(row.entry_id)
    if (existing) existing.push(row)
    else byEntry.set(row.entry_id, [row])
  }

  return byEntry
}

// projects.txt is the authority on which projects exist, so a project with no sessions in
// the visible range still gets a sidebar row. Entries can still name a project the file
// has since dropped, and those must not vanish from the sidebar either.
function buildTrackedCalendars(projects, entries) {
  const names = new Set(projects)
  for (const entry of entries) names.add(entry.project)

  return [...names].map((name) => ({
    source: 'timetracker',
    calendarId: `timetracker:${name}`,
    calendarName: name,
    calendarDefaultColor: projectColor(name),
    calendarDefaultVisible: true
  }))
}

export function createTimetrackerSource({
  runQuery,
  readProjects = async () => [],
  detect = async () => true,
  now = () => Date.now()
} = {}) {
  return async function fetchTimetrackerEvents(rangeStart, rangeEnd) {
    // Not running the tracker is not a failure. Per AGENTS.md the sidebar footer surfaces
    // only failing sources, so reporting an error here would be permanent noise for
    // anyone who does not use it; `detected` lets Settings tell the two apart.
    if (!(await detect())) {
      return {
        events: [],
        calendars: [],
        statuses: [{ source: 'timetracker', ok: true, detected: false }]
      }
    }

    try {
      const nowMs = now()
      const entries = await runQuery(
        entriesQuery(
          toSeconds(new Date(rangeStart).getTime()),
          toSeconds(new Date(rangeEnd).getTime()),
          toSeconds(nowMs)
        )
      )

      const [notesByEntry, projects] = await Promise.all([
        groupNotesByEntry(runQuery, entries),
        readProjects()
      ])

      return {
        events: entries.map((entry) =>
          mapTrackedEntry(entry, notesByEntry.get(entry.id) ?? [], { now: nowMs })
        ),
        calendars: buildTrackedCalendars(projects, entries),
        statuses: [
          {
            source: 'timetracker',
            ok: true,
            detected: true,
            lastSyncedAt: new Date(nowMs).toISOString()
          }
        ]
      }
    } catch (err) {
      return {
        events: [],
        calendars: [],
        statuses: [
          { source: 'timetracker', ok: false, detected: true, lastError: err.message }
        ]
      }
    }
  }
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readProjectsFile(path) {
  try {
    return parseProjectsFile(await readFile(path, 'utf8'))
  } catch {
    // A missing or unreadable projects.txt only costs empty-range sidebar rows; the
    // projects named by actual entries still come through.
    return []
  }
}

export async function fetchTimetrackerEvents(rangeStart, rangeEnd) {
  const dataDir = resolveDataDir()
  const dbPath = join(dataDir, DB_FILE)

  const source = createTimetrackerSource({
    runQuery: createSqliteRunner(dbPath),
    readProjects: () => readProjectsFile(join(dataDir, PROJECTS_FILE)),
    detect: () => fileExists(dbPath)
  })

  return source(rangeStart, rangeEnd)
}
