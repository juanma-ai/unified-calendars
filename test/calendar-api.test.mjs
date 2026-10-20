import test from 'node:test'
import assert from 'node:assert/strict'
import { createCalendarApi } from '../src/server/calendarApi.mjs'
import { createWebServer } from '../src/server/index.mjs'
test('API allows reads and rejects mutations, prototype methods and unbounded ranges', async () => {
  const calls = []
  const users = []
  const api = createCalendarApi(user => { users.push(user); return { getUnifiedEvents: (...args) => { calls.push(args); return [] } } })
  const ctx = { user: 'juanma' }
  await api('getUnifiedEvents', ['2026-09-07', '2026-09-08'], ctx)
  assert.equal(calls.length, 1)
  assert.deepEqual(users, ['juanma'])
  for (const method of ['setReminderCompleted', 'deleteEvent', 'constructor', '__proto__']) {
    await assert.rejects(api(method, [], ctx), { status: 403 })
  }
  for (const args of [[], ['bad', 'date'], ['2026-09-08', '2026-09-07'], ['2026-01-01', '2028-01-01']]) {
    await assert.rejects(api('getUnifiedEvents', args, ctx), { status: 400 })
  }
  for (const missing of [undefined, {}, { user: '' }]) {
    await assert.rejects(api('getUnifiedEvents', ['2026-09-07', '2026-09-08'], missing), { status: 401 })
  }
})
test('writes reach the member’s own writer with only whitelisted fields, then drop their cache', async () => {
  const written = [], invalidated = [], writersFor = []
  const writer = {
    createEvent: input => { written.push(['createEvent', input]); return { providerEventId: '/juanma/casa/N.ics', etag: '"1"' } },
    updateEvent: input => { written.push(['updateEvent', input]); return { etag: '"2"' } },
    updateEventTime: input => { written.push(['updateEventTime', input]); return { etag: '"3"' } },
    moveEventToCalendar: input => { written.push(['moveEventToCalendar', input]); return { etag: '"4"' } }
  }
  const api = createCalendarApi(user => ({ invalidateSourceCache: source => invalidated.push([user, source]) }), user => { writersFor.push(user); return writer })
  const ctx = { user: 'laura' }
  const event = { source: 'radicale', providerEventId: '/laura/casa/a.ics', etag: '"e"', recurrenceId: '20261029T090000Z', title: 'ignored', raw: { x: 1 } }
  const ref = { providerEventId: '/laura/casa/a.ics', etag: '"e"', recurrenceId: '20261029T090000Z' }
  assert.deepEqual(await api('createEvent', [{ calendarPath: '/laura/casa/', title: 'Cena', start: '2026-10-24', end: '2026-10-25', attendees: ['JuanMa'] }], ctx), { providerEventId: '/juanma/casa/N.ics', etag: '"1"' })
  await api('updateEvent', [{ event, changes: { title: 'Nuevo', location: '' } }], ctx)
  await api('updateEventTime', [{ event, start: '2026-10-29T15:00:00Z', end: '2026-10-29T16:00:00Z' }], ctx)
  await api('moveEventToCalendar', [{ event: { ...event, recurrenceId: undefined }, calendarPath: '/laura/personal/' }], ctx)
  assert.deepEqual(written, [
    ['createEvent', { calendarPath: '/laura/casa/', title: 'Cena', start: '2026-10-24', end: '2026-10-25', attendees: ['JuanMa'] }],
    ['updateEvent', { event: ref, changes: { title: 'Nuevo', location: '' } }],
    ['updateEventTime', { event: ref, start: '2026-10-29T15:00:00Z', end: '2026-10-29T16:00:00Z' }],
    ['moveEventToCalendar', { event: { ...ref, recurrenceId: null }, calendarPath: '/laura/personal/' }]
  ])
  assert.deepEqual(new Set(writersFor), new Set(['laura']))
  assert.deepEqual(invalidated, Array(4).fill(['laura', 'radicale']))
})
test('writes reject other sources, unknown fields and oversized input before reaching Radicale', async () => {
  let reached = false
  const api = createCalendarApi(() => ({ invalidateSourceCache() {} }), () => new Proxy({}, { get: () => () => { reached = true } }))
  const ctx = { user: 'juanma' }
  const event = { source: 'radicale', providerEventId: '/juanma/casa/a.ics', etag: '"e"' }
  await assert.rejects(api('updateEventTime', [{ event: { ...event, source: 'vikunja' }, start: '2026-10-29', end: '2026-10-30' }], ctx), { status: 403 })
  for (const args of [
    [], [{ event }, {}], [null], [{ event: { ...event, etag: '' }, changes: {} }], [{ event: { ...event, providerEventId: 3 }, changes: {} }],
    [{ event, changes: { color: 'red' } }], [{ event, changes: { title: 'x'.repeat(201) } }], [{ event, changes: { attendees: ['a', 'b', 'c'] } }],
    [{ event, changes: { __proto__: { title: 'x' }, sequence: 9 } }], [{ event, changes: [] }]
  ]) await assert.rejects(api('updateEvent', args, ctx), { status: 400 })
  await assert.rejects(api('createEvent', [{ title: 'x', start: '2026-10-24', end: '2026-10-25' }], ctx), { status: 400 })
  await assert.rejects(api('moveEventToCalendar', [{ event, calendarPath: 7 }], ctx), { status: 400 })
  assert.equal(reached, false)
  // Without a writer the API stays read-only.
  await assert.rejects(createCalendarApi(() => ({}))('updateEvent', [{ event, changes: {} }], ctx), { status: 403 })
})
test('HTTP gates data on auth and validates origin, body and method', async t => {
  let loggedIn = false, received
  const api = createCalendarApi(() => ({ getSourceStatus: () => [{ source: 'radicale', ok: true }] }))
  const server = createWebServer({ publicUrl: 'https://family.test', auth: async (req, res) => {
    if (loggedIn) return { sub: 'family-sub', user: 'laura' }
    res.statusCode = 401; res.end(); return false
  }, api: (method, args, ctx) => { received = ctx; return api(method, args, ctx) } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const url = `http://127.0.0.1:${server.address().port}/api/getSourceStatus`
  assert.equal((await fetch(url)).status, 401)
  loggedIn = true
  assert.equal((await fetch(url)).status, 405)
  assert.equal((await fetch(url, { method: 'POST', body: '[]' })).status, 403)
  const headers = { Origin: 'https://family.test', 'Content-Type': 'application/json' }
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{' })).status, 400)
  const response = await fetch(url, { method: 'POST', headers, body: '[]' })
  assert.deepEqual(await response.json(), [{ source: 'radicale', ok: true }])
  assert.deepEqual(received, { user: 'laura' })
})
