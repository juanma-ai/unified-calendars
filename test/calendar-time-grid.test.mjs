import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDayLayout,
  getCenteredTimeScrollTop,
  getMoveResult,
  getResizeResult,
  HOUR_HEIGHT,
  MINIMUM_EVENT_MINUTES,
  MINIMUM_TRACKED_MINUTES
} from '../src/renderer/src/calendarTimeGrid.js'

const day = new Date('2026-07-20T12:00:00+02:00')

function trackedSession(overrides) {
  return {
    allDay: false,
    calendarId: 'timetracker:certification',
    calendarName: 'certification',
    source: 'timetracker',
    title: 'certification',
    ...overrides
  }
}

test('leaves all-day events out and positions timed events by minute', () => {
  const layout = buildDayLayout(
    [
      { id: 'all-day', allDay: true, start: '2026-07-20', end: '2026-07-21' },
      {
        id: 'meeting',
        allDay: false,
        start: '2026-07-20T09:00:00+02:00',
        end: '2026-07-20T10:00:00+02:00'
      },
      {
        id: 'short-meeting',
        allDay: false,
        start: '2026-07-20T10:00:00+02:00',
        end: '2026-07-20T10:05:00+02:00'
      },
      {
        id: 'reminder',
        allDay: false,
        start: '2026-07-20T11:00:00+02:00',
        end: '2026-07-20T11:00:00+02:00'
      }
    ],
    day
  )

  // All-day events span columns, so the grid builds that row for the whole week.
  assert.equal(layout.allDayEvents, undefined)
  assert.equal(layout.timedEvents.length, 3)
  assert.equal(layout.timedEvents[0].startMinutes, 540)
  assert.equal(layout.timedEvents[0].durationMinutes, 60)
  assert.equal(layout.timedEvents[1].durationMinutes, 5)
  assert.equal(layout.timedEvents[2].durationMinutes, 30)
})

test('places overlapping events into separate columns', () => {
  const layout = buildDayLayout(
    [
      {
        id: 'first',
        allDay: false,
        start: '2026-07-20T09:00:00+02:00',
        end: '2026-07-20T10:00:00+02:00'
      },
      {
        id: 'second',
        allDay: false,
        start: '2026-07-20T09:30:00+02:00',
        end: '2026-07-20T10:30:00+02:00'
      }
    ],
    day
  )

  assert.deepEqual(
    layout.timedEvents.map(({ column, columnCount }) => ({ column, columnCount })),
    [
      { column: 0, columnCount: 2 },
      { column: 1, columnCount: 2 }
    ]
  )
})

test('centers the current time in the visible time grid', () => {
  assert.equal(
    getCenteredTimeScrollTop(new Date('2026-07-20T12:00:00+02:00'), 6 * HOUR_HEIGHT),
    9 * HOUR_HEIGHT
  )
})

test('clamps current time scroll near day boundaries', () => {
  assert.equal(
    getCenteredTimeScrollTop(new Date('2026-07-20T01:00:00+02:00'), 6 * HOUR_HEIGHT),
    0
  )
  assert.equal(
    getCenteredTimeScrollTop(new Date('2026-07-20T23:30:00+02:00'), 6 * HOUR_HEIGHT),
    18 * HOUR_HEIGHT
  )
})

test('moves a timed event across days and snaps the result to the grid', () => {
  const result = getMoveResult({
    start: '2026-07-20T09:00:00+02:00',
    end: '2026-07-20T10:00:00+02:00',
    deltaDays: 2,
    deltaMinutes: 37
  })

  assert.equal(new Date(result.start).toISOString(), '2026-07-22T07:30:00.000Z')
  assert.equal(
    new Date(result.end) - new Date(result.start),
    60 * 60 * 1000,
    'duration is preserved'
  )
})

test('keeps a moved event inside its day when snapping would cross midnight', () => {
  const result = getMoveResult({
    start: '2026-07-20T23:50:00+02:00',
    end: '2026-07-21T00:20:00+02:00',
    deltaMinutes: 5
  })

  assert.equal(
    new Date(result.start).toISOString(),
    '2026-07-20T21:45:00.000Z',
    'clamped to 23:45 local instead of rolling into the next day'
  )
})

