import { createSourceRangeCache } from './sourceRangeCache.js'
import { createPeerRadicaleFetcher, createUserRadicaleFetcher } from './sources/radicale.js'
import { fetchVikunjaEvents } from './sources/vikunja.js'

export const SOURCE_TTL_MS = {
  google: 300000, trello: 420000, linear: 420000, wallos: 420000,
  vikunja: 420000, radicale: 60000, reminders: 180000, timetracker: 30000
}

export function createMemoryStorage() {
  const values = new Map()
  return {
    get: (key, fallback) => structuredClone(values.has(key) ? values.get(key) : fallback),
    set: (key, value) => values.set(key, structuredClone(value))
  }
}

export function createAggregator({ fetchers, ttl = SOURCE_TTL_MS, storage = createMemoryStorage() }) {
const cache = createSourceRangeCache()

let lastStatuses = []
let lastCalendars = []

async function fetchSource(source, rangeStart, rangeEnd, force) {
  const cached = cache.get(source, rangeStart, rangeEnd)
  const isFresh = cached && Date.now() - cached.fetchedAt < ttl[source]

  if (isFresh && !force) return cached

  const result = await fetchers[source](rangeStart, rangeEnd)
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

async function getUnifiedEvents(rangeStart, rangeEnd, { force = false } = {}) {
  const sources = await Promise.all(
    Object.keys(fetchers).map((source) => fetchSource(source, rangeStart, rangeEnd, force))
  )

  lastStatuses = sources.flatMap((s) => s.statuses)
  lastCalendars = sources.flatMap((s) => s.calendars ?? [])
  const events = sources.flatMap((s) => s.events).sort((a, b) => new Date(a.start) - new Date(b.start))

  storage.set('lastGoodCache', {
    rangeStart,
    rangeEnd,
    events,
    calendars: lastCalendars,
    statuses: lastStatuses,
    savedAt: Date.now()
  })

  return events
}

function getSourceStatus() {
  return lastStatuses
}

function getAvailableCalendars() {
  return lastCalendars
}

function invalidateSourceCache(source) {
  cache.invalidate(source)
  if (source === 'google') {
    lastCalendars = lastCalendars.filter((calendar) => calendar.source !== 'google')
    lastStatuses = lastStatuses.filter((status) => status.source !== 'google')
  }
}

function getStartupCache() {
  return storage.get('lastGoodCache') ?? null
}

return { getUnifiedEvents, getSourceStatus, getAvailableCalendars, invalidateSourceCache, getStartupCache }
}

// One aggregator per family member. Caches, last statuses, the calendar list
// and the startup cache all live inside an aggregator, so sharing one would
// hand a member's personal calendar to the next person who loads the page.
const familyMembers = (env) => Object.keys(env)
  .map((key) => /^RADICALE_PASSWORD_([A-Z][A-Z0-9_-]*)$/.exec(key)?.[1].toLowerCase())
  .filter(Boolean)

function combineFetchers(fetchers) {
  return async (...range) => {
    const results = await Promise.all(fetchers.map((fetch) => fetch(...range)))
    return {
      events: results.flatMap((result) => result.events),
      calendars: results.flatMap((result) => result.calendars ?? []),
      statuses: results.flatMap((result) => result.statuses)
    }
  }
}

export function createFamilyAggregator(env = process.env) {
  const aggregators = new Map()
  return (user) => {
    if (!aggregators.has(user)) aggregators.set(user, createAggregator({ fetchers: {
      radicale: combineFetchers([
        createUserRadicaleFetcher({
          baseUrl: env.RADICALE_URL, user, password: env[`RADICALE_PASSWORD_${user.toUpperCase()}`]
        }),
        // Every other member with a Radicale password shows up read-only.
        ...familyMembers(env).filter((peer) => peer !== user).map((peer) => createPeerRadicaleFetcher({
          baseUrl: env.RADICALE_URL, peer, password: env[`RADICALE_PASSWORD_${peer.toUpperCase()}`]
        }))
      ]),
      vikunja: async (...range) => {
        const result = await fetchVikunjaEvents(...range)
        // Family starts visible. Desktop's opt-in defaults remain unchanged.
        return { ...result,
          events: result.events.map(event => ({ ...event, raw: undefined, calendarDefaultVisible: true })),
          calendars: (result.calendars || []).map(calendar => ({ ...calendar, calendarDefaultVisible: true }))
        }
      }
    } }))
    return aggregators.get(user)
  }
}
