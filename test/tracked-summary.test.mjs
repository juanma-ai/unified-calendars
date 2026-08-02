import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTrackedSummary, trackedMsByCalendar } from '../src/renderer/src/trackedSummary.js'

const NOW = Date.UTC(2026, 7, 2, 16, 0, 0)
const HOUR = 60 * 60 * 1000

function tracked({ project = 'certification', startHoursAgo, hours = 1, running = false }) {
  const start = NOW - startHoursAgo * HOUR

  return {
    source: 'timetracker',
    calendarId: `timetracker:${project}`,
    calendarName: project,
    start: new Date(start).toISOString(),
    end: new Date(start + hours * HOUR).toISOString(),
    ...(running ? { isRunning: true } : {})
  }
}

const COLORS = {
  'timetracker:certification': '#00875a',
  'timetracker:admin': '#926300'
}

test('segments are proportional and sum to 100%', () => {
  const summary = buildTrackedSummary(
    [
      tracked({ project: 'certification', startHoursAgo: 8, hours: 3 }),
      tracked({ project: 'admin', startHoursAgo: 4, hours: 1 })
    ],
    COLORS,
    NOW
  )

  assert.equal(summary.totalMs, 4 * HOUR)
  assert.deepEqual(
    summary.segments.map((segment) => [segment.project, segment.percent, segment.color]),
    [
      ['certification', 75, '#00875a'],
      ['admin', 25, '#926300']
    ]
  )
  assert.equal(
    summary.segments.reduce((sum, segment) => sum + segment.percent, 0),
    100
  )
})

test('a single project takes the whole bar', () => {
  const summary = buildTrackedSummary([tracked({ startHoursAgo: 2, hours: 2 })], COLORS, NOW)

  assert.equal(summary.segments.length, 1)
  assert.equal(summary.segments[0].percent, 100)
})

test('a project the caller filtered out is absent from the total and the bar', () => {
  const all = [
    tracked({ project: 'certification', startHoursAgo: 8, hours: 3 }),
    tracked({ project: 'admin', startHoursAgo: 4, hours: 1 })
  ]
  const visibleOnly = all.filter((event) => event.calendarId !== 'timetracker:admin')

  const summary = buildTrackedSummary(visibleOnly, COLORS, NOW)

  assert.equal(summary.totalMs, 3 * HOUR)
  assert.deepEqual(
    summary.segments.map((segment) => segment.project),
    ['certification']
  )
})

test('a running session counts up to now and is reported on its own', () => {
  const summary = buildTrackedSummary(
    [
      tracked({ project: 'certification', startHoursAgo: 8, hours: 4 }),
      // Open session: its recorded end is ignored in favour of `now`.
      tracked({ project: 'certification', startHoursAgo: 2, hours: 0, running: true })
    ],
    COLORS,
    NOW
  )

  assert.equal(summary.totalMs, 6 * HOUR)
  // The running line reports the open session alone, not the project's 6h for the range.
  assert.deepEqual(summary.running, {
    calendarId: 'timetracker:certification',
    project: 'certification',
    color: '#00875a',
    ms: 2 * HOUR
  })
})

test('nothing tracked yields an empty summary rather than a divide by zero', () => {
  const summary = buildTrackedSummary([], COLORS, NOW)

  assert.deepEqual(summary, { totalMs: 0, segments: [], running: null })
})

test('non-tracker events are ignored and unknown projects fall back to a grey swatch', () => {
  const summary = buildTrackedSummary(
    [
      { source: 'google', calendarId: 'google:work', calendarName: 'Work', start: 0, end: HOUR },
      tracked({ project: 'unified-calendars', startHoursAgo: 1, hours: 1 })
    ],
    COLORS,
    NOW
  )

  assert.equal(summary.totalMs, HOUR)
  assert.equal(summary.segments[0].color, '#757575')
})

test('trackedMsByCalendar totals each project for its sidebar row', () => {
  const durations = trackedMsByCalendar(
    [
      tracked({ project: 'certification', startHoursAgo: 8, hours: 3 }),
      tracked({ project: 'certification', startHoursAgo: 4, hours: 1 }),
      tracked({ project: 'admin', startHoursAgo: 2, hours: 1 })
    ],
    NOW
  )

  assert.deepEqual(durations, {
    'timetracker:certification': 4 * HOUR,
    'timetracker:admin': HOUR
  })
})
