import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchRemindersEvents } from '../src/main/sources/reminders.js'

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
