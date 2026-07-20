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
