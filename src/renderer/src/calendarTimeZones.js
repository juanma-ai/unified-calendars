import { startOfDay as startOfDayFn, endOfDay as endOfDayFn } from 'date-fns'
import { TZDate, tz, tzOffset } from '@date-fns/tz'
import { formatZoneCity } from './cityTimeZones.js'

// How many secondary zones the hour gutter can carry before it starts eating the day
// columns. Lives here so the grid that renders them and the settings that add them cannot
// drift apart on the number.
export const MAX_SECONDARY_ZONES = 2

export function getSystemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function isValidTimeZone(timeZone) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone })
    return true
  } catch {
    return false
  }
}

export function resolveTimeZone(timeZone) {
  if (timeZone && isValidTimeZone(timeZone)) return timeZone
  return getSystemTimeZone()
}

export function toZonedDate(date, timeZone) {
  return new TZDate(date.getTime(), timeZone)
}

export function startOfDayInTimeZone(date, timeZone) {
  const tzDate = toZonedDate(date, timeZone)
  return startOfDayFn(tzDate, { in: tz(timeZone) })
}

export function endOfDayInTimeZone(date, timeZone) {
  const tzDate = toZonedDate(date, timeZone)
  return endOfDayFn(tzDate, { in: tz(timeZone) })
}

export function formatTimeZoneOffset(timeZone, date) {
  const offsetMinutes = tzOffset(timeZone, date)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const hours = Math.floor(Math.abs(offsetMinutes) / 60)
  const minutes = Math.abs(offsetMinutes) % 60
  const minutesPart = minutes ? `:${String(minutes).padStart(2, '0')}` : ':00'
  return `GMT${sign}${String(hours).padStart(2, '0')}${minutesPart}`
}

export function formatTimeZoneReference(timeZone, date) {
  const offsetMinutes = tzOffset(timeZone, date)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const hours = Math.floor(Math.abs(offsetMinutes) / 60)
  const minutes = Math.abs(offsetMinutes) % 60
  const minutesPart = minutes ? `:${String(minutes).padStart(2, '0')}` : ''
  return `UTC${sign}${hours}${minutesPart}`
}

// What to call a zone on screen: the city the user picked, else the city we know for that
// zone, else the last segment of the IANA id. Never the raw `Europe/Madrid`.
export function formatZoneName(zone, city) {
  return city ?? formatZoneCity(zone)
}

export function formatTimeZoneLabel(timeZone, city, date) {
  const reference = formatTimeZoneReference(timeZone, date)
  return city ? `${reference} (${city})` : reference
}

export function formatTimeZoneAbbreviation(timeZone, date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short'
  })
  const parts = formatter.formatToParts(date)
  return parts.find((part) => part.type === 'timeZoneName').value
}

export function getTimeZoneOffsetMinutes(timeZone, date) {
  return tzOffset(timeZone, date)
}

export function buildSecondaryRulerMarks(primaryDay, primaryZone, secondaryZone) {
  const dayStart = toZonedDate(primaryDay, primaryZone)
  const dayEnd = endOfDayInTimeZone(dayStart, primaryZone)
  dayEnd.setMilliseconds(dayEnd.getMilliseconds() + 1)

  const startSecondary = toZonedDate(dayStart, secondaryZone)
  const endSecondary = toZonedDate(dayEnd, secondaryZone)
  // The primary day the column is labelling, as a plain YYYY-MM-DD in the primary zone.
  const primaryDayNumber = getDayNumber(dayStart)

  const current = toZonedDate(startSecondary, secondaryZone)
  current.setMinutes(0, 0, 0)
  current.setMilliseconds(0)
  if (current < startSecondary) {
    current.setHours(current.getHours() + 1)
  }

  const marks = []
  while (current < endSecondary) {
    const minute = Math.round((current.getTime() - dayStart.getTime()) / 60_000)
    marks.push({
      minute,
      label: `${String(current.getHours()).padStart(2, '0')}:00`,
      // How far the secondary calendar date has run ahead of, or behind, the primary one —
      // the whole reason a second column is worth its width.
      dayOffset: getDayNumber(current) - primaryDayNumber,
      // Whole-hour offsets land the mark on a line the grid already draws; only the
      // 5:30/5:45/9:30 zones need a rule of their own.
      isOffGrid: minute % 60 !== 0
    })
    current.setHours(current.getHours() + 1)
  }

  return marks
}

// Days since the epoch in the date's own zone, so two zoned dates can be compared as
// calendar days without either one's clock time getting in the way.
function getDayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

// True when the primary↔secondary gap is not the same across the range on screen — one
// gutter cannot be right for all of it, so the column says so rather than lying quietly.
// Each day is sampled at both ends: a clock change lands at 2am or 3am local, so looking
// only at day starts misses the day it actually happens on.
export function getZoneOffsetsDiffer(days, primaryZone, secondaryZone) {
  if (days.length === 0) return false

  const gapAt = (date) =>
    getTimeZoneOffsetMinutes(secondaryZone, date) - getTimeZoneOffsetMinutes(primaryZone, date)
  const gaps = days.flatMap((day) => [
    gapAt(day),
    gapAt(new Date(day.getTime() + 23 * 60 * 60 * 1000))
  ])

  return gaps.some((gap) => gap !== gaps[0])
}
