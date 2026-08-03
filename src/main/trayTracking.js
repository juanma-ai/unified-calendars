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
export function buildTrackingState({
  events = [],
  projects = [],
  detected = true,
  now = Date.now()
} = {}) {
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
  const todayByProject = totalsByProject(todayEvents, now)

  return {
    running,
    // No database means nothing to summarise, and a "Tracked today · 0m" line would be a
    // permanent, meaningless row for anyone who does not run the tracker.
    detected,
    // The running project is offered as "stop", never as another "start".
    startable: projects.filter((project) => project !== running?.project),
    // One line per project, however fragmented the day was: a five-session day still reads
    // as one row, which is the whole point of grouping rather than listing sessions.
    today: {
      total: todayByProject.reduce((sum, entry) => sum + entry.ms, 0),
      byProject: todayByProject
    },
    week: { total: totalsByProject(tracked, now).reduce((sum, x) => sum + x.ms, 0) }
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
  // Today has its own section further down the menu now; repeating it here would be the
  // same number twice, so this line keeps only the reading that section does not carry.
  items.push({ label: `This week: ${formatDuration(state.week.total)}`, enabled: false })

  return items
}

/**
 * The day's tracked time, grouped by project — the summary half of the tray, which sits
 * below the agenda rows rather than up with the start/stop controls: it answers "how much
 * have I tracked today", which is a menu-bar question, but it is not an agenda row.
 *
 * Returns nothing at all when there is nothing to say, so the menu does not carry an empty
 * heading around: no tracker installed, or a day with no tracked time yet.
 */
export function buildTrackingSummaryItems(state) {
  if (!state?.detected) return []

  const { total, byProject } = state.today
  if (!byProject.length) return []

  // A native menu draws in a proportional font, so this cannot truly align columns; padding
  // to the longest name still keeps short and long project names from reading as a ragged
  // list, and costs nothing when they are all a similar length.
  const width = Math.max(...byProject.map((entry) => entry.project.length))

  const items = [{ label: `Tracked today · ${formatDuration(total)}`, enabled: false }]

  for (const entry of byProject) {
    items.push({
      label: `    ${entry.project.padEnd(width)}   ${formatDuration(entry.ms)}`,
      enabled: false
    })
  }

  // The open session gets a line of its own so the menu answers "am I still tracking?"
  // without arithmetic. A native menu cannot animate, so `●` stands in for the pulsing dot
  // the grid and sidebar use (#9).
  if (state.running) {
    items.push({
      label: `    ● ${state.running.project}  running · ${formatDuration(state.running.elapsedMs)}`,
      enabled: false
    })
  }

  return items
}
