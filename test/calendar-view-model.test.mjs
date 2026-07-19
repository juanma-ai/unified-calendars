import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCalendars, filterVisibleEvents } from '../src/renderer/src/calendarViewModel.js'

const events = [
  {
    source: 'google',
    calendarId: 'google:work:personal',
    calendarName: 'Personal',
    calendarDefaultColor: '#008a20',
    calendarDefaultVisible: true,
    id: 'event-1',
    seriesId: 'series-1',
    title: 'Casa'
  },
  {
    source: 'trello',
    calendarId: 'trello:editorial',
    calendarName: 'Editorial board',
    calendarDefaultColor: '#9b7a00',
    calendarDefaultVisible: false,
    id: 'event-2',
    seriesId: null,
    title: 'Ship release'
  }
]

test('builds calendars with persisted color and visibility', () => {
  const calendars = buildCalendars(events, {
    calendarColors: { 'google:work:personal': '#3858e9' },
    calendarVisibility: {},
    hiddenCalendars: [],
    hiddenEvents: []
  })

  assert.deepEqual(calendars[0], {
    id: 'google:work:personal',
    source: 'google',
    name: 'Personal',
    color: '#3858e9',
    count: 1,
    visible: true
  })
  assert.equal(calendars[1].visible, false)

  const enabledCalendars = buildCalendars(events, {
    calendarVisibility: { 'trello:editorial': true }
  })
  assert.equal(enabledCalendars[1].visible, true)
})

test('filters calendars, occurrences, series, and search text', () => {
  const preferences = {
    calendarColors: {},
    calendarVisibility: { 'trello:editorial': true },
    hiddenCalendars: [],
    hiddenEvents: [{ key: 'series:series-1' }]
  }

  assert.deepEqual(filterVisibleEvents(events, preferences, ''), [events[1]])
  assert.deepEqual(filterVisibleEvents(events, { ...preferences, hiddenEvents: [] }, 'ship'), [events[1]])
})
