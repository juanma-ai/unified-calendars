import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSecondaryRulerMarks,
  formatTimeZoneAbbreviation,
  formatTimeZoneOffset,
  getSystemTimeZone,
  isValidTimeZone,
  resolveTimeZone,
  startOfDayInTimeZone
} from '../src/renderer/src/calendarTimeZones.js'
import { searchCities } from '../src/renderer/src/cityTimeZones.js'

test('formatTimeZoneOffset returns signed offset with minutes', () => {
  const date = new Date('2026-07-30T12:00:00Z')
  assert.equal(formatTimeZoneOffset('Europe/Lisbon', date), 'GMT+01:00')
  assert.equal(formatTimeZoneOffset('America/New_York', date), 'GMT-04:00')
  assert.equal(formatTimeZoneOffset('Asia/Kolkata', date), 'GMT+05:30')
  assert.equal(formatTimeZoneOffset('Asia/Kathmandu', date), 'GMT+05:45')
})

test('formatTimeZoneAbbreviation returns short abbreviation', () => {
  const date = new Date('2026-07-30T12:00:00Z')
  assert.equal(formatTimeZoneAbbreviation('Europe/Lisbon', date), 'GMT+1')
  assert.equal(formatTimeZoneAbbreviation('America/New_York', date), 'EDT')
})

test('isValidTimeZone accepts IANA zones and rejects invalid strings', () => {
  assert.equal(isValidTimeZone('Europe/Lisbon'), true)
  assert.equal(isValidTimeZone('America/New_York'), true)
  assert.equal(isValidTimeZone('Not/A/Zone'), false)
  assert.equal(isValidTimeZone(''), false)
})

test('resolveTimeZone falls back to system zone for unknown zones', () => {
  const systemZone = getSystemTimeZone()
  assert.equal(resolveTimeZone('Europe/Lisbon'), 'Europe/Lisbon')
  assert.equal(resolveTimeZone('Not/A/Zone'), systemZone)
  assert.equal(resolveTimeZone(''), systemZone)
  assert.equal(resolveTimeZone(null), systemZone)
})

test('searchCities resolves city names and aliases', () => {
  assert.deepEqual(searchCities('Lisbon').map((entry) => entry.city), ['Lisbon'])
  assert.ok(searchCities('SF').some((entry) => entry.city === 'San Francisco'))
  assert.ok(searchCities('Buenos Aires').some((entry) => entry.city === 'Buenos Aires'))
})

test('searchCities ranks exact starts first', () => {
  const results = searchCities('New York')
  assert.equal(results[0].city, 'New York')
})

test('searchCities returns empty for short or empty queries', () => {
  assert.deepEqual(searchCities(''), [])
})

test('startOfDayInTimeZone returns midnight in the target zone', () => {
  const day = startOfDayInTimeZone(new Date('2026-07-30T12:00:00Z'), 'America/Los_Angeles')

  assert.equal(day.getHours(), 0)
  assert.equal(day.getMinutes(), 0)
  assert.equal(new Date(day.getTime()).toISOString(), '2026-07-30T07:00:00.000Z')
})

test('buildSecondaryRulerMarks places labels at the correct primary day offsets', () => {
  // LA midnight with NY secondary: 3am NY at the top of the grid.
  const dayStart = new Date('2026-07-30T07:00:00.000Z')
  const marks = buildSecondaryRulerMarks(dayStart, 'America/Los_Angeles', 'America/New_York')
  const first = marks[0]

  assert.equal(first.label, '03:00')
  assert.equal(first.minute, 0)
  assert.equal(marks.length, 24)
})

test('buildSecondaryRulerMarks handles half-hour offsets', () => {
  const dayStart = new Date('2026-07-30T07:00:00.000Z')
  const marks = buildSecondaryRulerMarks(dayStart, 'America/Los_Angeles', 'Asia/Kolkata')

  // Asia/Kolkata is UTC+5:30, so at LA midnight it is 13:30 same day.
  assert.equal(marks[0].label, '13:00')
  assert.equal(marks[0].minute, 30)
})
