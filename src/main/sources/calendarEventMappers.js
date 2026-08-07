import { projectColor } from './timetrackerProjects.js'

const SECONDS_TO_MS = 1000

export function mapGoogleEvent(item, accountLabel, calendar) {
  const calendarId = `google:${accountLabel}:${calendar.id}`
  const allDay = Boolean(item.start?.date && !item.start?.dateTime)

  return {
    source: 'google',
    sourceAccountId: accountLabel,
    calendarId,
    calendarName: calendar.summaryOverride ?? calendar.summary ?? calendar.id,
    calendarDefaultColor: calendar.backgroundColor ?? '#3858e9',
    calendarDefaultVisible: Boolean(calendar.primary),
    id: `${calendarId}:${item.id}`,
    // Composite ids can't be split back apart reliably (a Google calendar id is an
    // email and the app-level id joins on ':'), so keep the provider ids for writes.
    providerCalendarId: calendar.id,
    providerEventId: item.id,
    seriesId: item.recurringEventId
      ? `${calendarId}:series:${item.recurringEventId}`
      : null,
    title: item.summary ?? '(no title)',
    start: item.start?.dateTime ?? item.start?.date,
    end: item.end?.dateTime ?? item.end?.date,
    allDay,
    url: item.htmlLink,
    status: item.status === 'cancelled' ? 'cancelled' : 'confirmed',
    raw: item
  }
}

function normalizeTrelloAssignee(memberId, membersById, currentMemberId) {
  const member = membersById.get(memberId) ?? {}
  return {
    id: memberId,
    name: member.fullName || member.username || member.initials || 'Unknown member',
    initials: member.initials ?? null,
    username: member.username ?? null,
    isMe: Boolean(currentMemberId && memberId === currentMemberId)
  }
}

export function mapTrelloCard(card, board, options = {}) {
  const calendarId = `trello:${board.id}`
  const memberIds = Array.isArray(card.idMembers) ? card.idMembers : []
  const membersById = options.membersById ?? new Map()
  const currentMemberId = options.currentMemberId ?? null
  const assignees = memberIds.map((memberId) =>
    normalizeTrelloAssignee(memberId, membersById, currentMemberId)
  )

  return {
    source: 'trello',
    calendarId,
    calendarName: board.name,
    calendarDefaultColor: '#9b7a00',
    calendarDefaultVisible: false,
    id: `trello:${card.id}`,
    providerCalendarId: board.id,
    providerEventId: card.id,
    seriesId: null,
    title: card.name,
    start: card.due,
    end: card.due,
    allDay: false,
    url: card.shortUrl,
    status: card.dueComplete ? 'completed' : 'confirmed',
    assignees,
    assignedToMe: Boolean(currentMemberId && memberIds.includes(currentMemberId)),
    raw: card
  }
}

/**
 * A Linear issue due date is date-only, so these are all-day events.
 * start/end are built as local midnight to match day bucketing in calendarViews.js.
 */
export function mapLinearIssue(issue) {
  const [year, month, day] = issue.dueDate.split('-').map(Number)
  const localStart = new Date(year, month - 1, day).toISOString()

  return {
    source: 'linear',
    calendarId: `linear:${issue.team.id}`,
    calendarName: issue.team.name,
    calendarDefaultColor: '#5e6ad2',
    calendarDefaultVisible: false,
    id: `linear:${issue.id}`,
    providerCalendarId: issue.team.id,
    providerEventId: issue.id,
    seriesId: null,
    title: `${issue.identifier} ${issue.title}`,
    start: localStart,
    end: localStart,
    allDay: true,
    url: issue.url,
    status: 'confirmed',
    raw: issue
  }
}

/**
 * A tracked session from the time tracker's SQLite file. Timestamps arrive as Unix
 * seconds; an entry with no `end` is still running, so it is closed at `now` and flagged
 * for the renderer to keep growing between refreshes.
 */
export function mapTrackedEntry(entry, notes = [], options = {}) {
  const nowMs = options.now ?? Date.now()
  const isRunning = entry.end === null || entry.end === undefined
  const startMs = entry.start * SECONDS_TO_MS
  // A clock change can leave a running entry starting "after" now; never emit a
  // negative-length event, which timedPosition would have to paper over.
  const endMs = isRunning ? Math.max(nowMs, startMs) : entry.end * SECONDS_TO_MS

  return {
    source: 'timetracker',
    calendarId: `timetracker:${entry.project}`,
    calendarName: entry.project,
    calendarDefaultColor: projectColor(entry.project),
    calendarDefaultVisible: true,
    id: `timetracker:${entry.id}`,
    providerCalendarId: entry.project,
    providerEventId: String(entry.id),
    seriesId: null,
    title: entry.project,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    allDay: false,
    status: 'confirmed',
    isRunning,
    notes: notes.map((note) => ({
      // The row id travels with the note so the popover can edit or delete exactly the one
      // that was clicked. Older callers that pass note rows without an id still map cleanly.
      id: note.id ?? null,
      ts: new Date(note.ts * SECONDS_TO_MS).toISOString(),
      text: note.text
    })),
    raw: entry
  }
}
