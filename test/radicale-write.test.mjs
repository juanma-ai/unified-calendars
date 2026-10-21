import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRadicaleWriter } from '../src/server/radicaleWrite.mjs'
import ICAL from 'ical.js'
import { parseCalendar } from '../vendor/casa-agent/src/radicale.mjs'

// Both written by an iPhone and read straight off Radicale's storage.
const single = readFileSync(new URL('../vendor/casa-agent/test/fixtures/iphone-evento-tzid.ics', import.meta.url), 'utf8')
const series = readFileSync(new URL('./fixtures/iphone-serie-excepcion-alarma.ics', import.meta.url), 'utf8')
const SERIES = '/juanma/personal/6616F542-8F92-44DC-BEA8-7C6035B5E7FF.ics'
const SINGLE = '/juanma/casa/26AAC2DE.ics'

const collection = (href, name) => `<response><href>${href}</href><propstat><prop><resourcetype><C:calendar /><collection /></resourcetype><displayname>${name}</displayname><C:supported-calendar-component-set><C:comp name="VEVENT" /></C:supported-calendar-component-set></prop></propstat></response>`
const discovery = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><response><href>/juanma/</href><propstat><prop><resourcetype><principal /><collection /></resourcetype></prop></propstat></response>${collection('/juanma/personal/', 'Personal')}${collection('/juanma/casa/', 'Familia')}</multistatus>`

// Just enough Radicale: a file store with etags that honours If-Match,
// If-None-Match and MOVE the way 3.8 does.
function fakeRadicale(t, files = { [SERIES]: series, [SINGLE]: single }) {
  const store = new Map(Object.entries(files).map(([href, ics]) => [href, { ics, etag: `"${href.length}-0"` }]))
  const requests = []
  let version = 0
  const fetch = async (url, init) => {
    const path = new URL(url).pathname
    requests.push({ path, method: init.method, headers: init.headers })
    if (init.method === 'PROPFIND') return new Response(discovery, { status: 207 })
    const file = store.get(path)
    const ifMatch = init.headers['If-Match']
    if (ifMatch && ifMatch !== file?.etag) return new Response('', { status: 412 })
    if (init.method === 'GET') return file ? new Response(file.ics, { status: 200, headers: { ETag: file.etag } }) : new Response('', { status: 404 })
    if (init.method === 'PUT') {
      if (init.headers['If-None-Match'] === '*' && file) return new Response('', { status: 412 })
      const etag = `"${path.length}-${++version}"`
      store.set(path, { ics: init.body, etag })
      return new Response(null, { status: file ? 204 : 201, headers: { ETag: etag } })
    }
    if (init.method === 'DELETE') {
      if (!file) return new Response('', { status: 404 })
      store.delete(path)
      return new Response(null, { status: 204 })
    }
    if (init.method === 'MOVE') {
      const destination = new URL(init.headers.Destination).pathname
      store.set(destination, file); store.delete(path)
      return new Response('', { status: 201 })
    }
    return new Response('', { status: 405 })
  }
  const writer = createRadicaleWriter({
    baseUrl: 'https://radicale.test', user: 'juanma', password: 'secret', fetch,
    now: () => new Date('2026-10-20T21:00:00Z'), uid: () => 'NEW-UID'
  })
  return { writer, store, requests, etagOf: href => store.get(href).etag }
}

const vevents = ics => ics.replace(/\r\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1).map(block => block.split('END:VEVENT')[0])
const exceptionFor = (ics, id) => vevents(ics).find(block => block.includes(`RECURRENCE-ID;TZID=Europe/Madrid:${id}`))

test('moving one occurrence writes a RECURRENCE-ID exception in the series zone and keeps the alarm', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  const event = { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261029T090000Z' }
  const result = await writer.updateEventTime({ event, start: '2026-10-29T15:00:00Z', end: '2026-10-29T16:30:00Z' })
  assert.equal(result.providerEventId, SERIES)
  assert.equal(result.etag, etagOf(SERIES))
  const ics = store.get(SERIES).ics
  const exception = exceptionFor(ics, '20261029T100000')
  assert.ok(exception, 'exception keyed by the series TZID, 10:00 Madrid = 09:00Z')
  assert.match(exception, /DTSTART;TZID=Europe\/Madrid:20261029T160000/)
  assert.match(exception, /DTEND;TZID=Europe\/Madrid:20261029T173000/)
  assert.match(exception, /TRIGGER:-PT15M/)
  assert.match(exception, /X-APPLE-CREATOR-IDENTITY:com.apple.mobilecal/)
  assert.doesNotMatch(exception, /RRULE/)
  assert.match(exception, /SEQUENCE:1/)
  // The series itself, its alarm and the iPhone's own exception are untouched.
  const [master] = vevents(ics)
  assert.match(master, /RRULE:FREQ=WEEKLY/)
  assert.match(master, /DTSTART;TZID=Europe\/Madrid:20261022T100000/)
  assert.match(master, /TRIGGER:-PT15M/)
  assert.ok(exceptionFor(ics, '20261112T100000'))
  assert.equal(vevents(ics).length, 3)
  assert.match(ics, /BEGIN:VTIMEZONE[\s\S]*TZID:Europe\/Madrid/)
  // casa-agent's parser, the one the web reads with, sees the moved occurrence.
  const moved = parseCalendar(ics).filter(e => e.recurrenceId)
  assert.ok(moved.some(e => e.start.toISOString() === '2026-10-29T15:00:00.000Z'))
})

test('an occurrence the iPhone already split is edited in place, not duplicated', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  // The expanded REPORT names it in UTC; the file stores it in Europe/Madrid.
  const event = { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261112T090000Z' }
  await writer.updateEvent({ event, changes: { title: 'Solo esta', attendees: ['Laura', 'JuanMa'] } })
  const ics = store.get(SERIES).ics
  assert.equal(vevents(ics).length, 2)
  const exception = exceptionFor(ics, '20261112T100000')
  assert.match(exception, /SUMMARY:Solo esta/)
  assert.match(exception, /DTSTART;TZID=Europe\/Madrid:20261112T110000/, 'the iPhone-moved time survives')
  assert.match(exception, /ACTION:NONE/)
  assert.deepEqual([...exception.matchAll(/X-FAMILIA-ASISTENTE:(\w+)/g)].map(m => m[1]), ['JuanMa', 'Laura'])
  assert.match(vevents(ics)[0], /SUMMARY:Prueba serie web/)
})

test('editing a standalone event keeps VTIMEZONE, X-APPLE and the empty URL', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  await writer.updateEvent({
    event: { providerEventId: SINGLE, etag: etagOf(SINGLE) },
    changes: { title: 'Pintor', location: 'Casa', description: 'Línea uno\nLínea dos, con coma', attendees: ['Laura'] }
  })
  const ics = store.get(SINGLE).ics
  assert.match(ics, /SUMMARY:Pintor/)
  assert.match(ics, /DESCRIPTION:Línea uno\\nLínea dos\\, con coma/)
  assert.match(ics, /X-FAMILIA-ASISTENTE:Laura/)
  assert.doesNotMatch(ics, /X-FAMILIA-ASISTENTE:JuanMa/)
  assert.match(ics, /DTSTART;TZID=Europe\/Madrid:20260907T083000/)
  assert.match(ics, /X-APPLE-CREATOR-TEAM-IDENTITY/)
  // ical.js drops VALUE=URI because URI is already URL's default type.
  assert.match(ics, /^URL(;VALUE=URI)?:\r$/m)
  assert.match(ics, /BEGIN:VTIMEZONE/)
  await writer.updateEvent({ event: { providerEventId: SINGLE, etag: etagOf(SINGLE) }, changes: { location: '', attendees: [] } })
  assert.doesNotMatch(store.get(SINGLE).ics, /LOCATION|X-FAMILIA-ASISTENTE/)
})

test('switching to all day writes DATE values and an exclusive end', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  await writer.updateEventTime({ event: { providerEventId: SINGLE, etag: etagOf(SINGLE) }, start: '2026-09-07', end: '2026-09-09' })
  const ics = store.get(SINGLE).ics
  assert.match(ics, /DTSTART;VALUE=DATE:20260907/)
  assert.match(ics, /DTEND;VALUE=DATE:20260909/)
  const [parsed] = parseCalendar(ics)
  assert.equal(parsed.allDay, true)
})

test('creating writes a new file with If-None-Match and a Madrid VTIMEZONE', async t => {
  const { writer, store, requests } = fakeRadicale(t)
  const result = await writer.createEvent({
    calendarPath: '/juanma/casa/', title: 'Cena', start: '2026-10-24T19:00:00Z', end: '2026-10-24T21:00:00Z', attendees: ['JuanMa']
  })
  assert.equal(result.providerEventId, '/juanma/casa/NEW-UID.ics')
  assert.equal(requests.at(-1).headers['If-None-Match'], '*')
  const ics = store.get('/juanma/casa/NEW-UID.ics').ics
  assert.match(ics, /UID:NEW-UID/)
  assert.match(ics, /DTSTART;TZID=Europe\/Madrid:20261024T210000/)
  assert.match(ics, /BEGIN:VTIMEZONE[\s\S]*TZID:Europe\/Madrid/)
  assert.match(ics, /SEQUENCE:0/)
  assert.equal(parseCalendar(ics)[0].start.toISOString(), '2026-10-24T19:00:00.000Z')
  // A UID that already exists is refused rather than overwritten.
  await assert.rejects(writer.createEvent({ calendarPath: '/juanma/casa/', title: 'Otra', start: '2026-10-24', end: '2026-10-25' }), { status: 409 })
})

test('a stale etag is a conflict, from the GET or from the PUT', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  const before = store.get(SINGLE).ics
  await assert.rejects(writer.updateEvent({ event: { providerEventId: SINGLE, etag: '"old"' }, changes: { title: 'x' } }), { status: 409, code: 'conflict' })
  assert.equal(store.get(SINGLE).ics, before)
  // Someone saves between our GET and our PUT.
  const event = { providerEventId: SINGLE, etag: etagOf(SINGLE) }
  const writing = writer.updateEvent({ event, changes: { title: 'x' } })
  store.get(SINGLE).etag = '"changed"'
  await assert.rejects(writing, { status: 409 })
})

test('paths outside the member’s own calendars are refused before any read', async t => {
  const { writer, requests } = fakeRadicale(t)
  for (const href of ['/laura/personal/a.ics', '/familia/casa/a.ics', '/juanma/personal/../../laura/personal/a.ics', '/juanma/personal/a%2F..%2Fb.ics', '/juanma/personal/', '/juanma/personal/sub/a.ics', undefined]) {
    await assert.rejects(writer.updateEvent({ event: { providerEventId: href, etag: '"x"' }, changes: {} }), { status: href ? 403 : 400 })
  }
  await assert.rejects(writer.createEvent({ calendarPath: '/laura/personal/', title: 'x', start: '2026-10-24', end: '2026-10-25' }), { status: 403 })
  assert.ok(requests.every(r => r.method === 'PROPFIND'))
})

test('bad input is refused without writing', async t => {
  const { writer, requests, etagOf } = fakeRadicale(t)
  const event = { providerEventId: SINGLE, etag: etagOf(SINGLE) }
  for (const changes of [
    { attendees: ['Agatha'] }, { attendees: 'JuanMa' }, { title: '' }, { title: 3 },
    { start: '2026-09-07T10:00:00Z', end: '2026-09-07T09:00:00Z' },
    { start: '2026-09-07', end: '2026-09-07T09:00:00Z' }, { start: 'mañana', end: 'pasado' }, { start: '2026-02-30', end: '2026-03-01' }
  ]) await assert.rejects(writer.updateEvent({ event, changes }), { status: 400 })
  await assert.rejects(writer.updateEvent({ event: { ...event, recurrenceId: '20261029T090000Z' }, changes: {} }), { status: 400 })
  await assert.rejects(writer.updateEvent({ event: { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261030T090000Z' }, changes: {} }), { status: 404 })
  assert.ok(!requests.some(r => r.method === 'PUT'))
})

test('a standalone event moves between calendars; a series never does', async t => {
  const { writer, store, requests, etagOf } = fakeRadicale(t)
  const result = await writer.moveEventToCalendar({ event: { providerEventId: SINGLE, etag: etagOf(SINGLE) }, calendarPath: '/juanma/personal/' })
  assert.equal(result.providerEventId, '/juanma/personal/26AAC2DE.ics')
  assert.ok(store.has('/juanma/personal/26AAC2DE.ics') && !store.has(SINGLE))
  const move = requests.find(r => r.method === 'MOVE')
  assert.equal(move.headers.Destination, 'https://radicale.test/juanma/personal/26AAC2DE.ics')
  assert.equal(move.headers.Overwrite, 'F')
  for (const event of [
    { providerEventId: SERIES, etag: etagOf(SERIES) },
    { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261029T090000Z' }
  ]) await assert.rejects(writer.moveEventToCalendar({ event, calendarPath: '/juanma/casa/' }), { status: 400, code: 'series' })
  await assert.rejects(writer.moveEventToCalendar({ event: { providerEventId: '/juanma/personal/26AAC2DE.ics', etag: '"x"' }, calendarPath: '/laura/personal/' }), { status: 409 })
  const moved = { providerEventId: '/juanma/personal/26AAC2DE.ics', etag: store.get('/juanma/personal/26AAC2DE.ics').etag }
  await assert.rejects(writer.moveEventToCalendar({ event: moved, calendarPath: '/laura/personal/' }), { status: 403 })
})

test('deleting one occurrence adds an EXDATE in the series zone and leaves the rest', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  const event = { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261029T090000Z' }
  const result = await writer.deleteEvent({ event, scope: 'occurrence' })
  assert.equal(result.etag, etagOf(SERIES))
  const ics = store.get(SERIES).ics
  const [master] = vevents(ics)
  assert.match(master, /EXDATE;TZID=Europe\/Madrid:20261029T100000/, '10:00 Madrid = 09:00Z')
  assert.match(master, /RRULE:FREQ=WEEKLY/)
  assert.match(master, /TRIGGER:-PT15M/)
  assert.ok(exceptionFor(ics, '20261112T100000'), 'the iPhone exception is untouched')
  // Expanded the way Radicale's REPORT does, the 29th is gone and the 5th is not.
  const vcalendar = new ICAL.Component(ICAL.parse(ics))
  for (const zone of vcalendar.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(new ICAL.Timezone(zone))
  const iterator = new ICAL.Event(vcalendar.getFirstSubcomponent('vevent')).iterator()
  const starts = Array.from({ length: 4 }, () => iterator.next().toJSDate().toISOString())
  assert.deepEqual(starts, ['2026-10-22T08:00:00.000Z', '2026-11-05T09:00:00.000Z', '2026-11-12T09:00:00.000Z', '2026-11-19T09:00:00.000Z'])
})

test('deleting an occurrence the iPhone had split removes its exception too', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  const event = { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261112T090000Z' }
  await writer.deleteEvent({ event, scope: 'occurrence' })
  const ics = store.get(SERIES).ics
  assert.equal(vevents(ics).length, 1)
  assert.match(vevents(ics)[0], /EXDATE;TZID=Europe\/Madrid:20261112T100000/)
})

test('deleting the whole series removes its file; a standalone event needs no scope', async t => {
  const { writer, store, etagOf, requests } = fakeRadicale(t)
  await writer.deleteEvent({ event: { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261029T090000Z' }, scope: 'series' })
  assert.equal(store.has(SERIES), false)
  await writer.deleteEvent({ event: { providerEventId: SINGLE, etag: etagOf(SINGLE) } })
  assert.equal(store.has(SINGLE), false)
  const deletes = requests.filter(r => r.method === 'DELETE')
  assert.deepEqual(deletes.map(r => [r.path, Boolean(r.headers['If-Match'])]), [[SERIES, true], [SINGLE, true]])
})

test('deleting refuses a missing scope, a stale etag, foreign paths and mixed files', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  const occurrence = { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261029T090000Z' }
  await assert.rejects(writer.deleteEvent({ event: occurrence }), { status: 400 })
  await assert.rejects(writer.deleteEvent({ event: occurrence, scope: 'all' }), { status: 400 })
  await assert.rejects(writer.deleteEvent({ event: { ...occurrence, etag: '"old"' }, scope: 'series' }), { status: 409 })
  await assert.rejects(writer.deleteEvent({ event: { providerEventId: '/laura/personal/x.ics', etag: '"1"' } }), { status: 403 })
  // A series addressed without its occurrence is not a standalone event.
  await assert.rejects(writer.deleteEvent({ event: { providerEventId: SERIES, etag: etagOf(SERIES) } }), { status: 400 })
  assert.equal(store.has(SERIES), true)

  const mixed = single.replace('END:VCALENDAR', single.slice(single.indexOf('BEGIN:VEVENT'), single.indexOf('END:VEVENT') + 10).replace(/^UID:.*$/m, 'UID:OTHER') + '\r\nEND:VCALENDAR')
  const other = fakeRadicale(t, { [SERIES]: mixed.replace(/END:VEVENT/, 'RRULE:FREQ=WEEKLY\r\nEND:VEVENT') })
  const mixedEvent = { providerEventId: SERIES, etag: other.etagOf(SERIES), recurrenceId: '20260907T060000Z' }
  await assert.rejects(other.writer.deleteEvent({ event: mixedEvent, scope: 'series' }), { status: 400, code: 'invalid-event', message: /more than one event/ })
  assert.equal(other.store.has(SERIES), true)
})

test('a DELETE that loses the race is a conflict', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  const event = { providerEventId: SINGLE, etag: etagOf(SINGLE) }
  const realGet = store.get.bind(store)
  // The GET sees the client's etag; someone saves before the DELETE lands.
  let reads = 0
  store.get = path => {
    const file = realGet(path)
    return ++reads > 1 && file ? { ...file, etag: '"changed"' } : file
  }
  await assert.rejects(writer.deleteEvent({ event }), { status: 409 })
})

test('an all-day series gets a date-valued EXDATE', async t => {
  const allDay = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//ES\r\nBEGIN:VEVENT\r\nUID:AD\r\nDTSTAMP:20261001T000000Z\r\nDTSTART;VALUE=DATE:20261024\r\nDTEND;VALUE=DATE:20261025\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:Mercado\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'
  const { writer, store, etagOf } = fakeRadicale(t, { [SERIES]: allDay })
  await writer.deleteEvent({ event: { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261031' }, scope: 'occurrence' })
  assert.match(store.get(SERIES).ics, /EXDATE;VALUE=DATE:20261031\r\n/)
})

test('private is written on every VEVENT of a personal file, cleared with false, refused in Familia', async t => {
  const { writer, store, etagOf } = fakeRadicale(t)
  // An occurrence of the series marks the whole file, exceptions and alarm kept.
  await writer.updateEvent({ event: { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261029T090000Z' }, changes: { private: true } })
  const ics = store.get(SERIES).ics
  // No RECURRENCE-ID exception just for the flag.
  assert.equal(vevents(ics).length, vevents(series).length)
  assert.ok(vevents(ics).every(block => /X-FAMILIA-PRIVADO:TRUE/.test(block)))
  assert.match(ics, /BEGIN:VALARM/)
  await writer.updateEvent({ event: { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261029T090000Z' }, changes: { private: false } })
  assert.doesNotMatch(store.get(SERIES).ics, /X-FAMILIA-PRIVADO/)

  const created = await writer.createEvent({ calendarPath: '/juanma/personal/', title: 'Médico', start: '2026-10-24', end: '2026-10-25', private: true })
  assert.match(store.get(created.providerEventId).ics, /X-FAMILIA-PRIVADO:TRUE/)
  await assert.rejects(writer.createEvent({ calendarPath: '/juanma/casa/', title: 'x', start: '2026-10-24', end: '2026-10-25', private: true }), { status: 400 })
  await assert.rejects(writer.updateEvent({ event: { providerEventId: SINGLE, etag: etagOf(SINGLE) }, changes: { private: true } }), { status: 400 })
  await assert.rejects(writer.updateEvent({ event: { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261029T090000Z' }, changes: { private: 'yes' } }), { status: 400 })
  await assert.rejects(writer.updateEvent({ event: { providerEventId: SERIES, etag: etagOf(SERIES), recurrenceId: '20261030T090000Z' }, changes: { private: true } }), { status: 404 })
  // A private event cannot be moved into Familia; it has to be made public first.
  await assert.rejects(writer.moveEventToCalendar({ event: { providerEventId: created.providerEventId, etag: etagOf(created.providerEventId) }, calendarPath: '/juanma/casa/' }), { status: 400 })
  assert.ok(store.has(created.providerEventId))
})