test('shifts all-day events by whole calendar dates only', () => {
  const result = getMoveResult({
    start: '2026-07-20',
    end: '2026-07-21',
    allDay: true,
    deltaDays: 3,
    deltaMinutes: 90
  })

  assert.deepEqual(result, { start: '2026-07-23', end: '2026-07-24' })
})

test('shifts all-day instants (reminders) by local calendar days', () => {
  // An all-day reminder is local midnight, which is the previous day in UTC.
  const result = getMoveResult({
    start: '2026-07-19T22:00:00.000Z',
    end: '2026-07-19T22:00:00.000Z',
    allDay: true,
    deltaDays: 1
  })

  assert.equal(new Date(result.start).toISOString(), '2026-07-20T22:00:00.000Z')
  assert.equal(result.end, result.start)
})

test('resizes each edge and never goes below the minimum duration', () => {
  const start = '2026-07-20T09:00:00+02:00'
  const end = '2026-07-20T10:00:00+02:00'

  const longer = getResizeResult({ start, end, edge: 'end', deltaMinutes: 40 })
  assert.equal(new Date(longer.end).toISOString(), '2026-07-20T08:45:00.000Z')
  assert.equal(new Date(longer.start).toISOString(), new Date(start).toISOString())

  const tooShort = getResizeResult({ start, end, edge: 'end', deltaMinutes: -55 })
  assert.equal(
    new Date(tooShort.end) - new Date(tooShort.start),
    MINIMUM_EVENT_MINUTES * 60 * 1000
  )

  const earlierStart = getResizeResult({ start, end, edge: 'start', deltaMinutes: -20 })
  assert.equal(new Date(earlierStart.start).toISOString(), '2026-07-20T06:45:00.000Z')

  const startTooLate = getResizeResult({ start, end, edge: 'start', deltaMinutes: 90 })
  assert.equal(
    new Date(startTooLate.end) - new Date(startTooLate.start),
    MINIMUM_EVENT_MINUTES * 60 * 1000
  )
})

test('lays out tracked sessions apart from the scheduled events they overlap', () => {
  const layout = buildDayLayout(
    [
      {
        id: 'meeting',
        allDay: false,
        start: '2026-07-20T10:00:00+02:00',
        end: '2026-07-20T12:00:00+02:00'
      },
      trackedSession({
        id: 'timetracker:1',
        start: '2026-07-20T10:05:00+02:00',
        end: '2026-07-20T11:52:00+02:00'
      })
    ],
    day
  )

  assert.deepEqual(layout.timedEvents.map((position) => position.event.id), ['meeting'])
  // The bar is beside the meeting in time, but it neither narrows nor shifts it.
  assert.deepEqual(
    layout.timedEvents.map(({ column, columnCount }) => ({ column, columnCount })),
    [{ column: 0, columnCount: 1 }]
  )

  assert.deepEqual(layout.trackedEvents.map((position) => position.event.id), ['timetracker:1'])
  const [bar] = layout.trackedEvents
  assert.equal(bar.startMinutes, 10 * 60 + 5)
  assert.equal(bar.durationMinutes, 107)
  assert.equal(bar.columnCount, 1)
})

test('grows an accidental sub-minute session to a bar that can be seen and hovered', () => {
  const layout = buildDayLayout(
    [
      trackedSession({
        id: 'timetracker:slip',
        start: '2026-07-20T09:00:00+02:00',
        end: '2026-07-20T09:00:09+02:00'
      })
    ],
    day
  )

  assert.equal(layout.trackedEvents[0].durationMinutes, MINIMUM_TRACKED_MINUTES)
})

test('keeps a session started just before midnight inside its column', () => {
  const layout = buildDayLayout(
    [
      trackedSession({
        id: 'timetracker:late',
        start: '2026-07-20T23:58:00+02:00',
        end: '2026-07-20T23:59:30+02:00'
      })
    ],
    day
  )

  const [bar] = layout.trackedEvents
  assert.equal(bar.durationMinutes, MINIMUM_TRACKED_MINUTES)
  // Too short to draw, so it grows upward rather than past the bottom of the day.
  assert.equal(bar.endMinutes, 24 * 60)
  assert.equal(bar.startMinutes, 24 * 60 - MINIMUM_TRACKED_MINUTES)
})

