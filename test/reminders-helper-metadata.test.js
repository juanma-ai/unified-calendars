import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const infoPlist = new URL(
  '../native/reminders-helper/Sources/RemindersHelper/Info.plist',
  import.meta.url
)

test('Reminders helper declares full-access permission usage', async () => {
  const contents = await readFile(infoPlist, 'utf8')

  assert.match(contents, /<key>NSRemindersFullAccessUsageDescription<\/key>/)
})
