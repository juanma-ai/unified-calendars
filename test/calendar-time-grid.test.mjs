import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDayLayout,
  getCenteredTimeScrollTop,
  getMoveResult,
  getResizeResult,
  HOUR_HEIGHT,
  MINIMUM_EVENT_MINUTES
} from '../src/renderer/src/calendarTimeGrid.js'

const day = new Date('2026-07-20T12:00:00+02:00')

test('separates all-day events and positions timed events by minute', () => {
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

  assert.deepEqual(layout.allDayEvents.map((event) => event.id), ['all-day'])
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
