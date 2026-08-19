import { TZDate, tz } from '@date-fns/tz'
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
import { resolveTimeZone } from './calendarTimeZones.js'
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

function withTimeZone(timeZone) {
  return { in: tz(resolveTimeZone(timeZone)) }
}

function agendaRange(anchor, timeZone) {
  const zoneContext = withTimeZone(timeZone)
  return {
    start: startOfDay(anchor, zoneContext),
    end: endOfDay(addDays(anchor, AGENDA_DAYS - 1, zoneContext), zoneContext)
  }
}

// The month grid works off whole calendar weeks so it has no ragged first and
// last rows.
function monthGridRange(anchor, timeZone) {
  const zoneContext = withTimeZone(timeZone)
  return {
    start: startOfWeek(startOfMonth(anchor, zoneContext), { ...WEEK_OPTIONS, ...zoneContext }),
    end: endOfWeek(endOfMonth(anchor, zoneContext), { ...WEEK_OPTIONS, ...zoneContext })
  }
}

function formatDayRange({ start, end }, timeZone) {
  const zoneContext = withTimeZone(timeZone)
  return `${format(start, 'MMM d', zoneContext)} – ${format(end, 'MMM d, yyyy', zoneContext)}`
}

export function getViewRange(view, anchor, timeZone) {
  const zoneContext = withTimeZone(timeZone)

  switch (view) {
    case 'day':
      return { start: startOfDay(anchor, zoneContext), end: endOfDay(anchor, zoneContext) }
    case 'agenda':
      return agendaRange(anchor, timeZone)
    case 'month':
      return monthGridRange(anchor, timeZone)
    case 'year':
      return {
        start: startOfYear(anchor, zoneContext),
        end: endOfYear(anchor, zoneContext)
      }
    case 'week':
    default:
      return {
        start: startOfWeek(anchor, { ...WEEK_OPTIONS, ...zoneContext }),
        end: endOfWeek(anchor, { ...WEEK_OPTIONS, ...zoneContext })
      }
  }
}

export function getViewDays(view, anchor, timeZone) {
  const zoneContext = withTimeZone(timeZone)

  if (view === 'day') return [startOfDay(anchor, zoneContext)]

  const { start, end } = getViewRange(view, anchor, timeZone)
  return eachDayOfInterval({ start, end }, zoneContext)
}

