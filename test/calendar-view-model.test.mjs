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

test('builds calendars from the source catalog even when they have no events', () => {
  const catalog = [
    {
      source: 'google',
      sourceAccountId: 'work',
      calendarId: 'google:work:empty@example.com',
      calendarName: 'Empty calendar',
      calendarDefaultColor: '#3858e9',
      calendarDefaultVisible: false
    },
    {
      source: 'trello',
      calendarId: 'trello:board-without-due-cards',
      calendarName: 'JuanMa Personal',
      calendarDefaultColor: '#9b7a00',
      calendarDefaultVisible: false
    }
  ]

  const calendars = buildCalendars(events, {}, catalog)

  assert.equal(calendars.find((calendar) => calendar.id === catalog[0].calendarId).count, 0)
  assert.equal(calendars.find((calendar) => calendar.id === catalog[1].calendarId).count, 0)
})

test('builds calendars from the source catalog even when the range has no events', () => {
  const catalog = [
    {
      source: 'google',
      sourceAccountId: 'juanma-work',
      calendarId: 'google:juanma-work:team@example.com',
      calendarName: 'Team calendar',
      calendarDefaultColor: '#3858e9',
      calendarDefaultVisible: false
    },
    {
      source: 'trello',
      calendarId: 'trello:juanma-personal-board',
      calendarName: 'JuanMa Personal',
      calendarDefaultColor: '#0c66e4',
      calendarDefaultVisible: false
    }
  ]

  const calendars = buildCalendars([], {}, catalog)

  assert.deepEqual(
    calendars.map(({ id, count, visible }) => ({ id, count, visible })),
    [
      { id: 'google:juanma-work:team@example.com', count: 0, visible: false },
      { id: 'trello:juanma-personal-board', count: 0, visible: false }
    ]
  )
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
