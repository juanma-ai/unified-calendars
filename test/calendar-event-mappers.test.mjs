import assert from 'node:assert/strict'
import test from 'node:test'

import { mapGoogleEvent, mapTrelloCard } from '../src/main/sources/calendarEventMappers.js'

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
