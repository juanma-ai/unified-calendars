import assert from 'node:assert/strict'
import test from 'node:test'

import { createTimetrackerSource, toDisplayPath } from '../src/main/sources/timetracker.js'
import { parseProjectsFile, projectColor } from '../src/main/sources/timetrackerProjects.js'

const NOW_MS = Date.UTC(2026, 6, 26, 12, 0, 0)
const RANGE_START = new Date(Date.UTC(2026, 6, 26, 0, 0, 0)).toISOString()
const RANGE_END = new Date(Date.UTC(2026, 6, 27, 0, 0, 0)).toISOString()

const seconds = (ms) => Math.floor(ms / 1000)

/**
 * Stands in for the sqlite3 spawn: it applies the same overlap predicate the SQL does, so
 * the tests exercise the source's own mapping and grouping without a database.
 */
function fakeRunQuery({ entries = [], notes = [], onQuery } = {}) {
  return async (sql) => {
    onQuery?.(sql)

    if (sql.startsWith('SELECT id, project')) {
      const startBound = seconds(new Date(RANGE_START).getTime())
      const endBound = seconds(new Date(RANGE_END).getTime())
      return entries.filter(
        (entry) => entry.start < endBound && (entry.end ?? seconds(NOW_MS)) > startBound
      )
    }

    const ids = sql.match(/IN \(([^)]*)\)/)[1].split(',').map(Number)
    return notes.filter((note) => ids.includes(note.entry_id))
  }
}

function createSource(options = {}) {
  return createTimetrackerSource({
    runQuery: fakeRunQuery(options),
    readProjects: async () => options.projects ?? [],
    detect: async () => options.detected ?? true,
    now: () => NOW_MS
  })
}

test('a session straddling either range boundary is included, one outside is not', async () => {
  const dayBefore = seconds(Date.UTC(2026, 6, 25, 23, 0, 0))
  const dayAfter = seconds(Date.UTC(2026, 6, 27, 1, 0, 0))

  const fetch = createSource({
    entries: [
      { id: 1, project: 'certification', start: dayBefore, end: dayBefore + 7200 },
      { id: 2, project: 'certification', start: dayAfter - 7200, end: dayAfter },
      { id: 3, project: 'certification', start: seconds(Date.UTC(2026, 6, 20)), end: seconds(Date.UTC(2026, 6, 20)) + 60 }
    ]
  })

  const { events } = await fetch(RANGE_START, RANGE_END)
  assert.deepEqual(events.map((event) => event.providerEventId), ['1', '2'])
})

test('a running entry is closed at now and flagged for the renderer', async () => {
  const start = seconds(NOW_MS) - 3600

  const fetch = createSource({
    entries: [{ id: 7, project: 'certification', start, end: null }]
  })

  const [event] = (await fetch(RANGE_START, RANGE_END)).events
  assert.equal(event.isRunning, true)
  assert.equal(event.end, new Date(NOW_MS).toISOString())
  assert.equal(event.start, new Date(start * 1000).toISOString())
})

test('a finished entry converts seconds to ISO and is not flagged as running', async () => {
  const start = seconds(Date.UTC(2026, 6, 26, 10, 5, 0))
  const end = seconds(Date.UTC(2026, 6, 26, 11, 52, 0))

  const fetch = createSource({ entries: [{ id: 4, project: 'certification', start, end }] })

  const [event] = (await fetch(RANGE_START, RANGE_END)).events
  assert.equal(event.isRunning, false)
  assert.equal(event.start, '2026-07-26T10:05:00.000Z')
  assert.equal(event.end, '2026-07-26T11:52:00.000Z')
})

test('notes attach to their own entry and an entry without notes maps cleanly', async () => {
  const start = seconds(Date.UTC(2026, 6, 26, 10, 0, 0))

  const fetch = createSource({
    entries: [
      { id: 4, project: 'certification', start, end: start + 3600 },
      { id: 5, project: 'certification', start: start + 7200, end: start + 9000 }
    ],
    notes: [
      { entry_id: 4, ts: start + 60, text: 'Working on Hooks' },
      { entry_id: 5, ts: start + 7260, text: 'just testing' },
      { entry_id: 5, ts: start + 7320, text: 'rest_ensure_response?' }
    ]
  })

  const [first, second] = (await fetch(RANGE_START, RANGE_END)).events
  assert.deepEqual(first.notes.map((note) => note.text), ['Working on Hooks'])
  assert.equal(first.notes[0].ts, new Date((start + 60) * 1000).toISOString())
  assert.equal(second.notes.length, 2)

  const noNotes = createSource({ entries: [{ id: 9, project: 'admin', start, end: start + 60 }] })
  const [event] = (await noNotes(RANGE_START, RANGE_END)).events
  assert.deepEqual(event.notes, [])
})

