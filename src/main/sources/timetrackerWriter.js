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

function toNoteId(value) {
  if (!Number.isInteger(value)) throw new Error(`Invalid note id: ${value}`)
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

  async function getEntry(entryId) {
    const rows = await runQuery(
      `SELECT id, project, start, end FROM entries WHERE id = ${toEntryId(entryId)};`
    )
    return rows[0] ?? null
  }

  /**
   * A note added to a session that finished hours ago must not be stamped with the current
   * time: it would sort after every other note and, in the markdown mirror, land under
   * today's date heading rather than the day the work happened. So the clock is clamped
   * into the session's own span. A running session has no end, so only the floor applies.
   */
  function noteTimestampFor(entry) {
    const seconds = toSeconds(now())
    const floored = Math.max(seconds, entry.start)
    return entry.end === null || entry.end === undefined ? floored : Math.min(floored, entry.end)
  }

  async function writeNote(entry, text) {
    const body = requireText(text, 'note')
    const seconds = noteTimestampFor(entry)

    await runQuery(
      `INSERT INTO notes (entry_id, ts, text) VALUES (${toEntryId(entry.id)}, ${seconds}, ${quote(body)});`
    )
    // The markdown mirror is a second, app-independent record of the same note. It is
    // written after the row lands so a mirror failure cannot lose the note itself.
    await appendNote(entry.project, seconds, body)

    return { entryId: entry.id, project: entry.project, ts: seconds, text: body }
  }

  async function addNote(text) {
    // Validate before the SELECT so an empty note never costs a query — the tray path has
    // always behaved that way and the tests pin it.
    requireText(text, 'note')
    const entry = await getRunningEntry()
    if (!entry) throw new Error('No timer running — start one before adding a note.')

    return writeNote(entry, text)
  }

  async function addNoteToEntry(entryId, text) {
    requireText(text, 'note')
    const entry = await getEntry(entryId)
    if (!entry) throw new Error(`No tracked session with id ${entryId}`)

    return writeNote(entry, text)
  }

  // Editing and deleting touch the database only. The markdown mirror is append-only by
  // design — it is the file the retired SwiftBar plugin wrote, and rewriting a bullet in
  // place risks the seam that timetrackerNotes.js exists to avoid. The database is the
  // record the calendar reads; the mirror is a log of what was typed when.
  async function updateNote(noteId, text) {
    const body = requireText(text, 'note')
    await runQuery(`UPDATE notes SET text = ${quote(body)} WHERE id = ${toNoteId(noteId)};`)
    return { noteId, text: body }
  }

  async function deleteNote(noteId) {
    await runQuery(`DELETE FROM notes WHERE id = ${toNoteId(noteId)};`)
    return { noteId }
  }

  // A hard delete, not a hide: the session must leave every total, not just the grid.
  // The mirror keeps its bullets for the same reason note edits leave it alone — it is a
  // log of what was typed, and the database is what the calendar reads.
  async function deleteEntry(entryId) {
    const id = toEntryId(entryId)
    const entry = await getEntry(id)
    if (!entry) throw new Error(`No tracked session with id ${entryId}`)

    // Deleting the running session is allowed, but stop it first — otherwise anything
    // that already asked for the running entry is left pointing at a deleted row.
    if (entry.end === null || entry.end === undefined) await stopTracking()

    // Notes first so no note row ever outlives its entry, in one statement so a single
    // sqlite3 spawn covers both.
    await runQuery(`DELETE FROM notes WHERE entry_id = ${id}; DELETE FROM entries WHERE id = ${id};`)
    return { entryId: id, project: entry.project }
  }

  return {
    getRunningEntry,
    getEntry,
    startTracking,
    stopTracking,
    addNote,
    addNoteToEntry,
    updateNote,
    deleteNote,
    deleteEntry
  }
}

export function createDefaultTimetrackerWriter({ dataDir } = {}) {
  const dir = dataDir ?? resolveDataDir()
  return createTimetrackerWriter({
    runQuery: createSqliteWriteRunner(join(dir, DB_FILE)),
    appendNote: createNoteMirror({ notesDir: join(dir, NOTES_DIR) })
  })
}
