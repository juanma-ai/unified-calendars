import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSecondaryRulerMarks,
  formatTimeZoneAbbreviation,
  formatTimeZoneOffset,
  getSystemTimeZone,
  getZoneOffsetsDiffer,
  isValidTimeZone,
  resolveTimeZone,
  startOfDayInTimeZone
} from '../src/renderer/src/calendarTimeZones.js'
import {
  formatZoneCity,
  listZoneAreas,
  listZonesByArea,
  searchCities
} from '../src/renderer/src/cityTimeZones.js'

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

test('buildSecondaryRulerMarks reports the secondary day offset', () => {
  const dayStart = new Date('2026-07-30T07:00:00.000Z')
  const marks = buildSecondaryRulerMarks(dayStart, 'America/Los_Angeles', 'Asia/Tokyo')

  // Tokyo is 16h ahead of LA in July: still the same date at LA midnight, next date by 08:00.
  assert.equal(marks[0].label, '16:00')
  assert.equal(marks[0].dayOffset, 0)
  assert.ok(marks.some((mark) => mark.label === '00:00' && mark.dayOffset === 1))
})

test('buildSecondaryRulerMarks reports a negative day offset for zones behind', () => {
  // Madrid midnight on 2026-07-30, expressed as the instant the grid actually starts at.
  const dayStart = new Date('2026-07-29T22:00:00.000Z')
  const marks = buildSecondaryRulerMarks(dayStart, 'Europe/Madrid', 'America/Los_Angeles')

  // Madrid midnight is 15:00 the previous day in LA.
  assert.equal(marks[0].label, '15:00')
  assert.equal(marks[0].dayOffset, -1)
  assert.ok(marks.some((mark) => mark.label === '00:00' && mark.dayOffset === 0))
})

test('buildSecondaryRulerMarks flags only off-the-hour zones as off-grid', () => {
  const dayStart = new Date('2026-07-30T07:00:00.000Z')
  const wholeHour = buildSecondaryRulerMarks(dayStart, 'America/Los_Angeles', 'America/New_York')
  const offGrid = buildSecondaryRulerMarks(dayStart, 'America/Los_Angeles', 'Asia/Kathmandu')

  assert.ok(wholeHour.every((mark) => mark.isOffGrid === false))
  assert.ok(offGrid.every((mark) => mark.isOffGrid === true))
})

test('getZoneOffsetsDiffer detects a DST change inside the visible range', () => {
  // US DST ends 2026-11-01 at 2am local; the EU already moved on 2026-10-25, so the gap
  // changes partway through the last day of the week — not at any day boundary.
  const dstWeek = [
    new Date('2026-10-26T00:00:00Z'),
    new Date('2026-10-28T00:00:00Z'),
    new Date('2026-11-01T00:00:00Z')
  ]
  const ordinaryWeek = [
    new Date('2026-07-27T00:00:00Z'),
    new Date('2026-07-29T00:00:00Z'),
    new Date('2026-07-31T00:00:00Z')
  ]

  assert.equal(getZoneOffsetsDiffer(dstWeek, 'Europe/Madrid', 'America/New_York'), true)
  assert.equal(getZoneOffsetsDiffer(ordinaryWeek, 'Europe/Madrid', 'America/New_York'), false)
  assert.equal(getZoneOffsetsDiffer([dstWeek[0]], 'Europe/Madrid', 'America/New_York'), false)
  // A single day that itself contains the change still counts.
  assert.equal(getZoneOffsetsDiffer([dstWeek[2]], 'Europe/Madrid', 'America/New_York'), true)
  assert.equal(getZoneOffsetsDiffer([], 'Europe/Madrid', 'America/New_York'), false)
})

test('searchCities reaches beyond the curated list into the full IANA database', () => {
  // Boise is not in CITY_TIME_ZONES; before, searching it returned nothing at all.
  const boise = searchCities('Boise')
  assert.equal(boise[0].city, 'Boise')
  assert.equal(boise[0].zone, 'America/Boise')

  assert.ok(searchCities('Halifax').some((entry) => entry.zone === 'America/Halifax'))
})

test('searchCities still ranks curated cities and aliases first', () => {
  assert.equal(searchCities('New York')[0].city, 'New York')
  assert.equal(searchCities('NYC')[0].zone, 'America/New_York')
  assert.equal(searchCities('SF')[0].zone, 'America/Los_Angeles')
  assert.equal(searchCities('Boise')[0].popular, false)
  assert.equal(searchCities('Tokyo')[0].popular, true)
})

test('searchCities matches across accents in either direction', () => {
  // The IANA id spells it Sao_Paulo; the curated entry spells it São Paulo.
  assert.ok(searchCities('sao paulo').some((entry) => entry.city === 'São Paulo'))
  assert.ok(searchCities('São Paulo').some((entry) => entry.zone === 'America/Sao_Paulo'))
  assert.ok(searchCities('bogota').some((entry) => entry.zone === 'America/Bogota'))
})

test('formatZoneCity keeps the parent segment of a nested zone', () => {
  assert.equal(formatZoneCity('America/Argentina/Salta'), 'Salta — Argentina')
  assert.equal(formatZoneCity('America/Boise'), 'Boise')
  assert.equal(formatZoneCity('Europe/Isle_of_Man'), 'Isle of Man')
  // A curated name wins, so the accents survive.
  assert.equal(formatZoneCity('America/Sao_Paulo'), 'São Paulo')
})

test('listZoneAreas covers every zone and leads with the busiest regions', () => {
  const areas = listZoneAreas()
  const total = areas.reduce((sum, area) => sum + area.count, 0)

  assert.equal(total, Intl.supportedValuesOf('timeZone').length)
  assert.deepEqual(areas.slice(0, 3).map((area) => area.label), ['Americas', 'Europe', 'Asia'])
  // Antarctica and Arctic collapse into one Polar entry rather than two thin ones.
  assert.equal(areas.filter((area) => area.label === 'Polar').length, 1)
})

test('listZonesByArea buckets an area by offset and anchors each bucket', () => {
  const july = new Date('2026-07-15T12:00:00Z')
  const groups = listZonesByArea('America', july)

  const offsets = groups.map((group) => group.offset)
  assert.deepEqual([...offsets].sort((a, b) => a - b), offsets, 'buckets run west to east')

  const find = (zone) => groups.find((group) => group.cities.some((city) => city.zone === zone))
  assert.equal(find('America/Los_Angeles').offset, -7 * 60)
  assert.equal(find('America/New_York').offset, -4 * 60)
  assert.equal(find('America/Boise').offset, -6 * 60)
  // Boise sits with Denver, so the bucket can name a city you already know.
  assert.equal(find('America/Boise').reference, 'Denver')

  const cities = find('America/New_York').cities.map((entry) => entry.city)
  assert.deepEqual(cities, [...cities].sort((a, b) => a.localeCompare(b)))
})
