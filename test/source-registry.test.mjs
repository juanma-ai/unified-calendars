import test from 'node:test'
import assert from 'node:assert/strict'
import { createAggregator, createFamilyAggregator, SOURCE_TTL_MS } from '../src/main/sourceRegistry.js'
test('source cache respects range, expiry, forced refresh and stale failure', async () => {
  let calls = 0, fail = false
  const api = createAggregator({ fetchers: { radicale: async () => {
    calls++
    return { events: fail ? [] : [{ id: 'a', start: '2026-09-07' }], statuses: [{ source: 'radicale', ok: !fail }] }
  } } })
  await api.getUnifiedEvents('a', 'b'); await api.getUnifiedEvents('a', 'b')
  assert.equal(calls, 1); assert.ok(SOURCE_TTL_MS.radicale > 0)
  await api.getUnifiedEvents('b', 'c'); assert.equal(calls, 2)
  fail = true
  const events = await api.getUnifiedEvents('a', 'b', { force: true })
  assert.equal(events.length, 1); assert.equal(api.getSourceStatus()[0].ok, false)
})
test('family registry imports without Electron and only loads the two family sources', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline') })
  const api = createFamilyAggregator()
  await api.getUnifiedEvents('2026-09-07', '2026-09-08')
  assert.deepEqual(api.getSourceStatus().map(s => s.source).sort(), ['radicale', 'vikunja'])
})
