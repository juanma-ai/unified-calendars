import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchRemindersEvents, setReminderCompleted } from '../src/main/sources/reminders.js'

test('fetches reminders through the authorized helper app identity', async () => {
  const result = await fetchRemindersEvents(
    '2026-07-01T00:00:00Z',
    '2026-08-01T00:00:00Z'
  )

  assert.equal(result.statuses[0].ok, true, result.statuses[0].lastError)
  assert.ok(Array.isArray(result.events))
  for (const event of result.events) {
    assert.match(event.calendarId, /^reminders:/)
    assert.ok(event.calendarName)
    assert.equal(event.calendarDefaultVisible, true)
  }
})

test('completing an unknown reminder fails with not-found', async () => {
  await assert.rejects(
    () => setReminderCompleted({ providerEventId: 'no-such-reminder-id' }, true),
    /not-found/
  )
})

test('complete and undo round-trip through the helper', async (t) => {
  const rangeStart = '2026-01-01T00:00:00Z'
  const rangeEnd = '2027-01-01T00:00:00Z'
  const { events } = await fetchRemindersEvents(rangeStart, rangeEnd)
  const target = events[0]

  if (!target) {
    t.skip('no incomplete reminder available to round-trip')
    return
  }

  const completed = await setReminderCompleted(target, true)
  assert.equal(completed.status, 'completed')

  try {
    const afterComplete = await fetchRemindersEvents(rangeStart, rangeEnd)
    assert.ok(
      !afterComplete.events.some((event) => event.id === target.id),
      'completed reminder should be filtered out of a fresh fetch'
    )
  } finally {
    // Always restore the user's reminder, even if the absence assertion fails.
    const restored = await setReminderCompleted(target, false)
    assert.equal(restored.status, 'confirmed')
  }

  const afterUndo = await fetchRemindersEvents(rangeStart, rangeEnd)
  assert.ok(
    afterUndo.events.some((event) => event.id === target.id),
    'undone reminder should reappear in a fresh fetch'
  )
})
