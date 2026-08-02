import { addDays, addMinutes, differenceInMinutes, isSameDay, startOfDay } from 'date-fns'
import { effectiveEnd } from './trackedTime.js'

export const HOUR_HEIGHT = 64
export const MINIMUM_EVENT_MINUTES = 30
export const SNAP_MINUTES = 15
// The tracked lane, in px: a 22px strip pinned to the right edge of a day column, with
// the bar centred in it. Kept here rather than only in CSS because the layout maths
// below has to know the lane exists.
export const TRACKED_LANE_WIDTH = 22
export const TRACKED_BAR_WIDTH = 14
// The tracker records seconds, so a mis-click leaves a 9-second session behind. Floored
// at one minute it draws as a 1px sliver nobody can hover; six minutes is ~6px.
export const MINIMUM_TRACKED_MINUTES = 6
const MINUTES_PER_DAY = 24 * 60
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60_000

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

export function isTrackedEvent(event) {
  return event.source === 'timetracker'
}

/**
 * A tracked bar's geometry. Unlike `timedPosition` this keeps fractional minutes — a bar
 * is pure duration, so rounding it to whole minutes is a visible lie at hour height 64 —
 * and it reads the end through `effectiveEnd`, so a running session keeps growing between
 * source refreshes. A session that started yesterday or runs past midnight is clipped to
 * this day; a session too short to see is grown to `MINIMUM_TRACKED_MINUTES`, upward when
 * that would otherwise push it past midnight.
 */
function trackedPosition(event, day, now) {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  const eventStart = new Date(event.start)
  const eventEnd = new Date(effectiveEnd(event, now))
  const clampedStart = eventStart < dayStart ? dayStart : eventStart
  const clampedEnd = eventEnd > dayEnd ? dayEnd : eventEnd
  const rawMinutes = Math.max(0, (clampedEnd.getTime() - clampedStart.getTime()) / MINUTE_MS)
  const durationMinutes = Math.max(MINIMUM_TRACKED_MINUTES, rawMinutes)
  const startMinutes = clamp(
    (clampedStart.getTime() - dayStart.getTime()) / MINUTE_MS,
    0,
    MINUTES_PER_DAY - durationMinutes
  )

  return {
    event,
    startMinutes,
    durationMinutes,
    endMinutes: startMinutes + durationMinutes,
    column: 0,
    columnCount: 1
  }
}

function overlapsDay(event, day, now) {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  return new Date(event.start) < dayEnd && new Date(effectiveEnd(event, now)) > dayStart
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

/**
 * Buckets a day's events into the three things the grid draws: the all-day row, the
 * scheduled events that share the column, and the tracked bars in the lane. Tracked
 * sessions are pulled out *before* the overlap columns are assigned, so a bar can never
 * widen, narrow or shift a scheduled event, nor the other way round. The lane runs
 * through the same overlap pass only as a safety net: the tracker keeps one timer at a
 * time, so overlapping rows mean a damaged database, and side-by-side slivers beat bars
 * hidden behind each other.
 *
 * Selection happens here rather than in the component: a scheduled event belongs to the
 * day it starts on, but a tracked session belongs to every day it touches, or an
 * overnight session would vanish from today's column at midnight.
 */
export function buildDayLayout(events, day, { now = Date.now() } = {}) {
  const scheduled = events.filter(
    (event) => !isTrackedEvent(event) && isSameDay(new Date(event.start), day)
  )
  const allDayEvents = scheduled.filter((event) => event.allDay)
  const timedEvents = assignOverlapColumns(
    scheduled.filter((event) => !event.allDay).map((event) => timedPosition(event, day))
  )
  const trackedEvents = assignOverlapColumns(
    events
      .filter((event) => isTrackedEvent(event) && !event.allDay && overlapsDay(event, day, now))
      .map((event) => trackedPosition(event, day, now))
  )

  return { allDayEvents, timedEvents, trackedEvents }
}
