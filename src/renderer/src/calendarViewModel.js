const SOURCE_ORDER = { google: 0, trello: 1, linear: 2, reminders: 3, timetracker: 4, wallos: 5 }

function normalizedPreferences(preferences = {}) {
  return {
    calendarColors: preferences.calendarColors ?? {},
    calendarSidebarVisibility: preferences.calendarSidebarVisibility ?? {},
    calendarVisibility: preferences.calendarVisibility ?? {},
    focusedCalendars: preferences.focusedCalendars ?? [],
    hiddenCalendars: preferences.hiddenCalendars ?? [],
    hiddenEvents: preferences.hiddenEvents ?? [],
    sourceEnabled: preferences.sourceEnabled ?? {}
  }
}

/**
 * Whole-source master switch. Kept separate from per-calendar visibility so switching a
 * source off and back on restores which of its calendars were individually hidden, and
 * applied here so every view obeys it without per-view work.
 */
export function isSourceEnabled(preferenceValue, source) {
  const sourceEnabled = preferenceValue?.sourceEnabled ?? {}
  return sourceEnabled[source] !== false
}

function isCalendarVisible(event, preferences) {
  if (Object.prototype.hasOwnProperty.call(preferences.calendarVisibility, event.calendarId)) {
    return preferences.calendarVisibility[event.calendarId]
  }
  if (preferences.hiddenCalendars.includes(event.calendarId)) return false
  return Boolean(event.calendarDefaultVisible)
}

function isCalendarInSidebar(event, preferences) {
  if (Object.prototype.hasOwnProperty.call(preferences.calendarSidebarVisibility, event.calendarId)) {
    return preferences.calendarSidebarVisibility[event.calendarId]
  }
  if (preferences.hiddenCalendars.includes(event.calendarId)) return false
  // Before sidebar membership existed, enabling a calendar was the only opt-in, so an
  // explicit `true` still lists it. A quick hide must never delist it: the row stays
  // in the sidebar, muted, until Settings removes it.
  if (preferences.calendarVisibility[event.calendarId] === true) return true
  return Boolean(event.calendarDefaultVisible)
}

export function buildCalendars(events, preferenceValue, availableCalendars = []) {
  const preferences = normalizedPreferences(preferenceValue)
  const focusedSet = new Set(preferences.focusedCalendars)
  const calendars = new Map()

  for (const calendar of availableCalendars) {
    calendars.set(calendar.calendarId, {
      id: calendar.calendarId,
      source: calendar.source,
      ...(calendar.sourceAccountId ? { sourceAccountId: calendar.sourceAccountId } : {}),
      ...(calendar.sourceAccountName ? { sourceAccountName: calendar.sourceAccountName } : {}),
      ...(calendar.providerCalendarId ? { providerCalendarId: calendar.providerCalendarId } : {}),
      ...(calendar.accountEmail ? { accountEmail: calendar.accountEmail } : {}),
      ...(calendar.url ? { url: calendar.url } : {}),
      name: calendar.calendarName,
      color: preferences.calendarColors[calendar.calendarId] ?? calendar.calendarDefaultColor,
      count: 0,
      sidebarVisible: isCalendarInSidebar(calendar, preferences),
      visible: isCalendarVisible(calendar, preferences),
      focused: focusedSet.has(calendar.calendarId)
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
      ...(event.providerCalendarId ? { providerCalendarId: event.providerCalendarId } : {}),
      name: event.calendarName,
      color: preferences.calendarColors[event.calendarId] ?? event.calendarDefaultColor,
      count: 1,
      sidebarVisible: isCalendarInSidebar(event, preferences),
      visible: isCalendarVisible(event, preferences),
      focused: focusedSet.has(event.calendarId)
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
  const hasFocused = preferences.focusedCalendars.length > 0
  const focusedSet = hasFocused ? new Set(preferences.focusedCalendars) : null

  return events.filter((event) => {
    if (!isSourceEnabled(preferences, event.source)) return false
    if (!isCalendarInSidebar(event, preferences)) return false
    if (hasFocused && !focusedSet.has(event.calendarId)) return false
    if (!hasFocused && !isCalendarVisible(event, preferences)) return false
    if (hiddenEvents.has(`occurrence:${event.id}`)) return false
    if (event.seriesId && hiddenEvents.has(`series:${event.seriesId}`)) return false
    return !query || event.title.toLocaleLowerCase().includes(query)
  })
}

export function getEventColor(event, preferenceValue) {
  const preferences = normalizedPreferences(preferenceValue)
  return preferences.calendarColors[event.calendarId] ?? event.calendarDefaultColor ?? '#757575'
}
