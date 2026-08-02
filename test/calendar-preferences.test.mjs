import assert from 'node:assert/strict'
import test from 'node:test'

import { createCalendarPreferencesStore } from '../src/main/calendarPreferences.js'

function memoryStore() {
  const values = new Map()
  return {
    get(key, fallback) {
      return structuredClone(values.has(key) ? values.get(key) : fallback)
    },
    set(key, value) {
      values.set(key, structuredClone(value))
    }
  }
}

test('persists calendar colors and visibility', () => {
  const preferences = createCalendarPreferencesStore(memoryStore())

  preferences.setCalendarColor('google:work:primary', '#3858e9')
  preferences.setCalendarSidebarVisibility('google:work:primary', true)
  preferences.setCalendarVisibility('google:work:primary', false)

  assert.equal(preferences.get().calendarColors['google:work:primary'], '#3858e9')
  assert.equal(preferences.get().calendarSidebarVisibility['google:work:primary'], true)
  assert.equal(preferences.get().calendarVisibility['google:work:primary'], false)

  preferences.setCalendarSidebarVisibility('google:work:primary', false)
  assert.equal(preferences.get().calendarSidebarVisibility['google:work:primary'], false)

  preferences.setCalendarVisibility('google:work:primary', true)
  assert.equal(preferences.get().calendarVisibility['google:work:primary'], true)
})

test('quick calendar visibility changes keep the calendar in the sidebar', () => {
  const preferences = createCalendarPreferencesStore(memoryStore())

  preferences.setCalendarVisibility('google:work:primary', false)

  assert.equal(preferences.get().calendarSidebarVisibility['google:work:primary'], true)
  assert.equal(preferences.get().calendarVisibility['google:work:primary'], false)
})

test('hides and restores one occurrence or an entire series', () => {
  const preferences = createCalendarPreferencesStore(memoryStore())

  preferences.hideEvent({
    scope: 'occurrence',
    eventId: 'google:work:primary:instance-1',
    title: 'Team meeting'
  })
  preferences.hideEvent({
    scope: 'series',
    eventId: 'google:work:primary:instance-2',
    seriesId: 'google:work:primary:series:weekly-team',
    title: 'Weekly team meeting'
  })

  assert.equal(preferences.get().hiddenEvents.length, 2)
  preferences.restoreHiddenEvent('occurrence:google:work:primary:instance-1')
  assert.deepEqual(
    preferences.get().hiddenEvents.map((item) => item.key),
    ['series:google:work:primary:series:weekly-team']
  )
})

test('a source master switch round-trips and leaves per-calendar visibility intact', () => {
  const store = createCalendarPreferencesStore(memoryStore())

  store.setCalendarVisibility('timetracker:admin', false)
  const off = store.setSourceEnabled('timetracker', false)
  assert.equal(off.sourceEnabled.timetracker, false)

  const on = store.setSourceEnabled('timetracker', true)
  assert.equal(on.sourceEnabled.timetracker, true)
  assert.equal(
    on.calendarVisibility['timetracker:admin'],
    false,
    'switching a source off and on must not lose which calendars were hidden'
  )
})

test('preferences saved before the master switch existed normalize to enabled', () => {
  const storage = memoryStore()
  storage.set('calendarPreferences', { calendarColors: {}, hiddenEvents: [] })
  const store = createCalendarPreferencesStore(storage)

  assert.deepEqual(store.get().sourceEnabled, {})
})

test('the time tracker data folder round-trips and can be cleared', () => {
  const preferences = createCalendarPreferencesStore(memoryStore())

  assert.equal(preferences.get().timetrackerDataDir, null)

  preferences.setTimetrackerDataDir('/Volumes/work/tracker')
  assert.equal(preferences.get().timetrackerDataDir, '/Volumes/work/tracker')

  // Clearing has to fall all the way back to null so resolveDataDir reaches TIMETRACKER_DIR
  // and then the default, rather than resolving an empty string.
  preferences.setTimetrackerDataDir('')
  assert.equal(preferences.get().timetrackerDataDir, null)
})
