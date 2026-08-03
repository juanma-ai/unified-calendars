import assert from 'node:assert/strict'
import test from 'node:test'

import { createTrackingController } from '../src/main/tracking.js'

const NOW = new Date(2026, 7, 3, 16, 42).getTime()

function createController({ dataDir = '/tmp/tracker-a' } = {}) {
  const invalidated = []
  const writerDirs = []
  const fetchArgs = []

  const controller = createTrackingController({
    invalidateCache: (source) => invalidated.push(source),
    createWriter: ({ dataDir: dir }) => {
      writerDirs.push(dir)
      return {
        startTracking: async (project) => ({ project }),
        stopTracking: async () => 1,
        addNote: async (text) => ({ text }),
        addNoteToEntry: async (entryId, text) => ({ entryId, text }),
        updateNote: async (noteId, text) => ({ noteId, text }),
        deleteNote: async (noteId) => ({ noteId }),
        getRunningEntry: async () => ({ id: 1, project: 'certification', start: 100 })
      }
    },
    fetchEvents: async (start, end, options) => {
      fetchArgs.push({ start, end, options })
      return { events: [] }
    },
    resolveDir: () => dataDir,
    now: () => NOW
  })

  return { controller, invalidated, writerDirs, fetchArgs }
}

test('every write invalidates only the timetracker cache', async () => {
  const { controller, invalidated } = createController()

  await controller.start('certification')
  await controller.addNote('a note')
  await controller.stop()

  assert.deepEqual(invalidated, ['timetracker', 'timetracker', 'timetracker'])
})

test('editing a session note invalidates the cache the same way starting a timer does', async () => {
  // Without this the aggregator's 30s TTL serves the old note text back to a grid that
  // has just been told the edit succeeded.
  const { controller, invalidated } = createController()

  await controller.addSessionNote(42, 'written after the fact')
  await controller.updateNote(5, 'corrected')
  await controller.deleteNote(5)

  assert.deepEqual(invalidated, ['timetracker', 'timetracker', 'timetracker'])
})

test('session note writes reach the writer with their ids intact', async () => {
  const { controller } = createController()

  assert.deepEqual(await controller.addSessionNote(42, 'a'), { entryId: 42, text: 'a' })
  assert.deepEqual(await controller.updateNote(5, 'b'), { noteId: 5, text: 'b' })
  assert.deepEqual(await controller.deleteNote(5), { noteId: 5 })
})

test('reads that do not mutate leave the cache alone', async () => {
  const { controller, invalidated } = createController()

  await controller.readState()
  await controller.getRunning()

  assert.deepEqual(invalidated, [])
})

test('the writer is given the same directory the reader resolved', async () => {
  // Reads and writes drifting onto two different databases is the failure mode here:
  // Settings can repoint the folder at any time.
  const { controller, writerDirs, fetchArgs } = createController({ dataDir: '/tmp/picked-folder' })

  await controller.readState()
  await controller.start('certification')

  assert.deepEqual(writerDirs, ['/tmp/picked-folder'])
  assert.equal(fetchArgs[0].options.dataDir, '/tmp/picked-folder')
})

test('state is read over the whole week so today and week totals share one query', async () => {
  const { controller, fetchArgs } = createController()

  await controller.readState()

  assert.equal(fetchArgs.length, 1)
  const start = new Date(fetchArgs[0].start)
  const end = new Date(fetchArgs[0].end)
  assert.equal(start.getDay(), 1, 'weeks start on Monday, as in the renderer')
  assert.ok(end - start > 6 * 24 * 60 * 60 * 1000)
})

test('the running entry is reported in milliseconds for the renderer', async () => {
  const { controller } = createController()

  assert.deepEqual(await controller.getRunning(), {
    project: 'certification',
    startMs: 100_000
  })
})
