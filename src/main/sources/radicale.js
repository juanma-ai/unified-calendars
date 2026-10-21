import { config } from '../config.js'
import {
  calendarQueryBody, civilDayOf, decodeXmlEntities, parseCalendar, parseMultiStatus
} from '../../../vendor/casa-agent/src/radicale.mjs'

function civilDate(instant) {
  const { y, m, d } = civilDayOf(instant)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const calendar = {
  source: 'radicale', calendarId: 'radicale:familia', calendarName: 'Familia',
  calendarDefaultColor: '#059669', calendarDefaultVisible: true
}

const basicAuth = (username, password) => `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

async function reportEvents({ baseUrl, authorization, calendar, calendarPath, rangeStart, rangeEnd }) {
  const response = await fetch(new URL(calendarPath, baseUrl), {
    method: 'REPORT', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: authorization, Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    body: calendarQueryBody(rangeStart, rangeEnd, { expand: true })
  })
  if (response.status !== 207) throw new Error(`Radicale request failed: ${response.status}`)
  return parseMultiStatus(await response.text()).flatMap((row) =>
    (row.ics ? parseCalendar(row.ics, { expanded: true }) : []).map((event) => ({
      ...calendar,
      id: `radicale:${event.uid}:${event.recurrenceId || event.start.toISOString()}`,
      providerCalendarId: calendarPath, providerEventId: row.href, etag: row.etag,
      seriesId: `radicale:${event.uid}`,
      // The occurrence's original start as the expanded REPORT gives it (UTC, or
      // a date for all-day series); writes need it to address one occurrence.
      recurrenceId: event.recurrenceId || null,
      title: event.summary || '(Sin título)', description: event.description || '',
      location: event.location || '',
      start: event.allDay ? civilDate(event.start) : event.start.toISOString(),
      end: event.allDay ? civilDate(event.end) : event.end.toISOString(),
      allDay: Boolean(event.allDay), tzUnknown: event.tzUnknown,
      // One X-FAMILIA-ASISTENTE line per person; see src/server/radicaleWrite.mjs.
      attendees: [...String(event.raw ?? '').matchAll(/^X-FAMILIA-ASISTENTE(?:;[^:\r\n]*)?:(.+?)\r?$/gm)].map(m => m[1].trim()),
      // Marked from the web on a personal calendar: only its owner sees it.
      private: /^X-FAMILIA-PRIVADO(?:;[^:\r\n]*)?:TRUE\r?$/im.test(String(event.raw ?? '')),
      url: null, status: 'confirmed'
    }))
  )
}

export async function fetchRadicaleEvents(rangeStart, rangeEnd) {
  const { baseUrl, username, password, calendarPath } = config.radicale
  if (!baseUrl || !username || !password) {
    return { events: [], calendars: [calendar], statuses: [{ source: 'radicale', ok: false, lastError: 'not-connected' }] }
  }
  try {
    const events = await reportEvents({
      baseUrl, authorization: basicAuth(username, password), calendar, calendarPath, rangeStart, rangeEnd
    })
    return { events, calendars: [calendar], statuses: [{ source: 'radicale', ok: true, lastSyncedAt: new Date().toISOString() }] }
  } catch (error) {
    return { events: [], calendars: [calendar], statuses: [{ source: 'radicale', ok: false, lastError: error.message }] }
  }
}

const DISCOVERY_BODY = '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/"><D:prop><D:resourcetype/><D:displayname/><A:calendar-color/><C:supported-calendar-component-set/></D:prop></D:propfind>'
const tag = (block, name) => new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(block)?.[1]

// The calendars a member sees from their own principal: Familia arrives through
// the /<user>/casa/ link and keeps the shared id, so colours and hidden events
// stored by id are the same for both members. The iPhone also creates a
// VTODO-only collection for Reminders; it holds no events and is left out.
export function parseCalendarCollections(xml, user) {
  const blocks = String(xml ?? '').match(/<(?:\w+:)?response[\s>][\s\S]*?<\/(?:\w+:)?response>/g) ?? []
  const found = blocks.flatMap((block) => {
    const href = decodeURIComponent(decodeXmlEntities(tag(block, 'href') ?? '').trim())
    if (!/<(?:\w+:)?calendar\s*\/>/.test(tag(block, 'resourcetype') ?? '')) return []
    const components = [...(tag(block, 'supported-calendar-component-set') ?? '').matchAll(/name="([A-Z]+)"/g)].map(m => m[1])
    if (components.length && !components.includes('VEVENT')) return []
    const collection = href.replace(/\/+$/, '').split('/').pop()
    if (collection === 'casa') return [{ ...calendar, providerCalendarId: href }]
    const color = /^#[0-9a-f]{6}/i.exec(tag(block, 'calendar-color') ?? '')?.[0]
    return [{
      source: 'radicale', calendarId: `radicale:${user}:${collection}`,
      calendarName: decodeXmlEntities(tag(block, 'displayname') ?? '').trim() || collection,
      calendarDefaultColor: color ?? '#7c3aed', calendarDefaultVisible: true, providerCalendarId: href
    }]
  })
  // Familia first, whatever order Radicale answers in.
  return found.sort((a, b) => (b.calendarId === calendar.calendarId) - (a.calendarId === calendar.calendarId))
}

// Web only: reads with the signed-in member's own Radicale account, so the
// rights file keeps each personal calendar private to its owner.
export function createUserRadicaleFetcher({ baseUrl, user, password, only = () => true }) {
  const authorization = basicAuth(user, password)
  return async (rangeStart, rangeEnd) => {
    if (!baseUrl || !password) {
      return { events: [], calendars: [], statuses: [{ source: 'radicale', ok: false, lastError: 'not-connected' }] }
    }
    let calendars
    try {
      const response = await fetch(new URL(`/${user}/`, baseUrl), {
        method: 'PROPFIND', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: authorization, Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
        body: DISCOVERY_BODY
      })
      if (response.status !== 207) throw new Error(`Radicale request failed: ${response.status}`)
      calendars = parseCalendarCollections(await response.text(), user).filter(only)
    } catch (error) {
      return { events: [], calendars: [], statuses: [{ source: 'radicale', ok: false, lastError: error.message }] }
    }
    const results = await Promise.allSettled(calendars.map((calendar) => reportEvents({
      baseUrl, authorization, calendar, calendarPath: calendar.providerCalendarId, rangeStart, rangeEnd
    })))
    return {
      events: results.flatMap((result) => result.status === 'fulfilled' ? result.value : []),
      calendars,
      statuses: results.map((result, index) => result.status === 'fulfilled'
        ? { source: 'radicale', calendarId: calendars[index].calendarId, ok: true, lastSyncedAt: new Date().toISOString() }
        : { source: 'radicale', calendarId: calendars[index].calendarId, ok: false, lastError: result.reason.message })
    }
  }
}

// Web only: the other member's personal calendar, read with *their* account so
// the viewer's own Radicale account never gains rights over it. Private events
// are dropped here, on the server, before they can reach the viewer's cache or
// browser. Writes stay impossible: the writer only accepts hrefs from the
// viewer's own PROPFIND, and readOnly just tells the UI not to offer them.
export function createPeerRadicaleFetcher({ baseUrl, peer, password }) {
  const calendarId = `radicale:${peer}:personal`
  const fetchPeer = createUserRadicaleFetcher({ baseUrl, user: peer, password, only: (calendar) => calendar.calendarId === calendarId })
  return async (rangeStart, rangeEnd) => {
    const result = await fetchPeer(rangeStart, rangeEnd)
    return {
      events: result.events.filter((event) => !event.private).map((event) => ({ ...event, readOnly: true })),
      calendars: result.calendars.map((calendar) => ({ ...calendar, readOnly: true })),
      statuses: result.statuses.map((status) => ({ calendarId, ...status }))
    }
  }
}
