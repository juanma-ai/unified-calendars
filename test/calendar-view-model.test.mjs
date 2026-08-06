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
    sidebarVisible: true,
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
    calendars.map(({ id, count, sidebarVisible, visible }) => ({ id, count, sidebarVisible, visible })),
    [
      { id: 'google:juanma-work:team@example.com', count: 0, sidebarVisible: false, visible: false },
      { id: 'trello:juanma-personal-board', count: 0, sidebarVisible: false, visible: false }
    ]
  )
})

test('carries provider link fields from the catalog into sidebar entries', () => {
  const catalog = [
    {
      source: 'google',
      sourceAccountId: 'work',
      calendarId: 'google:work:team@group.calendar.google.com',
      providerCalendarId: 'team@group.calendar.google.com',
      accountEmail: 'juanma@example.com',
      calendarName: 'Team calendar',
      calendarDefaultColor: '#3858e9',
      calendarDefaultVisible: true
    },
    {
      source: 'trello',
      calendarId: 'trello:board-1',
      providerCalendarId: 'board-1',
      url: 'https://trello.com/b/board-1/roadmap',
      calendarName: 'Roadmap',
      calendarDefaultColor: '#9b7a00',
      calendarDefaultVisible: false
    }
  ]

  const calendars = buildCalendars([], {}, catalog)

  assert.equal(calendars[0].providerCalendarId, 'team@group.calendar.google.com')
  assert.equal(calendars[0].accountEmail, 'juanma@example.com')
  assert.equal(calendars[1].url, 'https://trello.com/b/board-1/roadmap')
})

test('carries providerCalendarId from events when a calendar has no catalog entry', () => {
  const calendars = buildCalendars(
    [{ ...events[0], providerCalendarId: 'personal@example.com' }],
    {}
  )

  assert.equal(calendars[0].providerCalendarId, 'personal@example.com')
})

test('separates sidebar membership from quick event visibility', () => {
  const preferences = {
    calendarSidebarVisibility: {
      'google:work:personal': true,
      'trello:editorial': false
    },
    calendarVisibility: {
      'google:work:personal': false,
      'trello:editorial': true
    },
    hiddenEvents: []
  }

  const calendars = buildCalendars(events, preferences)

  assert.deepEqual(
    calendars.map(({ id, sidebarVisible, visible }) => ({ id, sidebarVisible, visible })),
    [
      { id: 'google:work:personal', sidebarVisible: true, visible: false },
      { id: 'trello:editorial', sidebarVisible: false, visible: true }
    ]
  )
  assert.deepEqual(filterVisibleEvents(events, preferences, ''), [])
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

test('quick-hiding a calendar keeps it listed in the sidebar', () => {
  const events = [
    {
      id: 'event-1',
      source: 'google',
      calendarId: 'google:work:personal',
      calendarName: 'Personal',
      calendarDefaultVisible: true,
      title: 'Standup',
      start: '2026-01-05T09:00:00.000Z'
    }
  ]
  // No explicit sidebar preference: the quick hide must not delist the calendar.
  const preferences = { calendarVisibility: { 'google:work:personal': false } }

  const [calendar] = buildCalendars(events, preferences)
  assert.equal(calendar.sidebarVisible, true)
  assert.equal(calendar.visible, false)
  assert.deepEqual(filterVisibleEvents(events, preferences, ''), [])
})

test('a disabled source drops out of every view through one choke point', () => {
  const tracked = [
    {
      source: 'timetracker',
      calendarId: 'timetracker:certification',
      calendarName: 'certification',
      calendarDefaultVisible: true,
      id: 'timetracker:5',
      title: 'certification',
      start: '2026-08-01T10:00:00.000Z',
      end: '2026-08-01T11:00:00.000Z'
    },
    {
      source: 'google',
      calendarId: 'google:work:personal',
      calendarName: 'Personal',
      calendarDefaultVisible: true,
      id: 'google:standup',
      title: 'Standup',
      start: '2026-08-01T09:00:00.000Z',
      end: '2026-08-01T09:15:00.000Z'
    }
  ]

  assert.equal(filterVisibleEvents(tracked, {}).length, 2, 'enabled unless explicitly off')

  const visible = filterVisibleEvents(tracked, { sourceEnabled: { timetracker: false } })
  assert.deepEqual(visible.map((event) => event.title), ['Standup'])
})
