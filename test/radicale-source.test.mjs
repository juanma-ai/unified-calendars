import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { config } from '../src/main/config.js'
import { createUserRadicaleFetcher, fetchRadicaleEvents } from '../src/main/sources/radicale.js'
const range = ['2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z']
const wrap = ics => `<D:multistatus xmlns:D="DAV:"><D:response><D:href>/familia/casa/a.ics</D:href><D:propstat><D:prop><C:calendar-data xmlns:C="urn:ietf:params:xml:ns:caldav"><![CDATA[${ics}]]></C:calendar-data></D:prop></D:propstat></D:response></D:multistatus>`
function setup(t, body, status = 207) {
  const before = config.radicale
  config.radicale = { baseUrl: 'https://calendar.test', username: 'test', password: 'test', calendarPath: '/familia/casa/' }
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options }); return new Response(body, { status })
  })
  t.after(() => { config.radicale = before })
  return requests
}
test('reads the actual iPhone fixture using REPORT expand and Depth 1', async t => {
  const requests = setup(t, wrap(readFileSync(new URL('../vendor/casa-agent/test/fixtures/iphone-evento-tzid.ics', import.meta.url), 'utf8')))
  const result = await fetchRadicaleEvents(...range)
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].start, '2026-09-07T06:30:00.000Z')
  assert.equal(requests[0].options.method, 'REPORT')
  assert.equal(requests[0].options.headers.Depth, '1')
  assert.match(requests[0].options.body, /expand/)
  assert.equal(result.events[0].url, null)
  assert.equal(result.events[0].recurrenceId, null)
})
test('all-day dates remain civil and the end remains exclusive', async t => {
  setup(t, wrap('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:day\r\nDTSTART;VALUE=DATE:20261024\r\nDTEND;VALUE=DATE:20261027\r\nEND:VEVENT\r\nEND:VCALENDAR'))
  const { events } = await fetchRadicaleEvents(...range)
  assert.equal(events[0].start, '2026-10-24'); assert.equal(events[0].end, '2026-10-27')
})
test('expanded occurrences get distinct ids', async t => {
  setup(t, wrap('BEGIN:VCALENDAR\r\n' + [7, 14].map(d => `BEGIN:VEVENT\r\nUID:series\r\nRECURRENCE-ID:202609${String(d).padStart(2, '0')}T060000Z\r\nDTSTART:202609${String(d).padStart(2, '0')}T060000Z\r\nEND:VEVENT`).join('\r\n') + '\r\nEND:VCALENDAR'))
  const { events } = await fetchRadicaleEvents(...range)
  assert.equal(events.length, 2); assert.equal(new Set(events.map(e => e.id)).size, 2)
  assert.deepEqual(events.map(e => e.recurrenceId), ['20260907T060000Z', '20260914T060000Z'])
})
test('empty calendars remain visible and failures are not successful empty responses', async t => {
  setup(t, '<D:multistatus xmlns:D="DAV:"/>')
  const empty = await fetchRadicaleEvents(...range)
  assert.equal(empty.calendars[0].calendarDefaultVisible, true)
  assert.equal(empty.statuses[0].ok, true)
  globalThis.fetch = async () => new Response('', { status: 401 })
  assert.equal((await fetchRadicaleEvents(...range)).statuses[0].ok, false)
})

