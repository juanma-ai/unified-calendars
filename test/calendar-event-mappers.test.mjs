import assert from 'node:assert/strict'
import test from 'node:test'

import { mapGoogleEvent, mapTrackedEntry, mapTrelloCard } from '../src/main/sources/calendarEventMappers.js'

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
    [{ entry_id: 4, ts: start + 60, text: 'Working on Hooks' }],
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
    { ts: '2026-07-26T10:06:00.000Z', text: 'Working on Hooks' }
  ])
})

test('A running entry with a start in the future never produces a negative duration', () => {
  const now = Date.UTC(2026, 6, 26, 12, 0, 0)
  const start = Math.floor(Date.UTC(2026, 6, 26, 12, 30, 0) / 1000)

  const event = mapTrackedEntry({ id: 8, project: 'admin', start, end: null }, [], { now })

  assert.equal(event.isRunning, true)
  assert.ok(new Date(event.end) >= new Date(event.start))
})
