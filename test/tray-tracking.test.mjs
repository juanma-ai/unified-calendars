import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTrackingMenuItems,
  buildTrackingState,
  buildTrackingSummaryItems,
  formatTrackerClock,
  getTrackingTitle
} from '../src/main/trayTracking.js'

const NOW = new Date(2026, 7, 3, 16, 42).getTime()

function tracked({ project, startMinutesAgo, minutes, running = false, notes = [] }) {
  const start = NOW - startMinutesAgo * 60_000
  return {
    source: 'timetracker',
    calendarId: `timetracker:${project}`,
    calendarName: project,
    start: new Date(start).toISOString(),
    end: new Date(start + minutes * 60_000).toISOString(),
    isRunning: running,
    notes
  }
}

test('the clock is compact and zero-pads the minutes', () => {
  assert.equal(formatTrackerClock(83 * 60_000), '1:23')
  assert.equal(formatTrackerClock(5 * 60_000), '0:05')
  assert.equal(formatTrackerClock(0), '0:00')
  assert.equal(formatTrackerClock(-1), '0:00')
})

test('a running session drives the title and excludes itself from the start list', () => {
  const state = buildTrackingState({
    events: [tracked({ project: 'certification', startMinutesAgo: 72, minutes: 10, running: true })],
    projects: ['certification', 'admin'],
    now: NOW
  })

  assert.equal(state.running.project, 'certification')
  assert.equal(getTrackingTitle(state), '⏱ 1:12 certification')
  assert.deepEqual(state.startable, ['admin'], 'the running project is not offered as a start')
})

test('with nothing running there is no title, so the agenda keeps the menu bar', () => {
  const state = buildTrackingState({ projects: ['admin'], now: NOW })

  assert.equal(state.running, null)
  assert.equal(getTrackingTitle(state), null)
  assert.deepEqual(state.startable, ['admin'])
})

test('a running session counts up to now, not to the end the source recorded', () => {
  const state = buildTrackingState({
    events: [tracked({ project: 'certification', startMinutesAgo: 60, minutes: 5, running: true })],
    now: NOW
  })

  assert.equal(state.running.elapsedMs, 60 * 60_000)
})

test('totals separate today from the whole week', () => {
  const yesterday = {
    ...tracked({ project: 'admin', startMinutesAgo: 0, minutes: 30 }),
    start: new Date(NOW - 26 * 60 * 60_000).toISOString(),
    end: new Date(NOW - 26 * 60 * 60_000 + 30 * 60_000).toISOString()
  }
  const state = buildTrackingState({
    events: [tracked({ project: 'certification', startMinutesAgo: 120, minutes: 60 }), yesterday],
    now: NOW
  })

  assert.equal(state.today.total, 60 * 60_000)
  assert.equal(state.week.total, 90 * 60_000)
  // Yesterday's admin session is in the week total but must not appear in today's rows.
  assert.deepEqual(
    state.today.byProject.map((entry) => entry.project),
    ['certification']
  )
})

test('a fragmented day is still one line per project, ordered by time spent', () => {
  const state = buildTrackingState({
    events: [
      tracked({ project: 'certification', startMinutesAgo: 300, minutes: 45 }),
      tracked({ project: 'admin', startMinutesAgo: 200, minutes: 28 }),
      tracked({ project: 'certification', startMinutesAgo: 120, minutes: 62 })
    ],
    now: NOW
  })

  const items = buildTrackingSummaryItems(state)
  assert.equal(items[0].label, 'Tracked today · 2h 15m')
  assert.deepEqual(
    items.slice(1).map((item) => item.label.trim().replace(/\s+/g, ' ')),
    ['certification 1h 47m', 'admin 28m'],
    'three sessions of two projects are two rows, biggest first'
  )
  assert.ok(items.every((item) => item.enabled === false), 'the summary is not clickable')
})

test('the open session gets its own line, on top of its project total', () => {
  const state = buildTrackingState({
    events: [
      tracked({ project: 'certification', startMinutesAgo: 300, minutes: 107 }),
      tracked({ project: 'certification', startMinutesAgo: 12, minutes: 1, running: true })
    ],
    now: NOW
  })

  const labels = buildTrackingSummaryItems(state).map((item) => item.label)
  // A native Menu cannot animate, so the pulse elsewhere is a static marker here.
  assert.ok(labels.some((label) => label.includes('● certification  running · 12m')))
  // The running minutes are already inside the project's own total.
  assert.ok(labels.some((label) => label.replace(/\s+/g, ' ').includes('certification 1h 59m')))
})

