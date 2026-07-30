import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear
} from 'date-fns'
import { formatWeekRange, WEEK_OPTIONS } from './calendarDates.js'

export const VIEWS = ['day', 'week', 'month', 'year', 'agenda']
export const DEFAULT_VIEW = 'week'

export const VIEW_LABELS = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  agenda: 'Agenda'
}

export function isCalendarView(value) {
  return VIEWS.includes(value)
}

// Month and agenda both work off whole calendar weeks so the month grid has no
// ragged first and last rows, and so the agenda covers everything the month grid
// can show.
function monthGridRange(anchor) {
  return {
    start: startOfWeek(startOfMonth(anchor), WEEK_OPTIONS),
    end: endOfWeek(endOfMonth(anchor), WEEK_OPTIONS)
  }
}

export function getViewRange(view, anchor) {
  switch (view) {
    case 'day':
      return { start: startOfDay(anchor), end: endOfDay(anchor) }
    case 'month':
    case 'agenda':
      return monthGridRange(anchor)
    case 'year':
      return { start: startOfYear(anchor), end: endOfYear(anchor) }
    case 'week':
    default:
      return { start: startOfWeek(anchor, WEEK_OPTIONS), end: endOfWeek(anchor, WEEK_OPTIONS) }
  }
}

export function getViewDays(view, anchor) {
  if (view === 'day') return [startOfDay(anchor)]

  const { start, end } = getViewRange(view === 'agenda' ? 'month' : view, anchor)
  return eachDayOfInterval({ start, end })
}

export function formatViewLabel(view, anchor) {
  switch (view) {
    case 'day':
      return format(anchor, 'EEE, MMM d, yyyy')
    case 'month':
    case 'agenda':
      return format(anchor, 'MMMM yyyy')
    case 'year':
      return format(anchor, 'yyyy')
    case 'week':
    default:
      return formatWeekRange(startOfWeek(anchor, WEEK_OPTIONS))
  }
}

export function navigateView(view, anchor, direction) {
  if (direction === 'today') return new Date()

  switch (view) {
    case 'day':
      return addDays(anchor, direction)
    case 'month':
    case 'agenda':
      return addMonths(anchor, direction)
    case 'year':
      return addYears(anchor, direction)
    case 'week':
    default:
      return addWeeks(anchor, direction)
  }
}

function byStart(a, b) {
  return new Date(a.start) - new Date(b.start)
}

/**
 * Buckets events into the month grid's day cells. Events are keyed by their
 * start day, matching how the week time grid places them, so a multi-day event
 * shows only on the day it begins.
 */
export function buildMonthCells(events, days, maxPerDay = Number.POSITIVE_INFINITY) {
  const sorted = [...events].sort(byStart)

  return days.map((day) => {
    const dayEvents = sorted.filter((event) => isSameDay(new Date(event.start), day))
    return {
      day,
      events: dayEvents.slice(0, maxPerDay),
      overflowCount: Math.max(0, dayEvents.length - maxPerDay)
    }
  })
}

export const YEAR_HEAT_LEVELS = 4

function dayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

/**
 * Counts events per day across the anchor's year and buckets each day into a
 * heat level. Level 0 means no events; the remaining levels split the range up
 * to the busiest day evenly, so the scale adapts to how full the year actually
 * is instead of using fixed thresholds.
 */
export function buildYearHeatmap(events, anchor) {
  const counts = new Map()
  const year = anchor.getFullYear()

  for (const event of events) {
    const start = new Date(event.start)
    if (start.getFullYear() !== year) continue
    const key = dayKey(start)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const maxCount = Math.max(0, ...counts.values())

  const months = Array.from({ length: 12 }, (_, month) => {
    const monthStart = new Date(year, month, 1)
    return {
      month,
      start: monthStart,
      days: eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) }).map((day) => {
        const count = counts.get(dayKey(day)) ?? 0
        return {
          day,
          count,
          level: count === 0 ? 0 : Math.ceil((count / maxCount) * YEAR_HEAT_LEVELS)
        }
      })
    }
  })

  return { year, maxCount, months }
}

/**
 * Groups events into chronological day sections for the agenda list. Days with
 * no events are dropped, so the list stays dense.
 */
export function buildAgendaSections(events, days) {
  const sorted = [...events].sort(byStart)

  return days
    .map((day) => ({
      day,
      events: sorted.filter((event) => isSameDay(new Date(event.start), day))
    }))
    .filter((section) => section.events.length > 0)
}
