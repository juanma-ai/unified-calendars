import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebBridge } from '../src/renderer/src/webBridge.js'
function browser() {
  const entries = new Map()
  return { localStorage: { getItem: k => entries.get(k), setItem: (k, v) => entries.set(k, v) }, location: { pathname: '/', search: '?view=day&date=2026-09-07', assign(url) { this.redirect = url } }, open() {} }
}
test('preferences stay local and RPC only exposes family reads and drag writes', async () => {
  const calls = [], b = browser()
  const api = createWebBridge(b, async (...args) => { calls.push(args); return new Response('[]') })
  await api.setCalendarVisibility('radicale:familia', false)
  assert.equal((await api.getPreferences()).calendarVisibility['radicale:familia'], false)
  assert.equal((await api.getPreferences()).timeZone, 'Europe/Madrid')
  assert.equal(calls.length, 0)
  await api.getUnifiedEvents('a', 'b')
  assert.equal(calls[0][0], '/api/getUnifiedEvents'); assert.equal(calls[0][1].body, '["a","b"]')
  assert.equal(api.startTracking, undefined); assert.equal(api.setReminderCompleted, undefined)
  for (const method of ['createEvent', 'updateEvent', 'moveEventToCalendar', 'deleteEvent']) assert.equal(typeof api[method], 'function')
  assert.deepEqual(api.capabilities.editableSources, ['radicale']); assert.equal(api.capabilities.readOnly, true)
  await assert.rejects(api.openExternal('javascript:alert(1)'), /Unsupported/)
})
test('expired sessions return through login with the original deep link', async () => {
  const b = browser(), api = createWebBridge(b, async () => new Response('', { status: 401 }))
  await assert.rejects(api.getSourceStatus(), /sesión/)
  assert.ok(b.location.redirect.includes(encodeURIComponent(b.location.pathname + b.location.search)))
})
test('a drag goes to the API as one object and a failed write shows the server reason', async () => {
  const calls = []
  let reply = new Response('{"etag":"2"}')
  const api = createWebBridge(browser(), async (...args) => { calls.push(args); return reply })
  const event = { source: 'radicale', providerEventId: '/juanma/casa/a.ics', etag: '"1"' }
  assert.deepEqual(await api.updateEventTime({ event, start: '2026-10-29T15:00:00Z', end: '2026-10-29T16:00:00Z' }), { etag: '2' })
  assert.equal(calls[0][0], '/api/updateEventTime')
  assert.deepEqual(JSON.parse(calls[0][1].body), [{ event, start: '2026-10-29T15:00:00Z', end: '2026-10-29T16:00:00Z' }])
  reply = new Response('{"error":"Alguien ha cambiado este evento. Recarga y vuelve a intentarlo."}', { status: 409 })
  await assert.rejects(api.updateEventTime({ event }), /Alguien ha cambiado/)
  reply = new Response('<html>', { status: 502 })
  await assert.rejects(api.updateEventTime({ event }), /No se pudo guardar el cambio \(502\)/)
  reply = new Response('', { status: 500 })
  await assert.rejects(api.getSourceStatus(), /No se pudo cargar el calendario \(500\)/)
})
