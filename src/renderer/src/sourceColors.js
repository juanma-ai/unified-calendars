export const SOURCES = [
  { key: 'google', label: 'Google Calendar', color: '#4285f4' },
  { key: 'trello', label: 'Trello', color: '#0079bf' },
  { key: 'reminders', label: 'Reminders', color: '#ff9500' }
]

export const SOURCE_COLORS = Object.fromEntries(SOURCES.map((s) => [s.key, s.color]))
