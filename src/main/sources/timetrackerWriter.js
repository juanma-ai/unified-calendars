import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createNoteMirror, NOTES_DIR } from '../timetrackerNotes.js'
import { DB_FILE, resolveDataDir } from './timetracker.js'

const SQLITE_PATH = '/usr/bin/sqlite3'

// The SwiftBar tracker used node:sqlite, which Electron 33's Node 20 does not have. Writes
// therefore go through the same sqlite3 CLI the read path uses, minus -readonly.
//
// The CLI has no bind parameters, so every string is interpolated — which makes `quote` a
// correctness requirement rather than a nicety. SQL literals escape a single quote by
// doubling it; nothing else needs escaping inside one, and because the SQL is passed to
// spawn as an argv entry there is no shell to escape for on top.
export function quote(value) {
  if (typeof value !== 'string') throw new Error(`Expected a string, got ${typeof value}`)
  // argv strings are NUL-terminated, so a NUL byte would silently truncate the statement.
  if (value.includes('\u0000')) throw new Error('Text cannot contain a NUL byte')
  return `'${value.replace(/'/g, "''")}'`
}

function toSeconds(ms) {
  if (!Number.isFinite(ms)) throw new Error(`Invalid timestamp: ${ms}`)
  return Math.floor(ms / 1000)
}

function toEntryId(value) {
  if (!Number.isInteger(value)) throw new Error(`Invalid entry id: ${value}`)
  return value
}

function requireText(value, label) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`A ${label} is required`)
  return text
}

export function createSqliteWriteRunner(dbPath) {
  return (sql) =>
    new Promise((resolve, reject) => {
      // The plugin is deprecated but may still be installed, so tolerate a moment of
      // contention rather than failing the click. It has to be the `.timeout` dot-command
      // rather than `PRAGMA busy_timeout`: the pragma is a statement that returns a row,
      // so under -json it prepends its own array and the real result no longer parses.
      const child = spawn(SQLITE_PATH, ['-json', '-cmd', '.timeout 3000', dbPath, sql])
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
          resolve(JSON.parse(stdout.trim() || '[]'))
        } catch (error) {
          reject(new Error(`Failed to parse sqlite3 output: ${error.message}`))
        }
      })
    })
}

export function createTimetrackerWriter({ runQuery, appendNote, now = () => Date.now() }) {
  async function getRunningEntry() {
    const rows = await runQuery(
      'SELECT id, project, start FROM entries WHERE end IS NULL ORDER BY id DESC LIMIT 1;'
    )
    return rows[0] ?? null
  }

  async function stopTracking() {
    const seconds = toSeconds(now())
    await runQuery(`UPDATE entries SET end = ${seconds} WHERE end IS NULL;`)
    return seconds
  }

  async function startTracking(project) {
    const name = requireText(project, 'project')
    // Only one timer runs at a time. This is the invariant the whole feature rests on:
    // it is why the grid lane needs no overlap handling.
    await stopTracking()

    const seconds = toSeconds(now())
    await runQuery(
      `INSERT INTO entries (project, start) VALUES (${quote(name)}, ${seconds});`
    )
    return { project: name, start: seconds }
  }

  async function addNote(text) {
    const body = requireText(text, 'note')
    const entry = await getRunningEntry()
    if (!entry) throw new Error('No timer running — start one before adding a note.')

    const seconds = toSeconds(now())
    await runQuery(
      `INSERT INTO notes (entry_id, ts, text) VALUES (${toEntryId(entry.id)}, ${seconds}, ${quote(body)});`
    )
    // The markdown mirror is a second, app-independent record of the same note. It is
    // written after the row lands so a mirror failure cannot lose the note itself.
    await appendNote(entry.project, seconds, body)

    return { entryId: entry.id, project: entry.project, ts: seconds, text: body }
  }

  return { getRunningEntry, startTracking, stopTracking, addNote }
}

export function createDefaultTimetrackerWriter({ dataDir } = {}) {
  const dir = dataDir ?? resolveDataDir()
  return createTimetrackerWriter({
    runQuery: createSqliteWriteRunner(join(dir, DB_FILE)),
    appendNote: createNoteMirror({ notesDir: join(dir, NOTES_DIR) })
  })
}
