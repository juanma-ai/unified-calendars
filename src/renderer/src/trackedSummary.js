import { durationMs, isRunning, totalsByProject } from './trackedTime.js'

/**
 * The sidebar's tracked-time report for the range on screen: one total plus the segments
 * of the stacked proportion bar. It is a thin shape over `totalsByProject`, kept out of
 * the component so the percentage maths can be tested without a DOM.
 *
 * Callers pass the events already visible, so hidden projects drop out of the total and
 * the bar for free and the numbers always match what is on the calendar.
 */
export function buildTrackedSummary(events, colorsByCalendarId = {}, now = Date.now()) {
  const totals = totalsByProject(events, now)
  const totalMs = totals.reduce((sum, entry) => sum + entry.ms, 0)

  const segments = totals.map((entry) => ({
    calendarId: entry.calendarId,
    project: entry.project,
    color: colorsByCalendarId[entry.calendarId] ?? '#757575',
    ms: entry.ms,
    // A zero-length range would otherwise divide by zero; every segment is then 0% wide
    // and the bar renders as an empty track, which is the honest picture.
    percent: totalMs > 0 ? (entry.ms / totalMs) * 100 : 0
  }))

  // The running line reports the open session's own elapsed time, not the project's total
  // for the range: "certification running · 1h 12m" next to a 5h 59m day is the point of it.
  const runningEvent = events.find((event) => event.source === 'timetracker' && isRunning(event))

  return {
    totalMs,
    segments,
    running: runningEvent
      ? {
          calendarId: runningEvent.calendarId,
          project: runningEvent.calendarName,
          color: colorsByCalendarId[runningEvent.calendarId] ?? '#757575',
          ms: durationMs(runningEvent, now)
        }
      : null
  }
}

/** Per-project totals keyed by calendar id, for the duration shown on each sidebar row. */
export function trackedMsByCalendar(events, now = Date.now()) {
  return Object.fromEntries(
    totalsByProject(events, now).map((entry) => [entry.calendarId, entry.ms])
  )
}
