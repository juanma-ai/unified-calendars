import assert from 'node:assert/strict'
import test from 'node:test'

import { EventMutationError } from '../src/main/eventMutations.js'
import { createReminderCompleter } from '../src/main/reminderCompletion.js'

const reminderEvent = {
  source: 'reminders',
  providerEventId: 'ABC-123',
  title: 'Call back'
}

function createCompleter({ complete, invalidated = [] } = {}) {
  return createReminderCompleter(
    complete ?? (async (event, completed) => ({ ...event, completed })),
    (source) => invalidated.push(source)
  )
}

test('completes the reminder and invalidates only the reminders cache', async () => {
  const calls = []
  const invalidated = []
  const setReminderCompleted = createCompleter({
    complete: async (event, completed) => {
      calls.push({ event, completed })
      return { ...event, completed }
    },
    invalidated
  })

  const updated = await setReminderCompleted({ event: reminderEvent, completed: true })

  assert.deepEqual(calls, [{ event: reminderEvent, completed: true }])
  assert.equal(updated.completed, true)
  assert.deepEqual(invalidated, ['reminders'])
})

test('undo passes completed: false through the same path', async () => {
  const calls = []
  const setReminderCompleted = createCompleter({
    complete: async (event, completed) => {
      calls.push(completed)
      return event
    }
  })

  await setReminderCompleted({ event: reminderEvent, completed: false })

  assert.deepEqual(calls, [false])
})

test('rejects non-reminders sources and missing provider ids without invalidating', async () => {
  const invalidated = []
  const setReminderCompleted = createCompleter({ invalidated })

  await assert.rejects(
    () => setReminderCompleted({ event: {}, completed: true }),
    (error) => error instanceof EventMutationError && error.code === 'invalid-event'
  )
  await assert.rejects(
    () => setReminderCompleted({ event: { ...reminderEvent, source: 'google' }, completed: true }),
    (error) => error instanceof EventMutationError && error.code === 'not-editable'
  )
  await assert.rejects(
    () =>
      setReminderCompleted({
        event: { ...reminderEvent, providerEventId: undefined },
        completed: true
      }),
    (error) => error instanceof EventMutationError && error.code === 'not-editable'
  )

  assert.deepEqual(invalidated, [])
})

test('a failed helper write leaves the cache untouched', async () => {
  const invalidated = []
  const setReminderCompleted = createCompleter({
    complete: async () => {
      throw new Error('save-failed: boom')
    },
    invalidated
  })

  await assert.rejects(
    () => setReminderCompleted({ event: reminderEvent, completed: true }),
    /save-failed/
  )
  assert.deepEqual(invalidated, [])
})
