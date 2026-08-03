import { durationMs, formatDuration, totalsByProject } from '../shared/trackedTime.js'

// The plugin warned past 12h because a forgotten timer is the common failure.
const LONG_SESSION_MS = 12 * 60 * 60 * 1000

/** Compact `1:23` for the menu bar title, where `1h 23m` is too wide to live. */
export function formatTrackerClock(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`
}

function isToday(value, now) {
  const date = new Date(value)
  const today = new Date(now)
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

/**
 * Everything the tray needs about tracking, derived from the week of tracked events the
 * source already returns — no extra query, and the totals cannot drift from the grid.
 */
export function buildTrackingState({ events = [], projects = [], now = Date.now() } = {}) {
  const tracked = events.filter((event) => event.source === 'timetracker')
  const runningEvent = tracked.find((event) => event.isRunning) ?? null

  const running = runningEvent
    ? {
        project: runningEvent.calendarName,
        elapsedMs: durationMs(runningEvent, now),
        isLong: durationMs(runningEvent, now) > LONG_SESSION_MS,
        notes: runningEvent.notes ?? []
      }
    : null

  const todayEvents = tracked.filter((event) => isToday(event.start, now))

  return {
    running,
    // The running project is offered as "stop", never as another "start".
    startable: projects.filter((project) => project !== running?.project),
    today: { total: totalsByProject(todayEvents, now).reduce((sum, x) => sum + x.ms, 0) },
    week: { total: totalsByProject(tracked, now).reduce((sum, x) => sum + x.ms, 0) },
    byProject: totalsByProject(tracked, now)
  }
}

/** `⏱ 1:23 certification`, or null when nothing is running. */
export function getTrackingTitle(state) {
  if (!state?.running) return null
  return `⏱ ${formatTrackerClock(state.running.elapsedMs)} ${state.running.project}`
}

function formatNoteLine(note) {
  const time = new Date(note.ts)
  const clock = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
  // A native menu item is one line; flatten and truncate rather than blowing up the menu.
  const text = note.text.replace(/\s*\n+\s*/g, ' · ')
  return `    ${clock}  ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`
}

export function buildTrackingMenuItems(
  state,
  { startTracking = () => {}, stopTracking = () => {}, addNote = () => {} } = {}
) {
  const items = []

  if (state.running) {
    const { project, elapsedMs, notes, isLong } = state.running
    items.push({
      label: `■ Stop ${project} (${formatDuration(elapsedMs)})`,
      click: () => stopTracking()
    })
    items.push({ label: '✎ Add note…', click: () => addNote() })
    for (const note of notes) items.push({ label: formatNoteLine(note), enabled: false })
    if (isLong) {
      items.push({ label: '⚠ Running for over 12h — forgot to stop?', enabled: false })
    }
  }

  for (const project of state.startable) {
    items.push({ label: `▶ ${project}`, click: () => startTracking(project) })
  }

  if (!state.running && state.startable.length === 0) {
    items.push({ label: 'No projects yet — add one in Settings', enabled: false })
  }

  items.push({ type: 'separator' })
  items.push({
    label: `Today: ${formatDuration(state.today.total)}  ·  This week: ${formatDuration(state.week.total)}`,
    enabled: false
  })

  return items
}
