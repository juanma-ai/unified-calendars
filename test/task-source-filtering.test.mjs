import assert from 'node:assert/strict'
import test from 'node:test'

import { config } from '../src/main/config.js'
import { filterIncompleteReminderItems } from '../src/main/sources/reminders.js'
import { fetchTrelloEvents, filterIncompleteTrelloCards } from '../src/main/sources/trello.js'

test('filters completed Reminders items before they become calendar events', () => {
  const items = [
    { id: 'open-reminder', title: 'Call back', isCompleted: false },
    { id: 'completed-reminder', title: 'Llamar a Juan Carpintero', isCompleted: true }
  ]

  assert.deepEqual(filterIncompleteReminderItems(items), [items[0]])
})

test('filters completed Trello cards before they become calendar events', () => {
  const cards = [
    { id: 'open-card', name: 'Open task', dueComplete: false },
    { id: 'completed-card', name: 'Done task', dueComplete: true }
  ]

  assert.deepEqual(filterIncompleteTrelloCards(cards), [cards[0]])
})

test('fetches only incomplete Trello cards as calendar events', async (t) => {
  const originalFetch = globalThis.fetch
  const originalTrelloConfig = { ...config.trello }
  const trelloRequests = []

  t.after(() => {
    globalThis.fetch = originalFetch
    Object.assign(config.trello, originalTrelloConfig)
  })

  config.trello.apiKey = 'test-key'
  config.trello.token = 'test-token'
  config.trello.boardIds = []

  globalThis.fetch = async (url) => {
    trelloRequests.push(url)

    if (url.includes('/members/me?')) {
      return {
        ok: true,
        json: async () => ({ id: 'member-me', fullName: 'JuanMa Garrido', initials: 'JG', username: 'juanma' })
      }
    }

    if (url.includes('/members/me/boards')) {
      return {
        ok: true,
        json: async () => [{ id: 'board-1', name: 'Family Tasks' }]
      }
    }

    if (url.includes('/boards/board-1/members')) {
      return {
        ok: true,
        json: async () => [
          { id: 'member-me', fullName: 'JuanMa Garrido', initials: 'JG', username: 'juanma' },
          { id: 'member-ana', fullName: 'Ana Lopez', initials: 'AL', username: 'ana' }
        ]
      }
    }

    if (url.includes('/boards/board-1/cards')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 'open-card',
            idMembers: ['member-me', 'member-ana'],
            name: 'Open task',
            due: '2026-07-21T17:30:00.000Z',
            dueComplete: false,
            shortUrl: 'https://trello.com/c/open-card'
          },
          {
            id: 'completed-card',
            idMembers: [],
            name: 'Done task',
            due: '2026-07-21T18:30:00.000Z',
            dueComplete: true,
            shortUrl: 'https://trello.com/c/completed-card'
          }
        ]
      }
    }

    throw new Error(`Unexpected Trello request: ${url}`)
  }

  const result = await fetchTrelloEvents('2026-07-21T00:00:00.000Z', '2026-07-22T00:00:00.000Z')

  assert.deepEqual(
    result.events.map((event) => event.id),
    ['trello:open-card']
  )
  assert.equal(result.events[0].assignedToMe, true)
  assert.deepEqual(
    result.events[0].assignees.map((assignee) => assignee.name),
    ['JuanMa Garrido', 'Ana Lopez']
  )
  assert.ok(
    trelloRequests.some(
      (url) => url.includes('/boards/board-1/cards') && url.includes('idMembers')
    )
  )
})
