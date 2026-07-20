import Store from 'electron-store'

const ACCOUNTS_KEY = 'googleAccounts'

export function createGoogleAccountStore(storage) {
  const listStoredAccounts = () => storage.get(ACCOUNTS_KEY, [])

  return {
    listAccounts(fallbackLabels = []) {
      const stored = listStoredAccounts()
      const knownIds = new Set(stored.map(({ id }) => id))
      const legacy = fallbackLabels
        .filter((id) => !knownIds.has(id))
        .map((id) => ({ id, label: id, legacy: true }))
      return [...stored, ...legacy]
    },

    getTokens(accountId) {
      return storage.get(`google.${accountId}`)
    },

    saveTokens(accountId, tokens) {
      storage.set(`google.${accountId}`, tokens)
    },

    saveAccount(account, tokens) {
      const accounts = listStoredAccounts()
      const existingIndex = accounts.findIndex(({ id }) => id === account.id)
      if (existingIndex === -1) accounts.push(account)
      else accounts[existingIndex] = { ...accounts[existingIndex], ...account }
      storage.set(ACCOUNTS_KEY, accounts)
      if (tokens) this.saveTokens(account.id, tokens)
      return account
    },

    removeAccount(accountId) {
      storage.set(ACCOUNTS_KEY, listStoredAccounts().filter(({ id }) => id !== accountId))
      storage.delete(`google.${accountId}`)
    }
  }
}

let defaultAccountStore

function getDefaultStore() {
  if (!defaultAccountStore) {
    defaultAccountStore = createGoogleAccountStore(new Store({ name: 'calendar-personal-app' }))
  }
  return defaultAccountStore
}

export function getGoogleAccounts(fallbackLabels = []) {
  return getDefaultStore().listAccounts(fallbackLabels)
}

export function getGoogleTokens(accountLabel) {
  return getDefaultStore().getTokens(accountLabel)
}

export function setGoogleTokens(accountLabel, tokens) {
  getDefaultStore().saveTokens(accountLabel, tokens)
}

export function saveGoogleAccount(account, tokens) {
  return getDefaultStore().saveAccount(account, tokens)
}

export function clearGoogleTokens(accountLabel) {
  getDefaultStore().removeAccount(accountLabel)
}
