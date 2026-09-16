export const SOURCES = [
  { key: 'radicale', label: 'Radicale', color: '#059669' },
  { key: 'google', label: 'Google Calendar', color: '#4285f4' },
  { key: 'trello', label: 'Trello', color: '#0079bf' },
  { key: 'linear', label: 'Linear', color: '#5e6ad2' },
  { key: 'reminders', label: 'Reminders', color: '#ff9500' },
  { key: 'timetracker', label: 'Time Tracker', color: '#00875a' },
  { key: 'wallos', label: 'Wallos', color: '#1d4ed8' },
  { key: 'vikunja', label: 'Vikunja', color: '#1973ff' }
]

export const SOURCE_COLORS = Object.fromEntries(SOURCES.map((s) => [s.key, s.color]))
