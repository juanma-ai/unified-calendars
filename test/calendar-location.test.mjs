import test from 'node:test'
import assert from 'node:assert/strict'
import { readCalendarLocation } from '../src/renderer/src/calendarLocation.js'
test('deep links use a civil date, preserving day in western and eastern zones', () => {
  const original = process.env.TZ
  try {
    for (const zone of ['Europe/Madrid', 'America/Los_Angeles', 'Pacific/Auckland']) {
      process.env.TZ = zone
      const result = readCalendarLocation('?view=day&date=2026-09-07', 'week')
      assert.equal(result.view, 'day'); assert.equal(result.date.getDate(), 7); assert.equal(result.date.getMonth(), 8)
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
})
test('invalid dates and views fall back without Date rollover', () => {
  const today = new Date(2026, 8, 7)
  for (const value of ['2026-02-30', '2026-13-01', '2026-09-07T00:00:00Z', 'bad']) {
    const result = readCalendarLocation(`?view=bad&date=${value}`, 'month', today)
    assert.equal(result.date, today); assert.equal(result.view, 'month')
  }
})

test('a deep link stays on its civil day when browser and calendar zones differ', () => {
  const previous = process.env.TZ
  process.env.TZ = 'Pacific/Kiritimati'
  try {
    const result = readCalendarLocation('?view=day&date=2026-01-07', 'week', new Date(), 'Europe/Madrid')
    assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(result.date), '2026-01-07')
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})
