import assert from 'node:assert/strict'
import test from 'node:test'

import { createEventNotificationScheduler } from '../src/main/eventNotifications.js'

function createTimerHarness(nowMs = Date.parse('2026-07-21T10:00:00.000Z')) {
  const timers = new Map()
  const notifications = []
  const attentionRequests = []
  let nextId = 1

  return {
    attentionRequests,
    notifications,
    get timers() {
      return timers
    },
    now: () => nowMs,
    setTimer(callback, delay) {
      const id = nextId++
      timers.set(id, { callback, delay })
      return id
    },
    clearTimer(id) {
      timers.delete(id)
    },
    fire(id) {
      const timer = timers.get(id)
      timers.delete(id)
      timer.callback()
    },
    showNotification(notification) {
      notifications.push(notification)
    },
    requestAttention(notification) {
      attentionRequests.push(notification)
    }
  }
}

const baseEvent = {
  id: 'google:work:primary:event-1',
  seriesId: null,
  title: 'Team meeting',
  calendarId: 'google:work:primary',
  calendarName: 'Work',
  calendarDefaultVisible: true,
  start: '2026-07-21T10:15:00.000Z',
  end: '2026-07-21T10:45:00.000Z',
  allDay: false,
  status: 'confirmed'
}

test('schedules a notification for a future visible timed event', () => {
  const harness = createTimerHarness()
  const scheduler = createEventNotificationScheduler({ ...harness, locale: 'en-GB' })

  scheduler.schedule([baseEvent], {})

  assert.equal(harness.timers.size, 1)
  const [[timerId, timer]] = harness.timers
  assert.equal(timer.delay, 15 * 60 * 1000)

  harness.fire(timerId)

  assert.deepEqual(harness.notifications, [
    {
      title: baseEvent.title,
      body: 'Work at 12:15',
      event: baseEvent
    }
  ])
  assert.deepEqual(harness.attentionRequests, harness.notifications)
})

test('does not schedule duplicate notifications across refreshes', () => {
  const harness = createTimerHarness()
  const scheduler = createEventNotificationScheduler(harness)

  scheduler.schedule([baseEvent], {})
  scheduler.schedule([baseEvent], {})

  assert.equal(harness.timers.size, 1)
})

test('skips past, all-day, completed, cancelled, and hidden events', () => {
  const harness = createTimerHarness()
  const scheduler = createEventNotificationScheduler(harness)

  scheduler.schedule(
    [
      { ...baseEvent, id: 'past', start: '2026-07-21T09:59:00.000Z' },
      { ...baseEvent, id: 'all-day', allDay: true },
      { ...baseEvent, id: 'completed', status: 'completed' },
      { ...baseEvent, id: 'cancelled', status: 'cancelled' },
      { ...baseEvent, id: 'hidden-calendar', calendarId: 'google:work:hidden' },
      { ...baseEvent, id: 'hidden-sidebar', calendarId: 'google:work:hidden-sidebar' },
      { ...baseEvent, id: 'hidden-occurrence' },
      {
        ...baseEvent,
        id: 'hidden-series',
        seriesId: 'google:work:primary:series:standup'
      }
    ],
    {
      calendarSidebarVisibility: { 'google:work:hidden-sidebar': false },
      calendarVisibility: { 'google:work:hidden': false },
      hiddenEvents: [
        { key: 'occurrence:hidden-occurrence' },
        { key: 'series:google:work:primary:series:standup' }
      ]
    }
  )

  assert.equal(harness.timers.size, 0)
})

test('ignores events beyond the notification horizon', () => {
  const harness = createTimerHarness()
  const scheduler = createEventNotificationScheduler(harness)

  scheduler.schedule(
    [
      { ...baseEvent, id: 'next-year', start: '2027-04-21T10:15:00.000Z' },
      { ...baseEvent, id: 'next-month', start: '2026-08-30T10:15:00.000Z' }
    ],
    {}
  )

  assert.equal(harness.timers.size, 0)
})

test('never arms a timer long enough to overflow setTimeout', () => {
  const harness = createTimerHarness()
  const scheduler = createEventNotificationScheduler(harness)

  scheduler.schedule(
    Array.from({ length: 12 }, (_, index) => ({
      ...baseEvent,
      id: `event-${index}`,
      start: new Date(harness.now() + index * 30 * 24 * 60 * 60 * 1000).toISOString()
    })),
    {}
  )

  for (const [, timer] of harness.timers) {
    assert.ok(timer.delay > 0 && timer.delay <= 2147483647, `bad delay ${timer.delay}`)
  }
})

test('honours a custom horizon without exceeding the timer limit', () => {
  const harness = createTimerHarness()
  const scheduler = createEventNotificationScheduler({
    ...harness,
    horizonMs: Number.MAX_SAFE_INTEGER
  })

  scheduler.schedule([{ ...baseEvent, id: 'far-future', start: '2029-04-21T10:15:00.000Z' }], {})

  assert.equal(harness.timers.size, 0)
})

test('rescheduling cancels notifications for events that become hidden', () => {
  const harness = createTimerHarness()
  const scheduler = createEventNotificationScheduler(harness)

  scheduler.schedule([baseEvent], {})
  assert.equal(harness.timers.size, 1)

  scheduler.schedule([baseEvent], {
    hiddenEvents: [{ key: `occurrence:${baseEvent.id}` }]
  })

  assert.equal(harness.timers.size, 0)
})
