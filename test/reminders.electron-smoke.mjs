import { app } from 'electron'

import { fetchRemindersEvents } from '../src/main/sources/reminders.js'

await app.whenReady()

const result = await fetchRemindersEvents(
  '2026-07-18T22:00:00.000Z',
  '2026-07-25T21:59:59.999Z'
)
const status = result.statuses[0]

console.log(JSON.stringify({ status, eventCount: result.events.length }))
app.exit(status.ok ? 0 : 1)
