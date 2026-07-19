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
  preferences.setCalendarVisibility('google:work:primary', false)

  assert.equal(preferences.get().calendarColors['google:work:primary'], '#3858e9')
  assert.equal(preferences.get().calendarVisibility['google:work:primary'], false)

  preferences.setCalendarVisibility('google:work:primary', true)
  assert.equal(preferences.get().calendarVisibility['google:work:primary'], true)
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