test('an empty result set does not trigger a second query or a parse error', async () => {
  const queries = []
  const fetch = createTimetrackerSource({
    // Mirrors the real runner, which turns sqlite3's empty output into [].
    runQuery: async (sql) => {
      queries.push(sql)
      return []
    },
    readProjects: async () => ['certification'],
    now: () => NOW_MS
  })

  const result = await fetch(RANGE_START, RANGE_END)
  assert.deepEqual(result.events, [])
  assert.equal(queries.length, 1, 'no notes query when there are no entries')
  assert.equal(result.calendars.length, 1, 'projects.txt still supplies the sidebar row')
})

test('projects with no sessions in range still get a calendar, matching the event colour', async () => {
  const start = seconds(Date.UTC(2026, 6, 26, 10, 0, 0))

  const fetch = createSource({
    projects: ['certification', 'admin'],
    entries: [{ id: 4, project: 'certification', start, end: start + 3600 }]
  })

  const { events, calendars } = await fetch(RANGE_START, RANGE_END)
  assert.deepEqual(calendars.map((calendar) => calendar.calendarId).sort(), [
    'timetracker:admin',
    'timetracker:certification'
  ])

  const certification = calendars.find((c) => c.calendarId === 'timetracker:certification')
  assert.equal(
    certification.calendarDefaultColor,
    events[0].calendarDefaultColor,
    'sidebar swatch and grid block must not disagree'
  )
})

test('a project dropped from projects.txt but still present in entries keeps its row', async () => {
  const start = seconds(Date.UTC(2026, 6, 26, 10, 0, 0))

  const fetch = createSource({
    projects: ['admin'],
    entries: [{ id: 4, project: 'certification', start, end: start + 3600 }]
  })

  const { calendars } = await fetch(RANGE_START, RANGE_END)
  assert.deepEqual(calendars.map((calendar) => calendar.calendarName).sort(), [
    'admin',
    'certification'
  ])
})

test('a missing database reports ok but undetected, so the sidebar stays quiet', async () => {
  const fetch = createSource({ detected: false })
  const result = await fetch(RANGE_START, RANGE_END)

  assert.deepEqual(result.events, [])
  assert.deepEqual(result.statuses, [
    { source: 'timetracker', ok: true, detected: false, displayPath: null }
  ])
})

/**
 * The legend strip names the folder it is reading, and takes that name off the status rather
 * than off an IPC of its own. It stays on screen while a present tracker fails to read, so
 * every branch has to carry the path — an undetected tracker has none to carry.
 */
test('every status carries the path that was read, so the renderer can name the folder', async () => {
  const withPath = (options) =>
    createTimetrackerSource({
      runQuery: fakeRunQuery(options),
      detect: async () => options.detected ?? true,
      displayPath: '~/.timetracker/timetracker.db',
      now: () => NOW_MS
    })

  const [ok] = (await withPath({})(RANGE_START, RANGE_END)).statuses
  assert.equal(ok.displayPath, '~/.timetracker/timetracker.db')

  const [failed] = (
    await createTimetrackerSource({
      runQuery: async () => {
        throw new Error('sqlite3 exited with code 1')
      },
      displayPath: '~/.timetracker/timetracker.db',
      now: () => NOW_MS
    })(RANGE_START, RANGE_END)
  ).statuses
  assert.equal(failed.displayPath, '~/.timetracker/timetracker.db')

  const [undetected] = (await withPath({ detected: false })(RANGE_START, RANGE_END)).statuses
  assert.equal(undetected.displayPath, '~/.timetracker/timetracker.db')
})

test('a path under the home directory is shortened, one outside it is left alone', () => {
  assert.equal(
    toDisplayPath('/Users/someone/.timetracker/timetracker.db', '/Users/someone'),
    '~/.timetracker/timetracker.db'
  )
  assert.equal(toDisplayPath('/Volumes/work/timetracker.db', '/Users/someone'), '/Volumes/work/timetracker.db')
  // A sibling directory that merely starts with the home path is not inside it.
  assert.equal(
    toDisplayPath('/Users/someone-else/timetracker.db', '/Users/someone'),
    '/Users/someone-else/timetracker.db'
  )
})

test('a query failure on an existing database is reported as a failing source', async () => {
  const fetch = createTimetrackerSource({
    runQuery: async () => {
      throw new Error('sqlite3 exited with code 1')
    },
    now: () => NOW_MS
  })

  const [status] = (await fetch(RANGE_START, RANGE_END)).statuses
  assert.equal(status.ok, false)
  assert.equal(status.detected, true)
  assert.equal(status.lastError, 'sqlite3 exited with code 1')
})

test('projects.txt parsing skips blanks, comments and duplicates', () => {
  const projects = parseProjectsFile('certification\n\n# a comment\n  admin  \ncertification\n')
  assert.deepEqual(projects, ['certification', 'admin'])
  assert.deepEqual(parseProjectsFile(''), [])
})

test('project colours are stable and drawn from the palette', () => {
  assert.equal(projectColor('certification'), projectColor('certification'))
  assert.match(projectColor('certification'), /^#[0-9a-f]{6}$/)
  assert.notEqual(projectColor('certification'), projectColor('admin'))
})
