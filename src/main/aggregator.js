import Store from 'electron-store'
import { fetchGoogleEvents } from './sources/google.js'
import { fetchTrelloEvents } from './sources/trello.js'
import { fetchRemindersEvents } from './sources/reminders.js'
import { fetchTimetrackerEvents } from './sources/timetracker.js'
import { createSourceRangeCache } from './sourceRangeCache.js'

const store = new Store({ name: 'calendar-personal-app' })

const TTL_MS = {
  google: 5 * 60 * 1000,
  trello: 7 * 60 * 1000,
  reminders: 3 * 60 * 1000,
  // Short, because a running session's end is "now at fetch time" and stales quickly.
  timetracker: 30 * 1000
}

const FETCHERS = {
  google: fetchGoogleEvents,
  trello: fetchTrelloEvents,
  reminders: fetchRemindersEvents,
  timetracker: fetchTimetrackerEvents
}

const cache = createSourceRangeCache()

let lastStatuses = []
let lastCalendars = []

async function fetchSource(source, rangeStart, rangeEnd, force) {
  const cached = cache.get(source, rangeStart, rangeEnd)
  const isFresh = cached && Date.now() - cached.fetchedAt < TTL_MS[source]

  if (isFresh && !force) return cached

  const result = await FETCHERS[source](rangeStart, rangeEnd)
  const allFailed = result.statuses.every((s) => !s.ok)

  // A source going down shouldn't blank out data that was showing a moment
  // ago — keep the last good events for this source, just surface the error.
  const fallback = cached ?? cache.lastFor(source)
  if (allFailed && fallback) {
    return cache.remember(source, rangeStart, rangeEnd, {
      ...fallback,
      statuses: result.statuses
    })
  }

  return cache.remember(source, rangeStart, rangeEnd, {
    rangeStart,
    rangeEnd,
    events: result.events,
    calendars: result.calendars ?? [],
    statuses: result.statuses,
    fetchedAt: Date.now()
  })
}

export async function getUnifiedEvents(rangeStart, rangeEnd, { force = false } = {}) {
  const sources = await Promise.all(
    Object.keys(FETCHERS).map((source) => fetchSource(source, rangeStart, rangeEnd, force))
  )

  lastStatuses = sources.flatMap((s) => s.statuses)
  lastCalendars = sources.flatMap((s) => s.calendars ?? [])
  const events = sources.flatMap((s) => s.events).sort((a, b) => new Date(a.start) - new Date(b.start))

  store.set('lastGoodCache', {
    rangeStart,
    rangeEnd,
    events,
    calendars: lastCalendars,
    statuses: lastStatuses,
    savedAt: Date.now()
  })

  return events
}

export function getSourceStatus() {
  return lastStatuses
}

export function getAvailableCalendars() {
  return lastCalendars
}

export function invalidateSourceCache(source) {
  cache.invalidate(source)
  if (source === 'google') {
    lastCalendars = lastCalendars.filter((calendar) => calendar.source !== 'google')
    lastStatuses = lastStatuses.filter((status) => status.source !== 'google')
  }
}

export function getStartupCache() {
  return store.get('lastGoodCache') ?? null
}
