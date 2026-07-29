import assert from 'node:assert/strict'
import test from 'node:test'

import { createEventTimeUpdater, EventMutationError } from '../src/main/eventMutations.js'

const googleEvent = {
  source: 'google',
  sourceAccountId: 'work',
  providerCalendarId: 'me@example.com',
  providerEventId: 'abc123',
  start: '2026-07-20T09:00:00+02:00',
  end: '2026-07-20T10:00:00+02:00'
}

function createUpdater({ updaters = {}, invalidated = [] } = {}) {
  return createEventTimeUpdater(updaters, (source) => invalidated.push(source))
}

test('dispatches to the source updater and invalidates its cache', async () => {
  const calls = []
  const invalidated = []
  const updateEventTime = createUpdater({
    updaters: {
      google: (event, times) => {
        calls.push({ event, times })
        return { ...event, ...times }
      }
    },
    invalidated
  })

  const updated = await updateEventTime({
    event: googleEvent,
    start: '2026-07-21T09:00:00+02:00',
    end: '2026-07-21T10:30:00+02:00'
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].times.start, '2026-07-21T09:00:00+02:00')
  assert.equal(updated.end, '2026-07-21T10:30:00+02:00')
  assert.deepEqual(invalidated, ['google'])
})

test('rejects events with no provider id, unknown sources and invalid ranges', async () => {
  const invalidated = []
  const updateEventTime = createUpdater({ updaters: { google: async () => ({}) }, invalidated })

  await assert.rejects(
    () => updateEventTime({ event: { ...googleEvent, providerEventId: undefined }, start: googleEvent.start, end: googleEvent.end }),
    (error) => error instanceof EventMutationError && error.code === 'not-editable'
  )
  await assert.rejects(
    () => updateEventTime({ event: { ...googleEvent, source: 'outlook' }, start: googleEvent.start, end: googleEvent.end }),
    (error) => error.code === 'not-editable'
  )
  await assert.rejects(
    () => updateEventTime({ event: googleEvent, start: 'not-a-date', end: googleEvent.end }),
    (error) => error.code === 'invalid-time'
  )
  await assert.rejects(
    () => updateEventTime({ event: googleEvent, start: googleEvent.end, end: googleEvent.start }),
    (error) => error.code === 'invalid-range'
  )
  assert.deepEqual(invalidated, [], 'nothing is invalidated when the update never runs')
})

test('refuses to resize sources that are points in time', async () => {
  const trelloCard = {
    source: 'trello',
    providerEventId: 'card-1',
    start: '2026-07-20T09:00:00+02:00',
    end: '2026-07-20T09:00:00+02:00'
  }
  const updateEventTime = createUpdater({ updaters: { trello: async (event) => event } })

  await assert.rejects(
    () => updateEventTime({
      event: trelloCard,
      start: '2026-07-20T09:00:00+02:00',
      end: '2026-07-20T10:00:00+02:00'
    }),
    (error) => error.code === 'resize-unsupported'
  )

  const moved = await updateEventTime({
    event: trelloCard,
    start: '2026-07-21T09:00:00+02:00',
    end: '2026-07-21T09:00:00+02:00'
  })
  assert.equal(moved.source, 'trello')
})
