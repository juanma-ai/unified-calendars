import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  readTimetrackerStats,
  resolveDataDir,
  validateDataDir
} from '../src/main/sources/timetracker.js'

const preferencesWith = (timetrackerDataDir) => () => ({ timetrackerDataDir })

async function dirWithDatabase() {
  const dir = await mkdtemp(join(tmpdir(), 'timetracker-'))
  await writeFile(join(dir, 'timetracker.db'), '')
  return dir
}

test('the stored folder wins over the env var and the default', () => {
  assert.equal(
    resolveDataDir({
      readPreferences: preferencesWith('/Volumes/work/tracker'),
      env: { TIMETRACKER_DIR: '/env/tracker' }
    }),
    '/Volumes/work/tracker'
  )
})

test('with no stored folder the env var wins over the default', () => {
  assert.equal(
    resolveDataDir({
      readPreferences: preferencesWith(null),
      env: { TIMETRACKER_DIR: '/env/tracker' }
    }),
    '/env/tracker'
  )
})

test('clearing the stored folder falls back to the default location', () => {
  assert.equal(
    resolveDataDir({ readPreferences: preferencesWith(null), env: {} }),
    join(homedir(), '.timetracker')
  )
})

test('a folder holding a readable database validates to its path', async () => {
  const dir = await dirWithDatabase()
  assert.equal(await validateDataDir(dir), join(dir, 'timetracker.db'))
})

test('a folder without a database is rejected by name', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'timetracker-empty-'))

  await assert.rejects(() => validateDataDir(dir), (error) => {
    assert.match(error.message, /No readable timetracker\.db/)
    assert.match(error.message, new RegExp(dir))
    return true
  })

  await assert.rejects(() => validateDataDir(''), /No folder selected/)
})

test('stats count this week only and describe where they came from', async () => {
  const ranges = []
  const stats = await readTimetrackerStats({
    // A Wednesday, so a Monday-based week boundary is visibly not the same day.
    now: () => Date.UTC(2026, 6, 29, 16, 42, 0),
    resolveDir: () => '/tmp/tracker',
    fetchEvents: async (rangeStart, rangeEnd) => {
      ranges.push([rangeStart, rangeEnd])
      return {
        events: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        calendars: [{ calendarId: 'timetracker:admin' }, { calendarId: 'timetracker:certification' }],
        statuses: [{ source: 'timetracker', ok: true, detected: true }]
      }
    }
  })

  assert.equal(stats.dataDir, '/tmp/tracker')
  assert.equal(stats.dbPath, '/tmp/tracker/timetracker.db')
  assert.equal(stats.detected, true)
  assert.equal(stats.projectCount, 2)
  assert.equal(stats.sessionCount, 3)
  assert.equal(stats.lastError, null)

  const [[rangeStart, rangeEnd]] = ranges
  assert.equal(new Date(rangeStart).getDay(), 1)
  assert.equal(new Date(rangeEnd).getDay(), 0)
  assert.ok(new Date(rangeStart) < new Date(rangeEnd))
})

test('stats report a missing database rather than reading as detected', async () => {
  const stats = await readTimetrackerStats({
    resolveDir: () => '/tmp/tracker',
    fetchEvents: async () => ({
      events: [],
      calendars: [],
      statuses: [{ source: 'timetracker', ok: true, detected: false }]
    })
  })

  assert.equal(stats.detected, false)
  assert.equal(stats.sessionCount, 0)
  assert.equal(stats.lastError, null)
})

test('stats surface a read failure as an error the card can show', async () => {
  const stats = await readTimetrackerStats({
    resolveDir: () => '/tmp/tracker',
    fetchEvents: async () => ({
      events: [],
      calendars: [],
      statuses: [
        { source: 'timetracker', ok: false, detected: true, lastError: 'database is locked' }
      ]
    })
  })

  assert.equal(stats.lastError, 'database is locked')
})

test('the display path shortens the home directory', async () => {
  const stats = await readTimetrackerStats({
    resolveDir: () => join(homedir(), '.timetracker'),
    fetchEvents: async () => ({
      events: [],
      calendars: [],
      statuses: [{ source: 'timetracker', ok: true, detected: true }]
    })
  })

  assert.equal(stats.displayPath, '~/.timetracker/timetracker.db')
})
