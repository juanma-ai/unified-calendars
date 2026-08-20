import assert from 'node:assert/strict'
import test from 'node:test'

import {
  mapGoogleEvent,
  mapTrackedEntry,
  mapTrelloCard,
  mapLinearIssue,
  mapWallosPayment
} from '../src/main/sources/calendarEventMappers.js'

test('Google events retain calendar and recurring-series identity', () => {
  const event = mapGoogleEvent(
    {
      id: 'instance-20260721',
      recurringEventId: 'weekly-team-meeting',
      summary: 'Team meeting',
      start: { dateTime: '2026-07-21T10:00:00+02:00' },
      end: { dateTime: '2026-07-21T11:00:00+02:00' },
      status: 'confirmed'
    },
    'work',
    { id: 'team@example.com', summary: 'Editorial', backgroundColor: '#3858e9', primary: true }
  )

  assert.equal(event.calendarId, 'google:work:team@example.com')
  assert.equal(event.calendarName, 'Editorial')
  assert.equal(event.calendarDefaultColor, '#3858e9')
  assert.equal(event.calendarDefaultVisible, true)
  assert.equal(event.seriesId, 'google:work:team@example.com:series:weekly-team-meeting')
  assert.equal(event.providerCalendarId, 'team@example.com', 'writes target the raw calendar id')
  assert.equal(event.providerEventId, 'instance-20260721', 'patches target this occurrence')
})

test('Trello cards retain their board identity', () => {
  const event = mapTrelloCard(
    {
      id: 'card-1',
      name: 'Ship release',
      due: '2026-07-23T12:00:00.000Z',
      dueComplete: false,
      shortUrl: 'https://trello.com/c/card-1'
    },
    { id: 'board-1', name: 'Editorial board' }
  )

  assert.equal(event.calendarId, 'trello:board-1')
  assert.equal(event.calendarName, 'Editorial board')
  assert.equal(event.calendarDefaultVisible, false)
  assert.equal(event.seriesId, null)
  assert.equal(event.providerCalendarId, 'board-1')
  assert.equal(event.providerEventId, 'card-1')
})

test('Trello cards include assignee metadata and assigned-to-me state', () => {
  const event = mapTrelloCard(
    {
      id: 'card-1',
      idMembers: ['member-me', 'member-ana'],
      name: 'Ship release',
      due: '2026-07-23T12:00:00.000Z',
      dueComplete: false,
      shortUrl: 'https://trello.com/c/card-1'
    },
    { id: 'board-1', name: 'Editorial board' },
    {
      currentMemberId: 'member-me',
      membersById: new Map([
        ['member-me', { id: 'member-me', fullName: 'JuanMa Garrido', initials: 'JG', username: 'juanma' }],
        ['member-ana', { id: 'member-ana', fullName: 'Ana Lopez', initials: 'AL', username: 'ana' }]
      ])
    }
  )

  assert.equal(event.assignedToMe, true)
  assert.deepEqual(event.assignees, [
    { id: 'member-me', name: 'JuanMa Garrido', initials: 'JG', username: 'juanma', isMe: true },
    { id: 'member-ana', name: 'Ana Lopez', initials: 'AL', username: 'ana', isMe: false }
  ])
})

test('Tracked entries carry provider ids and a running flag, never a URL to open', () => {
  const start = Math.floor(Date.UTC(2026, 6, 26, 10, 5, 0) / 1000)
  const end = Math.floor(Date.UTC(2026, 6, 26, 11, 52, 0) / 1000)

  const event = mapTrackedEntry(
    { id: 4, project: 'certification', start, end },
    [{ id: 11, entry_id: 4, ts: start + 60, text: 'Working on Hooks' }],
    { now: Date.UTC(2026, 6, 26, 12, 0, 0) }
  )

  assert.equal(event.source, 'timetracker')
  assert.equal(event.calendarId, 'timetracker:certification')
  assert.equal(event.calendarName, 'certification')
  assert.equal(event.calendarDefaultVisible, true)
  assert.equal(event.id, 'timetracker:4')
  assert.equal(event.providerCalendarId, 'certification', 'writes would target the project name')
  assert.equal(event.providerEventId, '4', 'never re-parse the composite id')
  assert.equal(event.seriesId, null)
  assert.equal(event.title, 'certification')
  assert.equal(event.allDay, false)
  assert.equal(event.isRunning, false)
  assert.equal(event.url, undefined, 'a tracked session has nowhere to open')
  assert.deepEqual(event.notes, [
    { id: 11, ts: '2026-07-26T10:06:00.000Z', text: 'Working on Hooks' }
  ])
})

