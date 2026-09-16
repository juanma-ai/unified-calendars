import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { config } from '../src/main/config.js'
import { fetchRadicaleEvents } from '../src/main/sources/radicale.js'
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
})
test('empty calendars remain visible and failures are not successful empty responses', async t => {
  setup(t, '<D:multistatus xmlns:D="DAV:"/>')
  const empty = await fetchRadicaleEvents(...range)
  assert.equal(empty.calendars[0].calendarDefaultVisible, true)
  assert.equal(empty.statuses[0].ok, true)
  globalThis.fetch = async () => new Response('', { status: 401 })
  assert.equal((await fetchRadicaleEvents(...range)).statuses[0].ok, false)
})
