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
    }
  }

  const result = await refreshCalendar(api, 'start', 'end')

  assert.deepEqual(calls, ['events:start', 'events:end', 'statuses'])
  assert.deepEqual(result.statuses, [{ source: 'reminders', ok: true }])
})
