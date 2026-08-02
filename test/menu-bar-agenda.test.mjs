import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAgenda,
  buildMenuTemplate,
  getTrayTitle,
  getTodayRange
} from '../src/main/menuBarAgenda.js'

test('builds today range using local day boundaries', () => {
  const range = getTodayRange(new Date('2026-07-22T14:30:00+02:00'))

  assert.equal(range.rangeStart, new Date('2026-07-22T00:00:00+02:00').toISOString())
  assert.equal(range.rangeEnd, new Date('2026-07-23T00:00:00+02:00').toISOString())
})

test('orders agenda events and highlights the next active or future event', () => {
  const now = new Date('2026-07-22T10:45:00+02:00')
  const agenda = buildAgenda(
    [
      {
        id: 'later',
        title: 'Roadmap Q4',
        source: 'google',
        start: '2026-07-22T17:00:00+02:00',
        end: '2026-07-22T17:30:00+02:00',
        status: 'confirmed',
        url: 'https://calendar.google.com/later'
      },
      {
        id: 'past',
        title: 'Meditation',
        source: 'google',
        start: '2026-07-22T09:00:00+02:00',
        end: '2026-07-22T09:30:00+02:00',
        status: 'confirmed',
        url: 'https://calendar.google.com/past'
      },
      {
        id: 'next',
        title: 'Management sync',
        source: 'google',
        start: '2026-07-22T11:00:00+02:00',
        end: '2026-07-22T11:30:00+02:00',
        status: 'confirmed',
        url: 'https://calendar.google.com/next'
      },
      {
        id: 'cancelled',
        title: 'Cancelled meeting',
        source: 'google',
        start: '2026-07-22T12:00:00+02:00',
        end: '2026-07-22T12:30:00+02:00',
        status: 'cancelled'
      }
    ],
    { now, locale: 'en-US' }
  )

  assert.equal(agenda.dayLabel, 'Today (Wed, Jul 22):')
  assert.equal(agenda.remainingLabel, 'in 15m')
  assert.deepEqual(
    agenda.events.map(({ id, isNext, isPast }) => ({ id, isNext, isPast })),
    [
      { id: 'past', isNext: false, isPast: true },
      { id: 'next', isNext: true, isPast: false },
      { id: 'later', isNext: false, isPast: false }
    ]
  )
})

test('uses current event as next when it is already in progress', () => {
  const agenda = buildAgenda(
    [
      {
        id: 'current',
        title: 'Team daily',
        source: 'google',
        start: '2026-07-22T10:30:00+02:00',
        end: '2026-07-22T11:00:00+02:00',
        status: 'confirmed'
      },
      {
        id: 'future',
        title: 'Planning',
        source: 'google',
        start: '2026-07-22T12:00:00+02:00',
        end: '2026-07-22T13:00:00+02:00',
        status: 'confirmed'
      }
    ],
    { now: new Date('2026-07-22T10:45:00+02:00'), locale: 'en-US' }
  )

  assert.equal(agenda.remainingLabel, 'now')
  assert.equal(agenda.events.find((event) => event.id === 'current').isNext, true)
})

test('respects calendar visibility and hidden events when preferences are provided', () => {
  const agenda = buildAgenda(
    [
      {
        id: 'visible',
        title: 'Visible event',
        source: 'google',
        calendarId: 'google:work:primary',
        calendarDefaultVisible: true,
        start: '2026-07-22T11:00:00+02:00',
        end: '2026-07-22T11:30:00+02:00',
        status: 'confirmed'
      },
      {
        id: 'hidden-calendar',
        title: 'Hidden calendar event',
        source: 'google',
        calendarId: 'google:work:hidden',
        calendarDefaultVisible: true,
        start: '2026-07-22T12:00:00+02:00',
        end: '2026-07-22T12:30:00+02:00',
        status: 'confirmed'
      },
      {
        id: 'hidden-event',
        title: 'Hidden event',
        source: 'google',
        calendarId: 'google:work:primary',
        calendarDefaultVisible: true,
        start: '2026-07-22T13:00:00+02:00',
        end: '2026-07-22T13:30:00+02:00',
        status: 'confirmed'
      }
    ],
    {
      now: new Date('2026-07-22T10:00:00+02:00'),
      preferences: {
        calendarVisibility: {
          'google:work:hidden': false
        },
        hiddenEvents: [
          { key: 'occurrence:hidden-event' }
        ]
      }
    }
  )

  assert.deepEqual(agenda.events.map((event) => event.id), ['visible'])
})

test('formats visible tray title from the next agenda event', () => {
  assert.equal(
    getTrayTitle({
      remainingLabel: 'now',
      events: [
        { title: 'Team daily', isNext: true },
        { title: 'Planning', isNext: false }
      ]
    }),
    'now Team daily'
  )
  assert.equal(
    getTrayTitle({
      remainingLabel: 'in 15m',
      events: [
        { title: 'Management sync', isNext: true }
      ]
    }),
    '15m Management sync'
  )
  assert.equal(getTrayTitle({ remainingLabel: 'No more events', events: [] }), 'No events')
})

test('builds a native menu template with agenda rows and actions', () => {
  const template = buildMenuTemplate({
    dayLabel: 'Today (Wed, Jul 22):',
    remainingLabel: 'in 17m',
    events: [
      {
        id: 'next',
        title: '[1:1] Justin - JuanMa',
        timeLabel: '17:00',
        url: 'https://calendar.google.com/event',
        isNext: true,
        isPast: false
      },
      {
        id: 'past',
        title: 'Meditation',
        timeLabel: '09:00',
        url: null,
        isNext: false,
        isPast: true
      }
    ]
  })

  assert.deepEqual(
    template.map((item) => item.type ?? item.label),
    [
      'Today (Wed, Jul 22):',
      'Next in 17m',
      'separator',
      '17:00  [1:1] Justin - JuanMa',
      '09:00  Meditation',
      'separator',
      'Open Calendar',
      'Settings',
      'separator',
      'Quit Unified Calendar'
    ]
  )
  assert.equal(template[0].enabled, false)
  assert.equal(template[1].enabled, false)
  assert.equal(template[3].toolTip, 'Next event')
  assert.equal(template[4].enabled, true)
})

test('tracked sessions stay out of the menu bar and never claim the tray title', () => {
  const now = new Date('2026-07-22T10:45:00+02:00')
  const agenda = buildAgenda(
    [
      {
        id: 'timetracker:5',
        source: 'timetracker',
        title: 'certification',
        calendarId: 'timetracker:certification',
        calendarDefaultVisible: true,
        // A running session ends at "now", which would otherwise satisfy the
        // `endMs >= nowMs` test that picks the next event.
        start: '2026-07-22T09:30:00+02:00',
        end: '2026-07-22T10:45:00+02:00',
        isRunning: true
      },
      {
        id: 'google:standup',
        source: 'google',
        title: 'Standup',
        calendarId: 'google:work:primary',
        calendarDefaultVisible: true,
        start: '2026-07-22T11:10:00+02:00',
        end: '2026-07-22T11:30:00+02:00'
      }
    ],
    { now }
  )

  assert.deepEqual(agenda.events.map((event) => event.title), ['Standup'])
  assert.equal(getTrayTitle(agenda), '25m Standup')
})
