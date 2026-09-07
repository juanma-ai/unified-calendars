import Store from 'electron-store'
import { config } from './config.js'
import { fetchGoogleEvents } from './sources/google.js'
import { fetchTrelloEvents } from './sources/trello.js'
import { fetchRemindersEvents } from './sources/reminders.js'
import { fetchTimetrackerEvents } from './sources/timetracker.js'
import { fetchLinearEvents } from './sources/linear.js'
import { fetchWallosEvents } from './sources/wallos.js'
import { fetchVikunjaEvents } from './sources/vikunja.js'
import { createAggregator, SOURCE_TTL_MS } from './sourceRegistry.js'
import { fetchRadicaleEvents } from './sources/radicale.js'


const FETCHERS = {
  ...(config.radicale.baseUrl ? { radicale: fetchRadicaleEvents } : {}),
  google: fetchGoogleEvents,
  trello: fetchTrelloEvents,
  linear: fetchLinearEvents,
  wallos: fetchWallosEvents,
  vikunja: fetchVikunjaEvents,
  reminders: fetchRemindersEvents,
  timetracker: fetchTimetrackerEvents
}


export const { getUnifiedEvents, getSourceStatus, getAvailableCalendars, invalidateSourceCache, getStartupCache } = createAggregator({
  fetchers: FETCHERS, ttl: SOURCE_TTL_MS, storage: new Store({ name: 'calendar-personal-app' })
})