// Captured from Radicale 3.8 for /juanma/ on 2026-10-20 (PROPFIND Depth 1).
const discovery = user => `<?xml version='1.0' encoding='utf-8'?>
<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:ICAL="http://apple.com/ns/ical/"><response><href>/${user}/</href><propstat><prop><resourcetype><principal /><collection /></resourcetype></prop><status>HTTP/1.1 200 OK</status></propstat></response><response><href>/${user}/personal/</href><propstat><prop><resourcetype><C:calendar /><collection /></resourcetype><displayname>Mi &amp; calendario</displayname><ICAL:calendar-color>#CB30E0FF</ICAL:calendar-color><C:supported-calendar-component-set><C:comp name="VEVENT" /></C:supported-calendar-component-set></prop><status>HTTP/1.1 200 OK</status></propstat></response><response><href>/${user}/933EDB9E/</href><propstat><prop><resourcetype><C:calendar /><collection /></resourcetype><displayname>DEFAULT_TASK_CALENDAR_NAME</displayname><C:supported-calendar-component-set><C:comp name="VTODO" /></C:supported-calendar-component-set></prop><status>HTTP/1.1 200 OK</status></propstat></response><response><href>/${user}/casa/</href><propstat><prop><resourcetype><C:calendar /><collection /></resourcetype><displayname>Familia</displayname><ICAL:calendar-color>#FF8D28</ICAL:calendar-color><C:supported-calendar-component-set><C:comp name="VEVENT" /></C:supported-calendar-component-set></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`
const eventIn = (href, uid) => `<multistatus xmlns="DAV:"><response><href>${href}${uid}.ics</href><propstat><prop><getetag>"etag-${uid}"</getetag><C:calendar-data xmlns:C="urn:ietf:params:xml:ns:caldav">BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:20260907T060000Z\r\nDTEND:20260907T070000Z\r\nSUMMARY:${uid}\r\nEND:VEVENT\r\nEND:VCALENDAR</C:calendar-data></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`
function davServer(t, user, { failing } = {}) {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname
    requests.push({ path, options })
    if (options.method === 'PROPFIND') return new Response(discovery(user), { status: 207 })
    if (path === failing) return new Response('', { status: 403 })
    return new Response(eventIn(path, path.split('/')[2]), { status: 207 })
  })
  return requests
}

test('per-user source discovers the member\'s event calendars with their own credentials', async t => {
  const requests = davServer(t, 'laura')
  const fetchEvents = createUserRadicaleFetcher({ baseUrl: 'https://calendar.test', user: 'laura', password: 'pw' })
  const result = await fetchEvents(...range)
  assert.equal(requests[0].options.method, 'PROPFIND')
  assert.equal(requests[0].path, '/laura/')
  assert.equal(requests[0].options.headers.Depth, '1')
  assert.equal(requests[0].options.headers.Authorization, `Basic ${Buffer.from('laura:pw').toString('base64')}`)
  assert.deepEqual(requests.slice(1).map(r => [r.options.method, r.path]).sort(), [['REPORT', '/laura/casa/'], ['REPORT', '/laura/personal/']])
  assert.deepEqual(result.calendars.map(c => [c.calendarId, c.calendarName, c.calendarDefaultColor, c.providerCalendarId]), [
    ['radicale:familia', 'Familia', '#059669', '/laura/casa/'],
    ['radicale:laura:personal', 'Mi & calendario', '#CB30E0', '/laura/personal/']
  ])
  const personal = result.events.find(e => e.calendarId === 'radicale:laura:personal')
  assert.equal(personal.providerCalendarId, '/laura/personal/')
  assert.equal(personal.providerEventId, '/laura/personal/personal.ics')
  assert.equal(personal.etag, '"etag-personal"')
  assert.equal(result.events.find(e => e.calendarId === 'radicale:familia').calendarName, 'Familia')
  assert.ok(result.statuses.every(s => s.source === 'radicale' && s.ok))
})

test('per-user source keeps the calendars that answer when one fails', async t => {
  davServer(t, 'juanma', { failing: '/juanma/personal/' })
  const result = await createUserRadicaleFetcher({ baseUrl: 'https://calendar.test', user: 'juanma', password: 'pw' })(...range)
  assert.deepEqual(result.events.map(e => e.calendarId), ['radicale:familia'])
  assert.equal(result.calendars.length, 2)
  assert.deepEqual(result.statuses.map(s => s.ok).sort(), [false, true])
})

test('per-user source without a password reports not-connected and makes no request', async t => {
  const requests = davServer(t, 'laura')
  const result = await createUserRadicaleFetcher({ baseUrl: 'https://calendar.test', user: 'laura' })(...range)
  assert.equal(requests.length, 0)
  assert.deepEqual(result.statuses, [{ source: 'radicale', ok: false, lastError: 'not-connected' }])
})
test('attendees come from one X-FAMILIA-ASISTENTE line per person', async t => {
  setup(t, wrap('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20260907T060000Z\r\nDTEND:20260907T070000Z\r\nX-FAMILIA-ASISTENTE:JuanMa\r\nX-FAMILIA-ASISTENTE;X-ANY=1:Laura\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:b\r\nDTSTART:20260907T060000Z\r\nDTEND:20260907T070000Z\r\nEND:VEVENT\r\nEND:VCALENDAR'))
  const { events } = await fetchRadicaleEvents(...range)
  assert.deepEqual(events.map(e => e.attendees), [['JuanMa', 'Laura'], []])
})
