import test from 'node:test'
import assert from 'node:assert/strict'
import { createCalendarApi } from '../src/server/calendarApi.mjs'
import { createWebServer } from '../src/server/index.mjs'
test('API allows reads and rejects mutations, prototype methods and unbounded ranges', async () => {
  const calls = []
  const api = createCalendarApi({ getUnifiedEvents: (...args) => { calls.push(args); return [] } })
  await api('getUnifiedEvents', ['2026-09-07', '2026-09-08'])
  assert.equal(calls.length, 1)
  for (const method of ['updateEventTime', 'setReminderCompleted', 'constructor', '__proto__']) {
    await assert.rejects(api(method, []), { status: 403 })
  }
  for (const args of [[], ['bad', 'date'], ['2026-09-08', '2026-09-07'], ['2026-01-01', '2028-01-01']]) {
    await assert.rejects(api('getUnifiedEvents', args), { status: 400 })
  }
})
test('HTTP gates data on auth and validates origin, body and method', async t => {
  let loggedIn = false
  const server = createWebServer({ publicUrl: 'https://family.test', auth: async (req, res) => {
    if (loggedIn) return true
    res.statusCode = 401; res.end(); return false
  }, api: createCalendarApi({ getSourceStatus: () => [{ source: 'radicale', ok: true }] }) })
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
})