test('a note row without an id still maps, with a null id rather than a broken one', () => {
  // Rows written before the calendar could edit them are read back the same way; the
  // popover keys its edit affordance off a non-null id.
  const start = Math.floor(Date.UTC(2026, 6, 26, 10, 0, 0) / 1000)
  const event = mapTrackedEntry({ id: 4, project: 'certification', start, end: start + 60 }, [
    { ts: start, text: 'legacy' }
  ])

  assert.deepEqual(event.notes, [{ id: null, ts: '2026-07-26T10:00:00.000Z', text: 'legacy' }])
})

test('A running entry with a start in the future never produces a negative duration', () => {
  const now = Date.UTC(2026, 6, 26, 12, 0, 0)
  const start = Math.floor(Date.UTC(2026, 6, 26, 12, 30, 0) / 1000)

  const event = mapTrackedEntry({ id: 8, project: 'admin', start, end: null }, [], { now })

  assert.equal(event.isRunning, true)
  assert.ok(new Date(event.end) >= new Date(event.start))
})

test('Linear issues carry team identity and are all-day events', () => {
  const event = mapLinearIssue({
    id: 'issue-1',
    identifier: 'DEVREL-1561',
    title: 'Publish announcement post',
    dueDate: '2026-08-07',
    url: 'https://linear.app/a8c/issue/DEVREL-1561',
    state: { name: 'Todo', type: 'unstarted' },
    team: { id: 'team-devrel', key: 'DEVREL', name: 'Developer Relations' }
  })

  assert.equal(event.calendarId, 'linear:team-devrel')
  assert.equal(event.calendarName, 'Developer Relations')
  assert.equal(event.calendarDefaultColor, '#5e6ad2')
  assert.equal(event.calendarDefaultVisible, false)
  assert.equal(event.id, 'linear:issue-1')
  assert.equal(event.providerCalendarId, 'team-devrel')
  assert.equal(event.providerEventId, 'issue-1')
  assert.equal(event.seriesId, null)
  assert.equal(event.title, 'DEVREL-1561 Publish announcement post')
  assert.equal(event.allDay, true)
  assert.equal(event.url, 'https://linear.app/a8c/issue/DEVREL-1561')
  assert.equal(event.status, 'confirmed')
})

test('Linear issue start/end are local midnight of the due date', () => {
  const event = mapLinearIssue({
    id: 'issue-1',
    identifier: 'DEVREL-1561',
    title: 'Test',
    dueDate: '2026-08-07',
    url: 'https://linear.app/a8c/issue/DEVREL-1561',
    state: { name: 'Todo', type: 'unstarted' },
    team: { id: 'team-devrel', key: 'DEVREL', name: 'DevRel' }
  })

  // Local midnight of Aug 7, 2026
  const expected = new Date(2026, 7, 7).toISOString()
  assert.equal(event.start, expected)
  assert.equal(event.end, expected)
})

const WALLOS_SUBSCRIPTION = {
  id: 42,
  name: 'Netflix',
  price: 12.99,
  payment_method_id: 3,
  payment_method_name: 'Visa',
  url: 'https://www.netflix.com'
}

test('a Wallos payment opens in Wallos, not on the vendor site', () => {
  const event = mapWallosPayment(WALLOS_SUBSCRIPTION, '2026-08-07', 'https://wallos.example.com')

  assert.equal(event.url, 'https://wallos.example.com')
  assert.equal(event.raw.url, 'https://www.netflix.com')
})

test('a Wallos payment has no link when the instance URL is unknown', () => {
  const event = mapWallosPayment(WALLOS_SUBSCRIPTION, '2026-08-07')

  assert.equal(event.url, null)
})
