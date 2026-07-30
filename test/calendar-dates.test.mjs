import assert from 'node:assert/strict'
import test from 'node:test'
import { startOfWeek } from 'date-fns'

import { formatWeekRange, WEEK_OPTIONS } from '../src/renderer/src/calendarDates.js'

test('labels a Monday-first week range', () => {
  const start = startOfWeek(new Date('2026-07-22T12:00:00+02:00'), WEEK_OPTIONS)

  assert.equal(start.getDay(), 1)
  assert.equal(formatWeekRange(start), 'Jul 20 – Jul 26, 2026')
})
