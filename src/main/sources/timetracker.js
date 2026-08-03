import { spawn } from 'node:child_process'
import { access, constants as fsConstants, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { endOfWeek, startOfWeek } from 'date-fns'
import { getCalendarPreferences } from '../calendarPreferences.js'
import { mapTrackedEntry } from './calendarEventMappers.js'
import { parseProjectsFile, projectColor } from './timetrackerProjects.js'

// Electron 33 ships Node 20, so `node:sqlite` (Node >= 22.13) is unavailable in the main
// process. Shelling out to the system sqlite3 keeps this dependency-free and read-only,
// the same shape as the Reminders source spawning its native helper.
const SQLITE_PATH = '/usr/bin/sqlite3'
export const DB_FILE = 'timetracker.db'
const PROJECTS_FILE = 'projects.txt'

// Matches WEEK_OPTIONS in the renderer's calendarDates.js. Main does not import from the
// renderer, and this is the only week boundary the main process needs.
const WEEK_OPTIONS = { weekStartsOn: 1 }

/**
 * Single point of truth for where the tracker's data lives: the folder picked in Settings,
 * then the env var the tracker itself honours, then the default. Nothing else in the app
 * builds a tracker path.
 */
export function resolveDataDir({
  readPreferences = getCalendarPreferences,
  env = process.env
} = {}) {
  return (
    readPreferences().timetrackerDataDir || env.TIMETRACKER_DIR || join(homedir(), '.timetracker')
  )
}

/**
 * A folder is only usable if we can actually read a database out of it. Picking the parent
 * of the real directory is the easy mistake, so the message names what was missing and where.
 */
export async function validateDataDir(dataDir) {
  if (!dataDir) throw new Error('No folder selected')

  const dbPath = join(dataDir, DB_FILE)
  try {
    await access(dbPath, fsConstants.R_OK)
  } catch {
    throw new Error(
      `No readable ${DB_FILE} in ${dataDir}. Pick the folder the tracker writes to.`
    )
  }

  return dbPath
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

// `id` is selected because a note is now editable from the calendar, and `ts` is not a key:
// two notes a second apart round to the same displayed minute, and nothing stops two notes
// sharing a timestamp outright.
function notesQuery(ids) {
  return `SELECT id, entry_id, ts, text FROM notes WHERE entry_id IN (${ids.join(',')}) ORDER BY ts;`
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

/**
 * Every status this source reports carries the path it was reading, so the renderer can name
 * the folder without a second round trip. It rides on the status rather than on an IPC of its
 * own because the strip that shows it must never disagree with the bars beside it: both come
 * out of the same fetch, so a folder change moves them together or not at all.
 */
export function createTimetrackerSource({
  runQuery,
  readProjects = async () => [],
  detect = async () => true,
  displayPath = null,
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
        statuses: [{ source: 'timetracker', ok: true, detected: false, displayPath }]
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
            displayPath,
            lastSyncedAt: new Date(nowMs).toISOString()
          }
        ]
      }
    } catch (err) {
      return {
        events: [],
        calendars: [],
        statuses: [
          { source: 'timetracker', ok: false, detected: true, displayPath, lastError: err.message }
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

/**
 * `~/.timetracker/timetracker.db` fits inline where `/Users/someone/.timetracker/…` wraps,
 * both in the Settings card and in the legend strip's hint.
 */
export function toDisplayPath(dbPath, home = homedir()) {
  return dbPath.startsWith(`${home}/`) ? `~${dbPath.slice(home.length)}` : dbPath
}

export async function fetchTimetrackerEvents(rangeStart, rangeEnd, { dataDir } = {}) {
  const dir = dataDir ?? resolveDataDir()
  const dbPath = join(dir, DB_FILE)

  const source = createTimetrackerSource({
    runQuery: createSqliteRunner(dbPath),
    readProjects: () => readProjectsFile(join(dir, PROJECTS_FILE)),
    detect: () => fileExists(dbPath),
    displayPath: toDisplayPath(dbPath)
  })

  return source(rangeStart, rangeEnd)
}

/**
 * What the Settings card needs to describe the connection: where it reads from, whether a
 * database is there, and how much is in it this week. It reads the current week explicitly
 * rather than reusing whatever range the grid happens to be showing, because the card says
 * "this week" and the grid can be on a day, a month or a year.
 *
 * This deliberately bypasses the aggregator cache: the card is opened on demand and must
 * reflect the folder that was just picked.
 */
export async function readTimetrackerStats({
  now = () => Date.now(),
  resolveDir = resolveDataDir,
  fetchEvents = fetchTimetrackerEvents
} = {}) {
  const dataDir = resolveDir()
  const anchor = new Date(now())
  const { events, calendars, statuses } = await fetchEvents(
    startOfWeek(anchor, WEEK_OPTIONS).toISOString(),
    endOfWeek(anchor, WEEK_OPTIONS).toISOString(),
    // Pass the directory we just resolved so the card cannot describe one folder while
    // reporting counts from another.
    { dataDir }
  )
  const status = statuses[0] ?? {}
  const dbPath = join(dataDir, DB_FILE)

  return {
    dataDir,
    dbPath,
    displayPath: toDisplayPath(dbPath),
    detected: status.detected !== false,
    // `calendars` already merges projects.txt with the projects named by actual entries, so
    // this is the same project count the sidebar lists.
    projectCount: calendars.length,
    sessionCount: events.length,
    lastError: status.ok === false ? (status.lastError ?? 'Could not read the tracker database') : null
  }
}
