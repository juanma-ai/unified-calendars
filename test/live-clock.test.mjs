import assert from 'node:assert/strict'
import test from 'node:test'

import { createLiveClock } from '../src/renderer/src/liveClock.js'

/** A controllable stand-in for setInterval, so the tests never wait on real time. */
function fakeTimers() {
  const timers = new Map()
  let nextId = 1

  return {
    schedule(fn, intervalMs) {
      const id = nextId++
      timers.set(id, { fn, intervalMs })
      return id
    },
    cancel(id) {
      timers.delete(id)
    },
    tick() {
      for (const { fn } of [...timers.values()]) fn()
    },
    get count() {
      return timers.size
    },
    get intervals() {
      return [...timers.values()].map((timer) => timer.intervalMs)
    }
  }
}

function setup({ intervalMs } = {}) {
  const timers = fakeTimers()
  let value = 1000
  const clock = createLiveClock({
    intervalMs,
    now: () => value,
    schedule: timers.schedule,
    cancel: timers.cancel
  })

  return { clock, timers, advance: (ms) => (value += ms) }
}

test('every subscriber reads the same moment, so the three surfaces cannot disagree', () => {
  const { clock, timers, advance } = setup()
  const seen = []

  clock.subscribe(() => seen.push(['grid', clock.getSnapshot()]))
  clock.subscribe(() => seen.push(['sidebar', clock.getSnapshot()]))
  clock.subscribe(() => seen.push(['popover', clock.getSnapshot()]))

  advance(30_000)
  timers.tick()

  assert.deepEqual(seen, [
    ['grid', 31_000],
    ['sidebar', 31_000],
    ['popover', 31_000]
  ])
})

test('three subscribers share one timer, not three', () => {
  const { clock, timers } = setup({ intervalMs: 30_000 })

  const stopA = clock.subscribe(() => {})
  const stopB = clock.subscribe(() => {})
  const stopC = clock.subscribe(() => {})

  assert.equal(timers.count, 1)
  assert.deepEqual(timers.intervals, [30_000])

  stopA()
  stopB()
  assert.equal(timers.count, 1, 'the timer keeps running while anything is still watching')

  stopC()
  assert.equal(timers.count, 0, 'and stops once nothing is')
})

test('the timer restarts for a later subscriber', () => {
  const { clock, timers, advance } = setup()

  clock.subscribe(() => {})()
  assert.equal(timers.count, 0)

  let seen = null
  clock.subscribe(() => {
    seen = clock.getSnapshot()
  })
  advance(30_000)
  timers.tick()

  assert.equal(timers.count, 1)
  assert.equal(seen, 31_000)
})

test('unsubscribing mid-tick does not skip the subscriber after it', () => {
  const { clock, timers, advance } = setup()
  const seen = []

  const stop = clock.subscribe(() => {
    seen.push('first')
    stop()
  })
  clock.subscribe(() => seen.push('second'))

  advance(30_000)
  timers.tick()

  assert.deepEqual(seen, ['first', 'second'])
})

test('the snapshot is stable between ticks, so React is not re-rendered on every read', () => {
  const { clock, advance } = setup()

  clock.subscribe(() => {})
  const first = clock.getSnapshot()
  advance(5_000)

  assert.equal(clock.getSnapshot(), first, 'the value only moves when the timer fires')
})
