import Store from 'electron-store'

const store = new Store({ name: 'calendar-personal-app' })

export function getGoogleTokens(accountLabel) {
  return store.get(`google.${accountLabel}`)
}

export function setGoogleTokens(accountLabel, tokens) {
  store.set(`google.${accountLabel}`, tokens)
}

export function clearGoogleTokens(accountLabel) {
  store.delete(`google.${accountLabel}`)
}
