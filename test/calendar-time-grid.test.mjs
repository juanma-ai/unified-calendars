import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDayLayout } from '../src/renderer/src/calendarTimeGrid.js'

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
  assert.equal(layout.timedEvents[1].durationMinutes, 30)
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
