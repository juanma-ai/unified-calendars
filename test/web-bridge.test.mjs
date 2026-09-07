import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebBridge } from '../src/renderer/src/webBridge.js'
function browser() {
  const entries = new Map()
  return { localStorage: { getItem: k => entries.get(k), setItem: (k, v) => entries.set(k, v) }, location: { pathname: '/', search: '?view=day&date=2026-09-07', assign(url) { this.redirect = url } }, open() {} }
}
test('preferences stay local and RPC only exposes family reads', async () => {
  const calls = [], b = browser()
  const api = createWebBridge(b, async (...args) => { calls.push(args); return new Response('[]') })
  await api.setCalendarVisibility('radicale:familia', false)
  assert.equal((await api.getPreferences()).calendarVisibility['radicale:familia'], false)
  assert.equal((await api.getPreferences()).timeZone, 'Europe/Madrid')
  assert.equal(calls.length, 0)
  await api.getUnifiedEvents('a', 'b')
  assert.equal(calls[0][0], '/api/getUnifiedEvents'); assert.equal(calls[0][1].body, '["a","b"]')
  assert.equal(api.updateEventTime, undefined); assert.equal(api.startTracking, undefined)
  await assert.rejects(api.openExternal('javascript:alert(1)'), /Unsupported/)
})
test('expired sessions return through login with the original deep link', async () => {
  const b = browser(), api = createWebBridge(b, async () => new Response('', { status: 401 }))
  await assert.rejects(api.getSourceStatus(), /sesión/)
  assert.ok(b.location.redirect.includes(encodeURIComponent(b.location.pathname + b.location.search)))
})