test('the summary disappears rather than showing an empty heading', () => {
  const nothingToday = buildTrackingState({
    events: [
      {
        ...tracked({ project: 'admin', startMinutesAgo: 0, minutes: 30 }),
        start: new Date(NOW - 26 * 60 * 60_000).toISOString(),
        end: new Date(NOW - 26 * 60 * 60_000 + 30 * 60_000).toISOString()
      }
    ],
    now: NOW
  })
  assert.deepEqual(buildTrackingSummaryItems(nothingToday), [])

  // `detected: false` is the "no tracker installed" signal, not a failure — the same one
  // that keeps the sidebar quiet and hides the grid lane.
  const undetected = buildTrackingState({
    events: [tracked({ project: 'certification', startMinutesAgo: 60, minutes: 30 })],
    detected: false,
    now: NOW
  })
  assert.deepEqual(buildTrackingSummaryItems(undetected), [])
  assert.deepEqual(buildTrackingSummaryItems(undefined), [])
})

test('today is not repeated in the controls section that now sits above it', () => {
  const state = buildTrackingState({
    events: [tracked({ project: 'certification', startMinutesAgo: 120, minutes: 60 })],
    now: NOW
  })

  const labels = buildTrackingMenuItems(state).map((item) => item.label)
  assert.ok(labels.includes('This week: 1h'))
  assert.ok(!labels.some((label) => label?.startsWith('Today:')))
})

test('a session running past 12h is flagged rather than silently drawn', () => {
  const state = buildTrackingState({
    events: [tracked({ project: 'certification', startMinutesAgo: 13 * 60, minutes: 1, running: true })],
    now: NOW
  })

  assert.equal(state.running.isLong, true)
  const labels = buildTrackingMenuItems(state).map((item) => item.label)
  assert.ok(labels.some((label) => label?.includes('over 12h')))
})

test('the menu offers stop and note while running, and starts otherwise', () => {
  const running = buildTrackingState({
    events: [tracked({ project: 'certification', startMinutesAgo: 72, minutes: 1, running: true })],
    projects: ['certification', 'admin'],
    now: NOW
  })

  const labels = buildTrackingMenuItems(running).map((item) => item.label)
  assert.equal(labels[0], '■ Stop certification (1h 12m)')
  assert.equal(labels[1], '✎ Add note…')
  assert.ok(labels.includes('▶ admin'))
  assert.ok(!labels.includes('▶ certification'))

  const idle = buildTrackingState({ projects: ['admin'], now: NOW })
  const idleLabels = buildTrackingMenuItems(idle).map((item) => item.label)
  assert.ok(!idleLabels.some((label) => label?.startsWith('■ Stop')))
  assert.ok(!idleLabels.includes('✎ Add note…'), 'a note needs a running timer')
})

test('clicking a project or stop calls through', () => {
  const calls = []
  const state = buildTrackingState({
    events: [tracked({ project: 'certification', startMinutesAgo: 10, minutes: 1, running: true })],
    projects: ['certification', 'admin'],
    now: NOW
  })

  const items = buildTrackingMenuItems(state, {
    startTracking: (project) => calls.push(['start', project]),
    stopTracking: () => calls.push(['stop'])
  })

  items.find((item) => item.label === '▶ admin').click()
  items.find((item) => item.label?.startsWith('■ Stop')).click()
  assert.deepEqual(calls, [['start', 'admin'], ['stop']])
})

test('session notes are listed flat and truncated, never as multiple menu rows', () => {
  const state = buildTrackingState({
    events: [
      tracked({
        project: 'certification',
        startMinutesAgo: 30,
        minutes: 1,
        running: true,
        notes: [
          { ts: new Date(2026, 7, 3, 15, 41).toISOString(), text: 'line one\nline two' },
          { ts: new Date(2026, 7, 3, 16, 18).toISOString(), text: 'x'.repeat(200) }
        ]
      })
    ],
    now: NOW
  })

  const labels = buildTrackingMenuItems(state).map((item) => item.label)
  const noteLines = labels.filter((label) => label?.startsWith('    '))

  assert.equal(noteLines.length, 2, 'a multiline note is still one menu item')
  assert.ok(noteLines[0].includes('15:41  line one · line two'))
  assert.ok(noteLines[1].endsWith('…'))
  assert.ok(noteLines.every((label) => !label.includes('\n')))
})

test('with no projects at all the menu says so instead of looking broken', () => {
  const labels = buildTrackingMenuItems(buildTrackingState({ now: NOW })).map((i) => i.label)
  assert.ok(labels.some((label) => label?.includes('No projects yet')))
})