export function formatViewLabel(view, anchor, timeZone) {
  const zoneContext = withTimeZone(timeZone)

  switch (view) {
    case 'day':
      return format(anchor, 'EEE, MMM d, yyyy', zoneContext)
    case 'agenda':
      return formatDayRange(agendaRange(anchor, timeZone), timeZone)
    case 'month':
      return format(anchor, 'MMMM yyyy', zoneContext)
    case 'year':
      return format(anchor, 'yyyy', zoneContext)
    case 'week':
    default:
      return formatWeekRange(startOfWeek(anchor, { ...WEEK_OPTIONS, ...zoneContext }), timeZone)
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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function isDateOnly(value) {
  return typeof value === 'string' && DATE_ONLY.test(value)
}

/**
 * A boundary as the start of the day it falls on, in the calendar's zone.
 *
 * Date-only all-day boundaries are floating calendar dates rather than instants:
 * `2026-08-20` means the 20th wherever you are. Parsing one as an instant puts it at
 * UTC midnight, and reading that back in a western zone lands on the 19th, so those are
 * built from the digits instead of routed through `Date`.
 */
function toZonedDay(value, timeZone) {
  if (isDateOnly(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return startOfDay(new TZDate(year, month - 1, day, resolveTimeZone(timeZone)))
  }
  return startOfDay(new Date(value), withTimeZone(timeZone))
}

function dayKeyInZone(date, timeZone) {
  return format(date, 'yyyy-MM-dd', withTimeZone(timeZone))
}

/**
 * The first and last day an event actually occupies. This is the single place the app
 * decides what "spans several days" means, because both ends are off-by-one traps:
 *
 * - An all-day `end` is exclusive. Google sends a single all-day event on the 20th as
 *   `end: 2026-08-21`, so the last day it occupies is the one before that. Sources that
 *   emit all-day instants with `end === start` (Linear, Wallos, Reminders) fall out of
 *   the same rule through the clamp at the bottom.
 * - A timed event ending on the stroke of midnight does not reach into the next day.
 *   20:00 to 00:00 is one evening, not two days.
 */
export function getEventDayRange(event, timeZone) {
  const firstDay = toZonedDay(event.start, timeZone)
  if (event.end == null) return { firstDay, lastDay: firstDay }

  const endDay = toZonedDay(event.end, timeZone)
  const endsOnBoundary =
    isDateOnly(event.end) || new Date(event.end).getTime() === endDay.getTime()
  const lastDay = endsOnBoundary ? addDays(endDay, -1, withTimeZone(timeZone)) : endDay

  return { firstDay, lastDay: lastDay < firstDay ? firstDay : lastDay }
}

/**
 * Whether `day` is one of the days the event occupies. Replaces the
 * `isSameDay(event.start, day)` that every view used to bucket with, which showed a
 * multi-day event only on the day it began.
 */
export function eventCoversDay(event, day, timeZone) {
  const { firstDay, lastDay } = getEventDayRange(event, timeZone)
  const key = dayKeyInZone(day, timeZone)
  return key >= dayKeyInZone(firstDay, timeZone) && key <= dayKeyInZone(lastDay, timeZone)
}

/**
 * Packs events into horizontal bars across a window of consecutive days — the shared
 * geometry behind the month grid's spanning bars and the week grid's all-day row.
 *
 * Each segment names the columns it covers within *this* window, so an event that
 * started before it or runs past it is clipped and flagged (`continuesBefore` /
 * `continuesAfter`) rather than dropped. Lanes are the same greedy interval packing
 * `assignOverlapColumns` does for the time grid, only measured in days: longest bars
 * first so a week-long event sits above the one-day events it passes over.
 *
 * Callers decide what goes in — the month grid leaves tracked sessions out, the all-day
 * row takes only all-day events.
 */
export function buildDaySegments(events, days, timeZone) {
  if (days.length === 0) return { segments: [], laneCount: 0 }

  const lastIndex = days.length - 1
  const firstKey = dayKeyInZone(days[0], timeZone)
  const lastKey = dayKeyInZone(days[lastIndex], timeZone)
  const indexByKey = new Map(days.map((day, index) => [dayKeyInZone(day, timeZone), index]))

  const segments = []
  for (const event of events) {
    const { firstDay, lastDay } = getEventDayRange(event, timeZone)
    const startKey = dayKeyInZone(firstDay, timeZone)
    const endKey = dayKeyInZone(lastDay, timeZone)
    if (endKey < firstKey || startKey > lastKey) continue

    const startIndex = startKey < firstKey ? 0 : indexByKey.get(startKey)
    const endIndex = endKey > lastKey ? lastIndex : indexByKey.get(endKey)

    segments.push({
      event,
      startIndex,
      endIndex,
      span: endIndex - startIndex + 1,
      continuesBefore: startKey < firstKey,
      continuesAfter: endKey > lastKey,
      lane: 0
    })
  }

  segments.sort(
    (a, b) => a.startIndex - b.startIndex || b.span - a.span || byStart(a.event, b.event)
  )

  const laneEnds = []
  for (const segment of segments) {
    let lane = laneEnds.findIndex((end) => end < segment.startIndex)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = segment.endIndex
    segment.lane = lane
  }

  return { segments, laneCount: laneEnds.length }
}

export const DAYS_PER_WEEK = 7

/**
 * The month grid, one entry per week row. Lanes are packed per row rather than across
 * the whole month so a bar can be drawn as a single element spanning its columns; an
 * event crossing a Sunday is cut at the row edge and picked up by the next row, with
 * `continuesBefore` / `continuesAfter` telling the row which ends to leave open.
 *
 * `maxLanes` caps the row's height. Events pushed past it are not dropped silently:
 * each day counts the ones covering it that did not fit, which is what the cell's
 * "+N more" reports.
 *
 * Tracked sessions are left out: the cell draws them as the proportional strip along
 * its bottom edge (`buildTrackedDayTotals`), and a busy day of tracking would otherwise
 * push every meeting out of the row behind a "+5 more".
 */
export function buildMonthWeeks(events, days, maxLanes = Number.POSITIVE_INFINITY, timeZone) {
  const scheduled = [...events].filter((event) => !isTrackedEvent(event)).sort(byStart)
  const weeks = []

  for (let offset = 0; offset < days.length; offset += DAYS_PER_WEEK) {
    const weekDays = days.slice(offset, offset + DAYS_PER_WEEK)
    const { segments, laneCount } = buildDaySegments(scheduled, weekDays, timeZone)
    const overflowCounts = weekDays.map(() => 0)

    for (const segment of segments) {
      if (segment.lane < maxLanes) continue
      for (let index = segment.startIndex; index <= segment.endIndex; index += 1) {
        overflowCounts[index] += 1
      }
    }

    weeks.push({
      days: weekDays,
      segments: segments.filter((segment) => segment.lane < maxLanes),
      overflowCounts,
      laneCount: Math.min(laneCount, maxLanes)
    })
  }

  return weeks
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
 *
 * Tracked sessions are counted separately, as the distinct projects worked on that day,
 * and each month reports how many of its days had any. Colour and dots are then two
 * independent readings — how full the day was, and what was worked on — rather than the
 * same signal counted twice, which is what letting sessions inflate the count would do:
 * three sessions of one project would read busier than three meetings.
 */
export function buildYearHeatmap(events, anchor, timeZone) {
  const counts = new Map()
  const projects = new Map()
  const year = anchor.getFullYear()

  for (const event of events) {
    const start = new Date(event.start)

    if (isTrackedEvent(event)) {
      if (start.getFullYear() !== year) continue
      const key = dayKey(start)
      const worked = projects.get(key) ?? new Map()
      if (!worked.has(event.calendarId)) {
        worked.set(event.calendarId, {
          calendarId: event.calendarId,
          project: event.calendarName,
          event
        })
      }
      projects.set(key, worked)
      continue
    }

    // A week away is a week of busy days, not one busy day followed by six free ones,
    // so a scheduled event counts once on every day it covers, clipped to this year.
    const { firstDay, lastDay } = getEventDayRange(event, timeZone)
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1, withTimeZone(timeZone))) {
      if (day.getFullYear() !== year) continue
      const key = dayKey(day)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const maxCount = Math.max(0, ...counts.values())

  const months = Array.from({ length: 12 }, (_, month) => {
    const monthStart = new Date(year, month, 1)
    const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) }).map(
      (day) => {
        const count = counts.get(dayKey(day)) ?? 0
        return {
          day,
          count,
          level: count === 0 ? 0 : Math.ceil((count / maxCount) * YEAR_HEAT_LEVELS),
          trackedProjects: [...(projects.get(dayKey(day))?.values() ?? [])]
        }
      }
    )

    return {
      month,
      start: monthStart,
      days,
      trackedDays: days.filter((entry) => entry.trackedProjects.length > 0).length
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

export function buildAgendaSections(events, days, timeZone) {
  const sorted = events
    .filter(isAgendaEvent)
    // An all-day event has no clock time to sort by, so it heads its day rather than
    // landing among the morning meetings at whatever midnight its source used.
    .sort((a, b) => Number(Boolean(b.allDay)) - Number(Boolean(a.allDay)) || byStart(a, b))

  return days
    .map((day) => ({
      day,
      events: sorted.filter((event) => eventCoversDay(event, day, timeZone))
    }))
    .filter((section) => section.events.length > 0)
}