test('clips an overnight running session into both days it touches', () => {
  const running = trackedSession({
    id: 'timetracker:overnight',
    start: '2026-07-19T22:30:00+02:00',
    end: '2026-07-19T23:00:00+02:00',
    isRunning: true
  })
  const now = new Date('2026-07-20T01:15:00+02:00').getTime()

  const yesterday = buildDayLayout([running], new Date('2026-07-19T12:00:00+02:00'), { now })
  assert.equal(yesterday.trackedEvents.length, 1)
  assert.equal(yesterday.trackedEvents[0].startMinutes, 22 * 60 + 30)
  assert.equal(yesterday.trackedEvents[0].endMinutes, 24 * 60)

  // A running session is drawn to `now`, not to the end the source last wrote.
  const today = buildDayLayout([running], day, { now })
  assert.equal(today.trackedEvents.length, 1)
  assert.equal(today.trackedEvents[0].startMinutes, 0)
  assert.equal(today.trackedEvents[0].durationMinutes, 75)
})

test('splits the lane side by side if the database somehow holds overlapping sessions', () => {
  const layout = buildDayLayout(
    [
      trackedSession({
        id: 'timetracker:a',
        start: '2026-07-20T09:00:00+02:00',
        end: '2026-07-20T10:00:00+02:00'
      }),
      trackedSession({
        id: 'timetracker:b',
        start: '2026-07-20T09:30:00+02:00',
        end: '2026-07-20T10:30:00+02:00'
      })
    ],
    day
  )

  assert.deepEqual(
    layout.trackedEvents.map(({ column, columnCount }) => ({ column, columnCount })),
    [
      { column: 0, columnCount: 2 },
      { column: 1, columnCount: 2 }
    ]
  )
})

test('a timed event crossing midnight is drawn, clipped, in both columns', () => {
  const overnight = {
    id: 'overnight',
    allDay: false,
    start: '2026-07-20T22:00:00+02:00',
    end: '2026-07-21T02:00:00+02:00'
  }

  const [first] = buildDayLayout([overnight], day, { timeZone: 'Europe/Madrid' }).timedEvents
  assert.equal(first.startMinutes, 22 * 60)
  assert.equal(first.durationMinutes, 120, 'clipped at midnight')
  assert.equal(first.continuesBefore, false)
  assert.equal(first.continuesAfter, true)

  const nextDay = new Date('2026-07-21T12:00:00+02:00')
  const [second] = buildDayLayout([overnight], nextDay, { timeZone: 'Europe/Madrid' }).timedEvents
  assert.equal(second.startMinutes, 0)
  assert.equal(second.durationMinutes, 120)
  assert.equal(second.continuesBefore, true)
  assert.equal(second.continuesAfter, false)
})

test('a timed event ending at midnight stays out of the next day', () => {
  const evening = {
    id: 'evening',
    allDay: false,
    start: '2026-07-20T20:00:00+02:00',
    end: '2026-07-21T00:00:00+02:00'
  }
  const nextDay = new Date('2026-07-21T12:00:00+02:00')

  assert.equal(buildDayLayout([evening], day, { timeZone: 'Europe/Madrid' }).timedEvents.length, 1)
  assert.deepEqual(buildDayLayout([evening], nextDay, { timeZone: 'Europe/Madrid' }).timedEvents, [])
})

test('a single-day event is not flagged as continuing at either end', () => {
  const [position] = buildDayLayout(
    [
      {
        id: 'meeting',
        allDay: false,
        start: '2026-07-20T09:00:00+02:00',
        end: '2026-07-20T10:00:00+02:00'
      }
    ],
    day,
    { timeZone: 'Europe/Madrid' }
  ).timedEvents

  assert.equal(position.continuesBefore, false)
  assert.equal(position.continuesAfter, false)
})
