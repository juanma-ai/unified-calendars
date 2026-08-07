import assert from 'node:assert/strict'
import test from 'node:test'

import { config } from '../src/main/config.js'
import { filterIncompleteReminderItems } from '../src/main/sources/reminders.js'
import { fetchTrelloEvents, filterIncompleteTrelloCards } from '../src/main/sources/trello.js'
import { fetchLinearEvents } from '../src/main/sources/linear.js'

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

test('fetchLinearEvents returns not-connected when no API key is set', async (t) => {
  const originalConfig = { ...config.linear }

  t.after(() => {
    Object.assign(config.linear, originalConfig)
  })

  config.linear.apiKey = undefined

  const result = await fetchLinearEvents('2026-08-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z')

  assert.deepEqual(result.events, [])
  assert.deepEqual(result.statuses, [{ source: 'linear', ok: false, lastError: 'not-connected' }])
})

test('fetchLinearEvents fetches issues and derives one calendar per team', async (t) => {
  const originalFetch = globalThis.fetch
  const originalConfig = { ...config.linear }
  const linearRequests = []

  t.after(() => {
    globalThis.fetch = originalFetch
    Object.assign(config.linear, originalConfig)
  })

  config.linear.apiKey = 'test-linear-key'
  config.linear.teamKeys = []

  globalThis.fetch = async (url, options) => {
    linearRequests.push({ url, body: JSON.parse(options.body) })

    return {
      ok: true,
      json: async () => ({
        data: {
          viewer: {
            assignedIssues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: 'issue-1',
                  identifier: 'DEVREL-1561',
                  title: 'Publish announcement post',
                  dueDate: '2026-08-07',
                  url: 'https://linear.app/a8c/issue/DEVREL-1561',
                  state: { name: 'Todo', type: 'unstarted' },
                  team: { id: 'team-devrel', key: 'DEVREL', name: 'Developer Relations' }
                },
                {
                  id: 'issue-2',
                  identifier: 'DEVREL-1562',
                  title: 'Update docs',
                  dueDate: '2026-08-10',
                  url: 'https://linear.app/a8c/issue/DEVREL-1562',
                  state: { name: 'In Progress', type: 'started' },
                  team: { id: 'team-devrel', key: 'DEVREL', name: 'Developer Relations' }
                }
              ]
            }
          }
        }
      })
    }
  }

  const result = await fetchLinearEvents('2026-08-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z')

  assert.equal(result.events.length, 2)
  assert.equal(result.events[0].id, 'linear:issue-1')
  assert.equal(result.events[1].id, 'linear:issue-2')
  assert.equal(result.calendars.length, 1)
  assert.equal(result.calendars[0].calendarId, 'linear:team-devrel')
  assert.equal(result.calendars[0].calendarName, 'Developer Relations')
  assert.ok(result.statuses[0].ok)
})

test('fetchLinearEvents follows pagination to a second page', async (t) => {
  const originalFetch = globalThis.fetch
  const originalConfig = { ...config.linear }
  let pageCount = 0

  t.after(() => {
    globalThis.fetch = originalFetch
    Object.assign(config.linear, originalConfig)
  })

  config.linear.apiKey = 'test-linear-key'
  config.linear.teamKeys = []

  globalThis.fetch = async () => {
    pageCount += 1
    if (pageCount === 1) {
      return {
        ok: true,
        json: async () => ({
          data: {
            viewer: {
              assignedIssues: {
                pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                nodes: [{
                  id: 'issue-1',
                  identifier: 'DEVREL-1561',
                  title: 'First page issue',
                  dueDate: '2026-08-07',
                  url: 'https://linear.app/a8c/issue/DEVREL-1561',
                  state: { name: 'Todo', type: 'unstarted' },
                  team: { id: 'team-devrel', key: 'DEVREL', name: 'DevRel' }
                }]
              }
            }
          }
        })
      }
    }

    return {
      ok: true,
      json: async () => ({
        data: {
          viewer: {
            assignedIssues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [{
                id: 'issue-2',
                identifier: 'DEVREL-1562',
                title: 'Second page issue',
                dueDate: '2026-08-08',
                url: 'https://linear.app/a8c/issue/DEVREL-1562',
                state: { name: 'Todo', type: 'unstarted' },
                team: { id: 'team-devrel', key: 'DEVREL', name: 'DevRel' }
              }]
            }
          }
        }
      })
    }
  }

  const result = await fetchLinearEvents('2026-08-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z')

  assert.equal(pageCount, 2)
  assert.equal(result.events.length, 2)
})

test('fetchLinearEvents filters by team allow-list', async (t) => {
  const originalFetch = globalThis.fetch
  const originalConfig = { ...config.linear }

  t.after(() => {
    globalThis.fetch = originalFetch
    Object.assign(config.linear, originalConfig)
  })

  config.linear.apiKey = 'test-linear-key'
  config.linear.teamKeys = ['DEVREL']

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: {
        viewer: {
          assignedIssues: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'issue-1',
                identifier: 'DEVREL-1561',
                title: 'DevRel issue',
                dueDate: '2026-08-07',
                url: 'https://linear.app/a8c/issue/DEVREL-1561',
                state: { name: 'Todo', type: 'unstarted' },
                team: { id: 'team-devrel', key: 'DEVREL', name: 'Developer Relations' }
              },
              {
                id: 'issue-2',
                identifier: 'ENG-100',
                title: 'Engineering issue',
                dueDate: '2026-08-08',
                url: 'https://linear.app/a8c/issue/ENG-100',
                state: { name: 'Todo', type: 'unstarted' },
                team: { id: 'team-eng', key: 'ENG', name: 'Engineering' }
              }
            ]
          }
        }
      }
    })
  })

  const result = await fetchLinearEvents('2026-08-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z')

  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].title, 'DEVREL-1561 DevRel issue')
  assert.equal(result.calendars.length, 1)
  assert.equal(result.calendars[0].calendarId, 'linear:team-devrel')
})
