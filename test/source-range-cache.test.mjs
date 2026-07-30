import assert from 'node:assert/strict'
import test from 'node:test'

import { createSourceRangeCache } from '../src/main/sourceRangeCache.js'

const WEEK = ['2026-07-27T00:00:00.000Z', '2026-08-02T23:59:59.999Z']
const MONTH = ['2026-06-29T00:00:00.000Z', '2026-08-02T23:59:59.999Z']

test('entries for different ranges of the same source coexist', () => {
  const cache = createSourceRangeCache()

  cache.remember('google', ...WEEK, { events: ['week'] })
  cache.remember('google', ...MONTH, { events: ['month'] })

  assert.deepEqual(cache.get('google', ...WEEK).events, ['week'])
  assert.deepEqual(cache.get('google', ...MONTH).events, ['month'])
})

test('sources do not collide on the same range', () => {
  const cache = createSourceRangeCache()

  cache.remember('google', ...WEEK, { events: ['g'] })
  cache.remember('trello', ...WEEK, { events: ['t'] })

  assert.deepEqual(cache.get('google', ...WEEK).events, ['g'])
  assert.deepEqual(cache.get('trello', ...WEEK).events, ['t'])
})

test('lastFor returns the most recent entry for a source in any range', () => {
  const cache = createSourceRangeCache()

  cache.remember('google', ...WEEK, { events: ['week'] })
  cache.remember('google', ...MONTH, { events: ['month'] })

  assert.deepEqual(cache.lastFor('google').events, ['month'])
  assert.equal(cache.lastFor('reminders'), undefined)
})

test('the oldest range is evicted once the cache is full', () => {
  const cache = createSourceRangeCache({ maxEntries: 2 })

  cache.remember('google', 'a', 'a', { events: ['a'] })
  cache.remember('google', 'b', 'b', { events: ['b'] })
  cache.remember('google', 'c', 'c', { events: ['c'] })

  assert.equal(cache.size, 2)
  assert.equal(cache.get('google', 'a', 'a'), undefined)
  assert.deepEqual(cache.get('google', 'c', 'c').events, ['c'])
})

test('rewriting a range keeps it from being evicted first', () => {
  const cache = createSourceRangeCache({ maxEntries: 2 })

  cache.remember('google', 'a', 'a', { events: ['a'] })
  cache.remember('google', 'b', 'b', { events: ['b'] })
  cache.remember('google', 'a', 'a', { events: ['a2'] })
  cache.remember('google', 'c', 'c', { events: ['c'] })

  assert.deepEqual(cache.get('google', 'a', 'a').events, ['a2'])
  assert.equal(cache.get('google', 'b', 'b'), undefined)
})

test('invalidating a source clears every range it cached, and only that source', () => {
  const cache = createSourceRangeCache()

  cache.remember('google', ...WEEK, { events: ['g-week'] })
  cache.remember('google', ...MONTH, { events: ['g-month'] })
  cache.remember('trello', ...WEEK, { events: ['t-week'] })

  cache.invalidate('google')

  assert.equal(cache.get('google', ...WEEK), undefined)
  assert.equal(cache.get('google', ...MONTH), undefined)
  assert.equal(cache.lastFor('google'), undefined)
  assert.deepEqual(cache.get('trello', ...WEEK).events, ['t-week'])
})
