import { config } from '../config.js'
import {
  calendarQueryBody, civilDayOf, parseCalendar, parseMultiStatus
} from '../../../vendor/casa-agent/src/radicale.mjs'

function civilDate(instant) {
  const { y, m, d } = civilDayOf(instant)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const calendar = {
  source: 'radicale', calendarId: 'radicale:familia', calendarName: 'Familia',
  calendarDefaultColor: '#059669', calendarDefaultVisible: true
}

export async function fetchRadicaleEvents(rangeStart, rangeEnd) {
  const { baseUrl, username, password, calendarPath } = config.radicale
  if (!baseUrl || !username || !password) {
    return { events: [], calendars: [calendar], statuses: [{ source: 'radicale', ok: false, lastError: 'not-connected' }] }
  }
  try {
    const response = await fetch(new URL(calendarPath, baseUrl), {
      method: 'REPORT', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        Depth: '1', 'Content-Type': 'application/xml; charset=utf-8'
      },
      body: calendarQueryBody(rangeStart, rangeEnd, { expand: true })
    })
    if (response.status !== 207) throw new Error(`Radicale request failed: ${response.status}`)
    const events = parseMultiStatus(await response.text()).flatMap((row) =>
      (row.ics ? parseCalendar(row.ics, { expanded: true }) : []).map((event) => ({
        ...calendar,
        id: `radicale:${event.uid}:${event.recurrenceId || event.start.toISOString()}`,
        providerCalendarId: calendarPath, providerEventId: row.href,
        seriesId: `radicale:${event.uid}`,
        title: event.summary || '(Sin título)', description: event.description || '',
        location: event.location || '',
        start: event.allDay ? civilDate(event.start) : event.start.toISOString(),
        end: event.allDay ? civilDate(event.end) : event.end.toISOString(),
        allDay: Boolean(event.allDay), tzUnknown: event.tzUnknown,
        url: null, status: 'confirmed'
      }))
    )
    return { events, calendars: [calendar], statuses: [{ source: 'radicale', ok: true, lastSyncedAt: new Date().toISOString() }] }
  } catch (error) {
    return { events: [], calendars: [calendar], statuses: [{ source: 'radicale', ok: false, lastError: error.message }] }
  }
}
