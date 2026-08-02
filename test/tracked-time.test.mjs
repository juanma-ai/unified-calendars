import assert from 'node:assert/strict'
import test from 'node:test'

import {
  durationMs,
  effectiveEnd,
  formatDuration,
  isRunning,
  totalTrackedMs,
  totalsByProject
} from '../src/renderer/src/trackedTime.js'

const NOW = Date.UTC(2026, 7, 1, 16, 0, 0)

function tracked({ project = 'certification', start, end, running = false }) {
  return {
    source: 'timetracker',
    calendarId: `timetracker:${project}`,
    calendarName: project,
    start: new Date(start).toISOString(),
    end: new Date(end ?? start).toISOString(),
    isRunning: running
  }
}

test('durations read at minute resolution and drop empty units', () => {
  assert.equal(formatDuration(107 * 60_000), '1h 47m')
  assert.equal(formatDuration(30 * 60_000), '30m')
  assert.equal(formatDuration(2 * 60 * 60_000), '2h')
  assert.equal(formatDuration(9_000), '0m', 'a nine-second session is not negative or blank')
  assert.equal(formatDuration(-5_000), '0m')
})

test('a finished session ends where the source said, a running one ends now', () => {
  const finished = tracked({ start: NOW - 3_600_000, end: NOW - 1_800_000 })
  assert.equal(isRunning(finished), false)
  assert.equal(effectiveEnd(finished, NOW), NOW - 1_800_000)

  // The source bakes in the end it read 30s ago; the renderer advances it instead of
  // refetching, so the elapsed counter ticks between refreshes.
  const running = tracked({ start: NOW - 3_600_000, end: NOW - 3_000_000, running: true })
  assert.equal(effectiveEnd(running, NOW), NOW)
  assert.equal(durationMs(running, NOW), 3_600_000)
})

test('a running session that somehow starts in the future never reads as negative', () => {
  const running = tracked({ start: NOW + 600_000, end: NOW + 600_000, running: true })
  assert.equal(durationMs(running, NOW), 0)
})

test('totals group by project, descending, and count a running session up to now', () => {
  const totals = totalsByProject(
    [
      tracked({ project: 'admin', start: NOW - 3_600_000, end: NOW - 1_800_000 }),
      tracked({ project: 'certification', start: NOW - 7_200_000, end: NOW - 3_600_000 }),
      tracked({ project: 'certification', start: NOW - 720_000, end: NOW - 720_000, running: true }),
      { source: 'google', title: 'Standup', start: new Date(NOW).toISOString() }
    ],
    NOW
  )

  assert.deepEqual(
    totals.map((entry) => [entry.project, formatDuration(entry.ms), entry.running]),
    [
      ['certification', '1h 12m', true],
      ['admin', '30m', false]
    ]
  )
  assert.equal(formatDuration(totalTrackedMs([], NOW)), '0m')
})

test('totals ignore non-tracked events, so they always match what is on screen', () => {
  const total = totalTrackedMs(
    [
      { source: 'google', start: new Date(NOW - 3_600_000).toISOString(), end: new Date(NOW).toISOString() },
      tracked({ start: NOW - 1_800_000, end: NOW })
    ],
    NOW
  )

  assert.equal(formatDuration(total), '30m')
})
