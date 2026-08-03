import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { createDevBrowserApi, installDevBrowserMock } from '../src/renderer/src/devBrowserMock.js'
import { refreshCalendar } from '../src/renderer/src/refreshCalendar.js'

/**
 * The preload is an Electron module, so it cannot be imported here. Reading the method
 * names out of the source is what keeps the mock from silently falling behind a bridge
 * that grew a new method.
 */
function preloadMethodNames() {
  const source = readFileSync(
    fileURLToPath(new URL('../src/preload/index.js', import.meta.url)),
    'utf8'
  )
  const body = source.slice(source.indexOf('exposeInMainWorld'))
  return [...body.matchAll(/^ {2}(\w+):/gm)].map(([, name]) => name)
}

test('implements every method the preload bridge exposes', () => {
  const api = createDevBrowserApi()
  const names = preloadMethodNames()

  assert.ok(names.length > 10, `expected to parse the preload surface, got ${names.length} names`)
  for (const name of names) {
    assert.equal(typeof api[name], 'function', `mock is missing ${name}()`)
  }
})

test('serves events, statuses and calendars for the current week', async () => {
  const api = createDevBrowserApi()
  const start = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const end = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()

  const { events, statuses, calendars } = await refreshCalendar(api, start, end)

  assert.ok(events.length > 0)
  assert.ok(statuses.length > 0)
  assert.ok(calendars.length > 0)
  // The grid, the legend and the tracked lane all need these to be present.
  for (const source of ['google', 'trello', 'reminders', 'timetracker']) {
    assert.ok(
      events.some((event) => event.source === source),
      `no ${source} event in the fixtures`
    )
  }
  assert.ok(events.some((event) => event.isRunning), 'no running tracked session')
  assert.ok(events.some((event) => event.allDay), 'no all-day event')
  assert.ok(statuses.some((status) => status.ok === false), 'no failing source to review')
})

test('returns events sorted by start, like the aggregator does', async () => {
  const api = createDevBrowserApi()
  const events = await api.getUnifiedEvents(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  )

  const starts = events.map((event) => new Date(event.start).getTime())
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b))
})

test('preference writes persist across reads, so sidebar toggles respond', async () => {
  const api = createDevBrowserApi()

  const hidden = await api.setCalendarVisibility('google:work:primary', false)
  assert.equal(hidden.calendarVisibility['google:work:primary'], false)
  // A quick hide must never delist the row from the sidebar.
  assert.equal(hidden.calendarSidebarVisibility['google:work:primary'], true)

  const reread = await api.getPreferences()
  assert.equal(reread.calendarVisibility['google:work:primary'], false)

  const coloured = await api.setCalendarColor('google:work:primary', '#ff0000')
  assert.equal(coloured.calendarColors['google:work:primary'], '#ff0000')
})

test('hides and restores an event under the same key the real store uses', async () => {
  const api = createDevBrowserApi()

  const afterHide = await api.hideEvent({
    scope: 'event',
    eventId: 'google:work:primary:standup',
    title: 'Daily standup'
  })
  assert.equal(afterHide.hiddenEvents.length, 1)
  assert.equal(afterHide.hiddenEvents[0].key, 'event:google:work:primary:standup')

  const afterRestore = await api.restoreHiddenEvent('event:google:work:primary:standup')
  assert.equal(afterRestore.hiddenEvents.length, 0)
})

test('deleting a tracked session removes it from later reads', async () => {
  const api = createDevBrowserApi()
  const range = [
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  ]

  const before = await api.getUnifiedEvents(...range)
  const session = before.find((event) => event.source === 'timetracker')

  await api.deleteSession(session.providerEventId)

  const after = await api.getUnifiedEvents(...range)
  assert.ok(!after.some((event) => event.id === session.id), 'the session is gone on refresh')
  assert.equal(after.length, before.length - 1, 'only that session was removed')

  await assert.rejects(() => api.deleteSession('999999'), /No tracked session with id/)
})

test('never overwrites a bridge the preload already installed', () => {
  const real = { getPreferences: () => {} }
  const target = { calendarAPI: real }

  assert.equal(installDevBrowserMock(target), false)
  assert.equal(target.calendarAPI, real)

  const empty = {}
  assert.equal(installDevBrowserMock(empty), true)
  assert.equal(typeof empty.calendarAPI.getPreferences, 'function')
})
