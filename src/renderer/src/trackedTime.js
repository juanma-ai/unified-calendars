/**
 * Primitives shared by every surface that renders tracked time — the grid lane, the
 * sidebar summary, the session popover and the live-session indicator. They live here so
 * those surfaces cannot disagree about what a duration reads like or when a session is
 * still open.
 */

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** `1h 47m`, `30m`, `0m`. Minute resolution: the tracker itself reports no finer. */
export function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / MINUTE_MS))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export function isRunning(event) {
  return Boolean(event?.isRunning)
}

/**
 * The end a running session should be drawn to *now*, rather than the one baked in when
 * the source last read the database. The source TTL is 30s, which is fine for noticing a
 * new session but too coarse for an elapsed counter, so the renderer advances it instead
 * of refetching.
 */
export function effectiveEnd(event, now = Date.now()) {
  const start = new Date(event.start).getTime()
  if (!isRunning(event)) return new Date(event.end ?? event.start).getTime()
  return Math.max(now, start)
}

export function durationMs(event, now = Date.now()) {
  return Math.max(0, effectiveEnd(event, now) - new Date(event.start).getTime())
}

/**
 * Per-project totals over the tracked events given, descending by time. Callers pass the
 * events already on screen, so hidden projects drop out of the totals for free and the
 * numbers always match what is visible.
 */
export function totalsByProject(events, now = Date.now()) {
  const totals = new Map()

  for (const event of events) {
    if (event.source !== 'timetracker') continue
    const existing = totals.get(event.calendarId)
    const ms = durationMs(event, now)

    if (existing) {
      existing.ms += ms
      existing.running = existing.running || isRunning(event)
      continue
    }

    totals.set(event.calendarId, {
      calendarId: event.calendarId,
      project: event.calendarName,
      ms,
      running: isRunning(event)
    })
  }

  return [...totals.values()].sort((a, b) => b.ms - a.ms || a.project.localeCompare(b.project))
}

export function totalTrackedMs(events, now = Date.now()) {
  return totalsByProject(events, now).reduce((sum, entry) => sum + entry.ms, 0)
}
