const SKIPPED_STATUSES = new Set(['cancelled', 'completed'])

function normalizePreferences(preferences = {}) {
  return {
    calendarSidebarVisibility: preferences.calendarSidebarVisibility ?? {},
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

function isCalendarInSidebar(event, preferences) {
  if (Object.prototype.hasOwnProperty.call(preferences.calendarSidebarVisibility, event.calendarId)) {
    return preferences.calendarSidebarVisibility[event.calendarId]
  }
  if (preferences.hiddenCalendars.includes(event.calendarId)) return false
  return isCalendarVisible(event, preferences)
}

function isHiddenEvent(event, preferences) {
  const hiddenEvents = new Set(preferences.hiddenEvents.map((item) => item.key))
  if (hiddenEvents.has(`occurrence:${event.id}`)) return true
  return Boolean(event.seriesId && hiddenEvents.has(`series:${event.seriesId}`))
}

function notificationKey(event) {
  return `${event.id}:${event.start}`
}

function eventStartTime(event) {
  const startMs = new Date(event.start).getTime()
  return Number.isFinite(startMs) ? startMs : null
}

function formatEventTime(event, locale) {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(event.start))
}

function notificationPayload(event, locale) {
  return {
    title: event.title,
    body: `${event.calendarName} at ${formatEventTime(event, locale)}`,
    event
  }
}

export function createEventNotificationScheduler({
  clearTimer = clearTimeout,
  locale = undefined,
  now = () => Date.now(),
  requestAttention = () => {},
  setTimer = setTimeout,
  showNotification
}) {
  const timers = new Map()
  const firedKeys = new Set()

  function isSchedulable(event, preferences, nowMs) {
    const startMs = eventStartTime(event)

    return (
      startMs !== null &&
      startMs > nowMs &&
      !event.allDay &&
      !SKIPPED_STATUSES.has(event.status) &&
      isCalendarInSidebar(event, preferences) &&
      isCalendarVisible(event, preferences) &&
      !isHiddenEvent(event, preferences)
    )
  }

  function clearStaleTimers(nextKeys) {
    for (const [key, timerId] of timers) {
      if (nextKeys.has(key)) continue
      clearTimer(timerId)
      timers.delete(key)
    }
  }

  function schedule(events, preferenceValue = {}) {
    const preferences = normalizePreferences(preferenceValue)
    const nowMs = now()
    const nextKeys = new Set()

    for (const event of events) {
      const key = notificationKey(event)
      if (firedKeys.has(key) || !isSchedulable(event, preferences, nowMs)) continue

      nextKeys.add(key)
      if (timers.has(key)) continue

      const timerId = setTimer(() => {
        timers.delete(key)
        firedKeys.add(key)
        const payload = notificationPayload(event, locale)
        showNotification(payload)
        requestAttention(payload)
      }, eventStartTime(event) - nowMs)

      timers.set(key, timerId)
    }

    clearStaleTimers(nextKeys)
  }

  function clear() {
    clearStaleTimers(new Set())
  }

  return { clear, schedule }
}
