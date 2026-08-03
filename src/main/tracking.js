import { endOfWeek, startOfWeek } from 'date-fns'
import { parseProjectsFile } from './sources/timetrackerProjects.js'
import { fetchTimetrackerEvents, resolveDataDir } from './sources/timetracker.js'
import { createDefaultTimetrackerWriter } from './sources/timetrackerWriter.js'
import { buildTrackingState } from './trayTracking.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Matches WEEK_OPTIONS in the renderer, so "this week" means the same thing everywhere.
const WEEK_OPTIONS = { weekStartsOn: 1 }

async function readProjects(dataDir) {
  try {
    return parseProjectsFile(await readFile(join(dataDir, 'projects.txt'), 'utf8'))
  } catch {
    return []
  }
}

/**
 * The one place that mutates tracking. Every write invalidates the source cache, because
 * the aggregator's 30s TTL would otherwise happily serve a grid that predates the click.
 */
export function createTrackingController({
  // Injected rather than imported: pulling in the aggregator would drag Electron into
  // this module and make its write rules untestable in plain Node, the same reason
  // eventMutations.js stays Electron-free.
  invalidateCache = () => {},
  createWriter = createDefaultTimetrackerWriter,
  fetchEvents = fetchTimetrackerEvents,
  resolveDir = resolveDataDir,
  now = () => Date.now()
} = {}) {
  const afterWrite = () => invalidateCache('timetracker')
  // The writer is handed the directory this controller just resolved, rather than
  // resolving its own: otherwise a folder changed in Settings could leave reads and
  // writes pointing at two different databases.
  const writer = () => createWriter({ dataDir: resolveDir() })

  async function readState() {
    const dataDir = resolveDir()
    const anchor = new Date(now())
    // One week-wide read backs the running timer, today's total and the week's total, so
    // the tray can never disagree with itself.
    const { events, statuses } = await fetchEvents(
      startOfWeek(anchor, WEEK_OPTIONS).toISOString(),
      endOfWeek(anchor, WEEK_OPTIONS).toISOString(),
      { dataDir }
    )

    return buildTrackingState({
      events,
      projects: await readProjects(dataDir),
      // The same "no tracker installed" signal the sidebar and Settings read, so the tray's
      // summary section disappears for the same reason the grid's lane does.
      detected: (statuses ?? []).every((status) => status.detected !== false),
      now: now()
    })
  }

  return {
    readState,

    async start(project) {
      const result = await writer().startTracking(project)
      afterWrite()
      return result
    },

    async stop() {
      const result = await writer().stopTracking()
      afterWrite()
      return result
    },

    async addNote(text) {
      const result = await writer().addNote(text)
      afterWrite()
      return result
    },

    async addSessionNote(entryId, text) {
      const result = await writer().addNoteToEntry(entryId, text)
      afterWrite()
      return result
    },

    async updateNote(noteId, text) {
      const result = await writer().updateNote(noteId, text)
      afterWrite()
      return result
    },

    async deleteNote(noteId) {
      const result = await writer().deleteNote(noteId)
      afterWrite()
      return result
    },

    async deleteSession(entryId) {
      const result = await writer().deleteEntry(entryId)
      afterWrite()
      return result
    },

    async getRunning() {
      const entry = await writer().getRunningEntry()
      return entry ? { project: entry.project, startMs: entry.start * 1000 } : null
    }
  }
}
