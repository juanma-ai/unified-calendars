import assert from 'node:assert/strict'
import test from 'node:test'

import { config } from '../src/main/config.js'
import { fetchVikunjaEvents } from '../src/main/sources/vikunja.js'

const PROJECTS = {
  items: [
    { id: 20, title: 'Family', parent_project_id: 0, is_archived: false },
    { id: 22, title: 'A8C', parent_project_id: 0, is_archived: false },
    { id: 23, title: 'Sweepers', parent_project_id: 22, is_archived: false },
    // A saved filter, not a real project. Vikunja returns these inline with a
    // negative id and leaves them out of `total`.
    { id: -2, title: 'My Open Tasks', parent_project_id: 0, is_archived: false }
  ],
  total: 3,
  page: 1,
  per_page: 1000,
  total_pages: 1
}

function task(id, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    done: false,
    due_date: '2026-08-19T10:05:00Z',
    project_id: 20,
    assignees: [],
    ...overrides
  }
}

function useConfig(t, vikunja) {
  const original = { ...config.vikunja }
  const originalFetch = globalThis.fetch
  t.after(() => {
    Object.assign(config.vikunja, original)
    globalThis.fetch = originalFetch
  })
  Object.assign(config.vikunja, vikunja)
}

const RANGE = ['2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z']

test('returns not-connected when the token is missing', async (t) => {
  useConfig(t, { baseUrl: 'https://tareas.example.test', token: undefined, projectIds: [] })

  const result = await fetchVikunjaEvents(...RANGE)

  assert.deepEqual(result.events, [])
  assert.deepEqual(result.statuses, [
    { source: 'vikunja', ok: false, lastError: 'not-connected' }
  ])
})

test('follows every page of tasks instead of stopping at the first', async (t) => {
  useConfig(t, { baseUrl: 'https://tareas.example.test/', token: 'tk_test', projectIds: [] })
  const requested = []

  globalThis.fetch = async (url) => {
    requested.push(url)
    if (url.includes('/api/v2/projects')) return { ok: true, json: async () => PROJECTS }

    const page = Number(new URL(url).searchParams.get('page'))
    return {
      ok: true,
      json: async () => ({
        items: page === 1 ? [task(1), task(2)] : [task(3, { project_id: 23 })],
        total: 3,
        page,
        per_page: 1000,
        total_pages: 2
      })
    }
  }

  const result = await fetchVikunjaEvents(...RANGE)

  assert.deepEqual(
    result.events.map((event) => event.id),
    ['vikunja:1', 'vikunja:2', 'vikunja:3']
  )
  assert.equal(requested.filter((url) => url.includes('/api/v2/tasks')).length, 2)
  // The trailing slash on baseUrl must not survive into request URLs.
  assert.ok(requested.every((url) => !url.includes('.test//')))

  const taskRequest = new URL(requested.find((url) => url.includes('/api/v2/tasks')))
  assert.equal(taskRequest.searchParams.get('per_page'), '1000')
  assert.equal(
    taskRequest.searchParams.get('filter'),
    "due_date > '2026-08-01T00:00:00.000Z' && due_date < '2026-09-01T00:00:00.000Z' && done = false"
  )
})

test('builds one calendar per project actually used, with parent names', async (t) => {
  useConfig(t, { baseUrl: 'https://tareas.example.test', token: 'tk_test', projectIds: [] })

  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      url.includes('/projects')
        ? PROJECTS
        : { items: [task(1), task(3, { project_id: 23 })], total: 2, page: 1, per_page: 1000, total_pages: 1 }
  })

  const result = await fetchVikunjaEvents(...RANGE)

  assert.deepEqual(
    result.calendars.map((calendar) => [calendar.calendarId, calendar.calendarName]),
    [
      ['vikunja:20', 'Family'],
      ['vikunja:23', 'A8C / Sweepers']
    ]
  )
  // Project 22 has no dated tasks and the saved filter is not a project at all.
  assert.ok(!result.calendars.some((calendar) => calendar.calendarId === 'vikunja:-2'))
  assert.ok(result.calendars.every((calendar) => calendar.calendarDefaultVisible === false))
  assert.equal(result.calendars[0].url, 'https://tareas.example.test/projects/20')
})

test('drops tasks whose due date is the Go zero time', async (t) => {
  useConfig(t, { baseUrl: 'https://tareas.example.test', token: 'tk_test', projectIds: [] })

  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      url.includes('/projects')
        ? PROJECTS
        : {
            items: [task(1), task(2, { due_date: '0001-01-01T00:00:00Z' })],
            total: 2,
            page: 1,
            per_page: 1000,
            total_pages: 1
          }
  })

  const result = await fetchVikunjaEvents(...RANGE)

  assert.deepEqual(result.events.map((event) => event.id), ['vikunja:1'])
})

test('VIKUNJA_PROJECT_IDS restricts which projects reach the calendar', async (t) => {
  useConfig(t, { baseUrl: 'https://tareas.example.test', token: 'tk_test', projectIds: ['23'] })

  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      url.includes('/projects')
        ? PROJECTS
        : { items: [task(1), task(3, { project_id: 23 })], total: 2, page: 1, per_page: 1000, total_pages: 1 }
  })

  const result = await fetchVikunjaEvents(...RANGE)

  assert.deepEqual(result.events.map((event) => event.id), ['vikunja:3'])
  assert.deepEqual(result.calendars.map((calendar) => calendar.calendarId), ['vikunja:23'])
})

test('configured projects missing from the project list surface as an access error', async (t) => {
  useConfig(t, { baseUrl: 'https://tareas.example.test', token: 'tk_test', projectIds: ['20'] })

  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      url.includes('/projects')
        ? { ...PROJECTS, items: PROJECTS.items.filter((project) => project.id !== 20) }
        : { items: [], total: 0, page: 1, per_page: 1000, total_pages: 1 }
  })

  const result = await fetchVikunjaEvents(...RANGE)

  assert.deepEqual(result.events, [])
  assert.equal(result.statuses[0].ok, false)
  assert.match(result.statuses[0].lastError, /configured projects unavailable: 20/)
})

test('a failing request surfaces as a status, never a throw', async (t) => {
  useConfig(t, { baseUrl: 'https://tareas.example.test', token: 'tk_test', projectIds: [] })

  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) })

  const result = await fetchVikunjaEvents(...RANGE)

  assert.deepEqual(result.events, [])
  assert.equal(result.statuses[0].ok, false)
  assert.match(result.statuses[0].lastError, /401/)
})
