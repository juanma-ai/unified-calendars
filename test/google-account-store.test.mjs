import assert from 'node:assert/strict'
import test from 'node:test'

import { createGoogleAccountStore } from '../src/main/tokenStore.js'

function createStorage() {
  const values = new Map()
  return {
    delete: (key) => values.delete(key),
    get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, structuredClone(value))
  }
}

test('stores multiple Google accounts and removes only the selected account', () => {
  const accounts = createGoogleAccountStore(createStorage())

  accounts.saveAccount({ id: 'personal-id', label: 'Personal', email: 'me@example.com' }, { refresh_token: 'one' })
  accounts.saveAccount({ id: 'work-id', label: 'Work', email: 'me@work.example' }, { refresh_token: 'two' })

  assert.deepEqual(accounts.listAccounts().map(({ id }) => id), ['personal-id', 'work-id'])
  assert.equal(accounts.getTokens('work-id').refresh_token, 'two')

  accounts.removeAccount('personal-id')

  assert.deepEqual(accounts.listAccounts().map(({ id }) => id), ['work-id'])
  assert.equal(accounts.getTokens('personal-id'), undefined)
  assert.equal(accounts.getTokens('work-id').refresh_token, 'two')
})

test('configured labels only become accounts once they have tokens', () => {
  const accounts = createGoogleAccountStore(createStorage())
  accounts.saveAccount({ id: 'personal-id', label: 'Personal' }, { refresh_token: 'one' })

  const listed = accounts.listAccounts(['default', 'me@work.example'])

  assert.deepEqual(listed.map(({ id }) => id), ['personal-id'], 'no phantom rows')

  accounts.saveTokens('me@work.example', { refresh_token: 'legacy' })
  assert.deepEqual(
    accounts.listAccounts(['default', 'me@work.example']).map(({ id }) => id),
    ['personal-id', 'me@work.example']
  )
})

test('accounts are editable only when their tokens carry a write scope', () => {
  const accounts = createGoogleAccountStore(createStorage())
  accounts.saveAccount({ id: 'read-only' }, {
    refresh_token: 'one',
    scope: 'https://www.googleapis.com/auth/calendar.readonly'
  })
  accounts.saveAccount({ id: 'writable' }, {
    refresh_token: 'two',
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events'
  })

  const byId = Object.fromEntries(accounts.listAccounts().map((account) => [account.id, account]))
  assert.equal(byId['read-only'].canEdit, false)
  assert.equal(byId.writable.canEdit, true)
})
