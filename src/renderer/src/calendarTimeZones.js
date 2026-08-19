import { startOfDay as startOfDayFn, endOfDay as endOfDayFn } from 'date-fns'
import { TZDate, tz, tzOffset } from '@date-fns/tz'

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
      label: `${String(current.getHours()).padStart(2, '0')}:00`
    })
    current.setHours(current.getHours() + 1)
  }

  return marks
}
