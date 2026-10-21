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
  const api = createFamilyAggregator({})('juanma')
  await api.getUnifiedEvents('2026-09-07', '2026-09-08')
  assert.deepEqual(api.getSourceStatus().map(s => s.source).sort(), ['radicale', 'vikunja'])
})
test('each family member gets an aggregator of their own, reading with their own password', async t => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('https://calendar.test')) seen.push([new URL(url).pathname, options.headers.Authorization])
    throw new Error('offline')
  })
  const env = { RADICALE_URL: 'https://calendar.test', RADICALE_PASSWORD_JUANMA: 'j', RADICALE_PASSWORD_LAURA: 'l' }
  const aggregatorFor = createFamilyAggregator(env)
  assert.equal(aggregatorFor('laura'), aggregatorFor('laura'))
  assert.notEqual(aggregatorFor('laura'), aggregatorFor('juanma'))
  await aggregatorFor('laura').getUnifiedEvents('2026-09-07', '2026-09-08')
  assert.deepEqual(seen, [
    ['/laura/', `Basic ${Buffer.from('laura:l').toString('base64')}`],
    // The other member's personal calendar, with the other member's account.
    ['/juanma/', `Basic ${Buffer.from('juanma:j').toString('base64')}`]
  ])
  assert.deepEqual(aggregatorFor('juanma').getAvailableCalendars(), [])
})
