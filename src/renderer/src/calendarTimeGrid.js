import { addDays, addMinutes, differenceInMinutes, startOfDay } from 'date-fns'

export const HOUR_HEIGHT = 64
export const MINIMUM_EVENT_MINUTES = 30
export const SNAP_MINUTES = 15
const MINUTES_PER_DAY = 24 * 60
const DAY_MS = 24 * 60 * 60 * 1000

export function snapToInterval(minutes, interval = SNAP_MINUTES) {
  return Math.round(minutes / interval) * interval
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// Google all-day boundaries are plain calendar dates, which parse at UTC midnight:
// shifting them in UTC keeps them exact across DST. All-day reminders are instants
// at local midnight instead, so those shift by local calendar days.
function shiftAllDayValue(value, deltaDays, dateOnly) {
  if (dateOnly) {
    return new Date(new Date(value).getTime() + deltaDays * DAY_MS).toISOString().slice(0, 10)
  }
  return addDays(new Date(value), deltaDays).toISOString()
}

/**
 * New start/end for an event dragged by `deltaDays` columns and `deltaMinutes`
 * vertically. Duration is preserved; the resulting start snaps to the grid and
 * stays inside its day.
 */
export function getMoveResult({ start, end, allDay = false, deltaDays = 0, deltaMinutes = 0 }) {
  const startDate = new Date(start)
  const endDate = new Date(end ?? start)
  const durationMs = Math.max(0, endDate.getTime() - startDate.getTime())

  if (allDay) {
    const dateOnly = DATE_ONLY.test(start)
    return {
      start: shiftAllDayValue(startDate, deltaDays, dateOnly),
      end: shiftAllDayValue(new Date(startDate.getTime() + durationMs), deltaDays, dateOnly)
    }
  }

  const shifted = addMinutes(addDays(startDate, deltaDays), deltaMinutes)
  const dayStart = startOfDay(shifted)
  const minutesOfDay = clamp(
    snapToInterval(differenceInMinutes(shifted, dayStart)),
    0,
    MINUTES_PER_DAY - SNAP_MINUTES
  )
  const nextStart = addMinutes(dayStart, minutesOfDay)

  return {
    start: nextStart.toISOString(),
    end: new Date(nextStart.getTime() + durationMs).toISOString()
  }
}

/**
 * New start/end for an event whose top (`edge: 'start'`) or bottom
 * (`edge: 'end'`) was dragged by `deltaMinutes`. The moved edge snaps to the
 * grid and the event never gets shorter than MINIMUM_EVENT_MINUTES.
 */
export function getResizeResult({ start, end, edge, deltaMinutes }) {
  const startDate = new Date(start)
  const endDate = new Date(end ?? start)
  const dayStart = startOfDay(startDate)

  if (edge === 'start') {
    const shifted = addMinutes(startDate, deltaMinutes)
    const snapped = snapToInterval(differenceInMinutes(shifted, dayStart))
    const latest = differenceInMinutes(endDate, dayStart) - MINIMUM_EVENT_MINUTES
    const nextStart = addMinutes(dayStart, clamp(snapped, 0, latest))
    return { start: nextStart.toISOString(), end: endDate.toISOString() }
  }

  const shifted = addMinutes(endDate, deltaMinutes)
  const snapped = snapToInterval(differenceInMinutes(shifted, dayStart))
  const earliest = differenceInMinutes(startDate, dayStart) + MINIMUM_EVENT_MINUTES
  const nextEnd = addMinutes(dayStart, clamp(snapped, earliest, MINUTES_PER_DAY))
  return { start: startDate.toISOString(), end: nextEnd.toISOString() }
}

export function getCenteredTimeScrollTop(date, viewportHeight) {
  const currentMinutes = date.getHours() * 60 + date.getMinutes()
  const currentTop = (currentMinutes / 60) * HOUR_HEIGHT
  const gridHeight = 24 * HOUR_HEIGHT
  const maxScrollTop = Math.max(0, gridHeight - viewportHeight)

  return Math.min(Math.max(0, currentTop - viewportHeight / 2), maxScrollTop)
}

function timedPosition(event, day) {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  const eventStart = new Date(event.start)
  const rawEnd = new Date(event.end ?? event.start)
  const eventEnd = rawEnd > eventStart
    ? rawEnd
    : new Date(eventStart.getTime() + MINIMUM_EVENT_MINUTES * 60_000)
  const clampedStart = eventStart < dayStart ? dayStart : eventStart
  const clampedEnd = eventEnd > dayEnd ? dayEnd : eventEnd
  const startMinutes = Math.max(0, differenceInMinutes(clampedStart, dayStart))
  const durationMinutes = Math.max(1, differenceInMinutes(clampedEnd, clampedStart))

  return {
    event,
    startMinutes,
    durationMinutes,
    endMinutes: startMinutes + durationMinutes,
    column: 0,
    columnCount: 1
  }
}

function assignOverlapColumns(events) {
  const sorted = [...events].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.durationMinutes - a.durationMinutes
  )
  let group = []
  let groupEnd = -1

  const finishGroup = () => {
    if (group.length === 0) return
    const columnCount = Math.max(...group.map((item) => item.column)) + 1
    for (const item of group) item.columnCount = columnCount
  }

  for (const item of sorted) {
    if (item.startMinutes >= groupEnd) {
      finishGroup()
      group = []
      groupEnd = -1
    }

    const activeColumns = new Set(
      group
        .filter((other) => other.endMinutes > item.startMinutes)
        .map((other) => other.column)
    )
    let column = 0
    while (activeColumns.has(column)) column += 1
    item.column = column
    group.push(item)
    groupEnd = Math.max(groupEnd, item.endMinutes)
  }

  finishGroup()
  return sorted
}

export function buildDayLayout(events, day) {
  const allDayEvents = events.filter((event) => event.allDay)
  const timedEvents = assignOverlapColumns(
    events.filter((event) => !event.allDay).map((event) => timedPosition(event, day))
  )

  return { allDayEvents, timedEvents }
}
