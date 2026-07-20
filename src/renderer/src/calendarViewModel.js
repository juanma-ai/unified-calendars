const SOURCE_ORDER = { google: 0, trello: 1, reminders: 2 }

function normalizedPreferences(preferences = {}) {
  return {
    calendarColors: preferences.calendarColors ?? {},
    calendarVisibility: preferences.calendarVisibility ?? {},
    hiddenCalendars: preferences.hiddenCalendars ?? [],
    hiddenEvents: preferences.hiddenEvents ?? []
  }
}

function isCalendarVisible(event, preferences) {
  if (Object.prototype.hasOwnProperty.call(preferences.calendarVisibility, event.calendarId)) {
    return preferences.calendarVisibility[event.calendarId]
  }
  if (preferences.hiddenCalendars.includes(event.calendarId)) return false
  return Boolean(event.calendarDefaultVisible)
}

export function buildCalendars(events, preferenceValue, availableCalendars = []) {
  const preferences = normalizedPreferences(preferenceValue)
  const calendars = new Map()

  for (const calendar of availableCalendars) {
    calendars.set(calendar.calendarId, {
      id: calendar.calendarId,
      source: calendar.source,
      ...(calendar.sourceAccountId ? { sourceAccountId: calendar.sourceAccountId } : {}),
      ...(calendar.sourceAccountName ? { sourceAccountName: calendar.sourceAccountName } : {}),
      name: calendar.calendarName,
      color: preferences.calendarColors[calendar.calendarId] ?? calendar.calendarDefaultColor,
      count: 0,
      visible: isCalendarVisible(calendar, preferences)
    })
  }

  for (const event of events) {
    if (!event.calendarId) continue
    const existing = calendars.get(event.calendarId)
    if (existing) {
      existing.count += 1
      continue
    }

    calendars.set(event.calendarId, {
      id: event.calendarId,
      source: event.source,
      ...(event.sourceAccountId ? { sourceAccountId: event.sourceAccountId } : {}),
      ...(event.sourceAccountName ? { sourceAccountName: event.sourceAccountName } : {}),
      name: event.calendarName,
      color: preferences.calendarColors[event.calendarId] ?? event.calendarDefaultColor,
      count: 1,
      visible: isCalendarVisible(event, preferences)
    })
  }

  return [...calendars.values()].sort((a, b) => {
    const sourceDifference = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]
    return sourceDifference || a.name.localeCompare(b.name)
  })
}

export function filterVisibleEvents(events, preferenceValue, searchQuery = '') {
  const preferences = normalizedPreferences(preferenceValue)
  const hiddenEvents = new Set(preferences.hiddenEvents.map((item) => item.key))
  const query = searchQuery.trim().toLocaleLowerCase()

  return events.filter((event) => {
    if (!isCalendarVisible(event, preferences)) return false
    if (hiddenEvents.has(`occurrence:${event.id}`)) return false
    if (event.seriesId && hiddenEvents.has(`series:${event.seriesId}`)) return false
    return !query || event.title.toLocaleLowerCase().includes(query)
  })
}

export function getEventColor(event, preferenceValue) {
  const preferences = normalizedPreferences(preferenceValue)
  return preferences.calendarColors[event.calendarId] ?? event.calendarDefaultColor ?? '#757575'
}
