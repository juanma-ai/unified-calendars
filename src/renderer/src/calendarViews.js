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
import { totalsByProject } from './trackedTime.js'

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

// The agenda is a forward-looking list rather than a grid, so it runs from the
// anchor day itself instead of snapping back to a month or week boundary. With
// the anchor on today that puts today first, which is the whole point of it.
export const AGENDA_DAYS = 30

function agendaRange(anchor) {
  return {
    start: startOfDay(anchor),
    end: endOfDay(addDays(anchor, AGENDA_DAYS - 1))
  }
}

// The month grid works off whole calendar weeks so it has no ragged first and
// last rows.
function monthGridRange(anchor) {
  return {
    start: startOfWeek(startOfMonth(anchor), WEEK_OPTIONS),
    end: endOfWeek(endOfMonth(anchor), WEEK_OPTIONS)
  }
}

function formatDayRange({ start, end }) {
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
}

export function getViewRange(view, anchor) {
  switch (view) {
    case 'day':
      return { start: startOfDay(anchor), end: endOfDay(anchor) }
    case 'agenda':
      return agendaRange(anchor)
    case 'month':
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

  const { start, end } = getViewRange(view, anchor)
  return eachDayOfInterval({ start, end })
}

export function formatViewLabel(view, anchor) {
  switch (view) {
    case 'day':
      return format(anchor, 'EEE, MMM d, yyyy')
    case 'agenda':
      return formatDayRange(agendaRange(anchor))
    case 'month':
      return format(anchor, 'MMMM yyyy')
    case 'year':
      return format(anchor, 'yyyy')
    case 'week':
    default:
      return formatWeekRange(startOfWeek(anchor, WEEK_OPTIONS))
  }
}

/**
 * Label for the sidebar's tracked-time total. The total covers whatever range is on
 * screen, so the label has to name that range rather than saying "this week" forever.
 * It lives here with the rest of the per-view date work, not in the sidebar.
 *
 * The day view says "today" only when the anchor really is today; stepping back a day
 * would otherwise put yesterday's total under a label claiming it was today's.
 */
export function formatTrackedRangeLabel(view, anchor, now = new Date()) {
  switch (view) {
    case 'day':
      return isSameDay(anchor, now) ? 'Tracked today' : `Tracked on ${format(anchor, 'EEE, MMM d')}`
    case 'month':
      return `Tracked in ${format(anchor, 'MMMM')}`
    case 'year':
      return `Tracked in ${format(anchor, 'yyyy')}`
    case 'agenda':
      return 'Tracked in range'
    case 'week':
    default:
      return 'Tracked this week'
  }
}

export function navigateView(view, anchor, direction) {
  if (direction === 'today') return new Date()

  switch (view) {
    case 'day':
      return addDays(anchor, direction)
    case 'agenda':
      return addDays(anchor, direction * AGENDA_DAYS)
    case 'month':
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

function isTrackedEvent(event) {
  return event.source === 'timetracker'
}

/**
 * Buckets events into the month grid's day cells. Events are keyed by their
 * start day, matching how the week time grid places them, so a multi-day event
 * shows only on the day it begins.
 *
 * Tracked sessions are left out: the cell draws them as the proportional strip
 * along its bottom edge (`buildTrackedDayTotals`), and a busy day of tracking
 * would otherwise push every meeting out of the cell behind a "+5 more".
 */
export function buildMonthCells(events, days, maxPerDay = Number.POSITIVE_INFINITY) {
  const sorted = [...events].filter((event) => !isTrackedEvent(event)).sort(byStart)

  return days.map((day) => {
    const dayEvents = sorted.filter((event) => isSameDay(new Date(event.start), day))
    return {
      day,
      events: dayEvents.slice(0, maxPerDay),
      overflowCount: Math.max(0, dayEvents.length - maxPerDay)
    }
  })
}

// Ten hours of tracked work fills a month cell's strip. A fixed reference keeps the
// cells comparable with each other and from month to month, which normalising against
// the busiest day of the month would not.
export const TRACKED_FULL_DAY_MS = 10 * 60 * 60 * 1000

/**
 * Per-day tracked totals for the month grid, one entry per day in `days`, each holding
 * the day's projects (longest first) and the total. `event` rides along so the caller
 * can colour a segment through `getEventColor` without repeating the colour rules.
 *
 * Sessions count towards the day they started on, like everything else in the month
 * grid; only the time grid, where a bar is a physical length, splits them at midnight.
 */
export function buildTrackedDayTotals(events, days, now = Date.now()) {
  const tracked = events.filter(isTrackedEvent)

  return days.map((day) => {
    const dayEvents = tracked.filter((event) => isSameDay(new Date(event.start), day))
    const projects = totalsByProject(dayEvents, now).map((entry) => ({
      ...entry,
      event: dayEvents.find((event) => event.calendarId === entry.calendarId)
    }))

    return {
      day,
      projects,
      totalMs: projects.reduce((sum, entry) => sum + entry.ms, 0)
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
// Agenda is a rolling window starting today, so it answers "what is coming up". A tracked
// session is a record of work already done; the only ones it could ever show are this
// morning's, and they would push the day's remaining events down the list.
function isAgendaEvent(event) {
  return event.source !== 'timetracker'
}

export function buildAgendaSections(events, days) {
  const sorted = events.filter(isAgendaEvent).sort(byStart)

  return days
    .map((day) => ({
      day,
      events: sorted.filter((event) => isSameDay(new Date(event.start), day))
    }))
    .filter((section) => section.events.length > 0)
}
