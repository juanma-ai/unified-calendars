import assert from 'node:assert/strict'
import test from 'node:test'

import { refreshCalendar } from '../src/renderer/src/refreshCalendar.js'

test('reads source statuses only after the event refresh finishes', async () => {
  const calls = []
  const api = {
    async getUnifiedEvents() {
      calls.push('events:start')
      await new Promise((resolve) => setTimeout(resolve, 5))
      calls.push('events:end')
      return [{ id: 'reminders:1' }]
    },
    async getSourceStatus() {
      calls.push('statuses')
      return [{ source: 'reminders', ok: true }]
    },
    async getAvailableCalendars() {
      calls.push('calendars')
      return [{ calendarId: 'reminders:default', calendarName: 'Reminders' }]
    }
  }

  const result = await refreshCalendar(api, 'start', 'end')

  assert.deepEqual(calls, ['events:start', 'events:end', 'statuses', 'calendars'])
  assert.deepEqual(result.statuses, [{ source: 'reminders', ok: true }])
  assert.deepEqual(result.calendars, [{ calendarId: 'reminders:default', calendarName: 'Reminders' }])
})

test('reads calendars after a forced refresh too', async () => {
  const calls = []
  const api = {
    async refreshNow() {
      calls.push('refresh')
      return []
    },
    async getSourceStatus() {
      calls.push('statuses')
      return []
    },
    async getAvailableCalendars() {
      calls.push('calendars')
      return [{ calendarId: 'google:work:primary', calendarName: 'Work' }]
    }
  }

  const result = await refreshCalendar(api, 'start', 'end', { force: true })

  assert.deepEqual(calls, ['refresh', 'statuses', 'calendars'])
  assert.deepEqual(result.calendars, [{ calendarId: 'google:work:primary', calendarName: 'Work' }])
})
