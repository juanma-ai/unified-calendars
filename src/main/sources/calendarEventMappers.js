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
