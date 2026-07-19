import assert from 'node:assert/strict'
import test from 'node:test'

import { formatWeekRange, getMondayWeek } from '../src/renderer/src/calendarDates.js'

test('builds Monday-first weeks and the PDF range label', () => {
  const { start, days } = getMondayWeek(new Date('2026-07-22T12:00:00+02:00'))

  assert.equal(start.getDay(), 1)
  assert.equal(days.length, 7)
  assert.equal(formatWeekRange(start), 'Jul 20 – Jul 26, 2026')
})
