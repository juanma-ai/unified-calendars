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

export function mapTrelloCard(card, board) {
  const calendarId = `trello:${board.id}`

  return {
    source: 'trello',
    calendarId,
    calendarName: board.name,
    calendarDefaultColor: '#9b7a00',
    calendarDefaultVisible: false,
    id: `trello:${card.id}`,
    seriesId: null,
    title: card.name,
    start: card.due,
    end: card.due,
    allDay: false,
    url: card.shortUrl,
    status: card.dueComplete ? 'completed' : 'confirmed',
    raw: card
  }
}
