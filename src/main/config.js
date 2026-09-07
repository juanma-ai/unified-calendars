import { config as loadEnv } from 'dotenv'
import { join } from 'node:path'

const isPackaged = Boolean(process.versions.electron && !process.defaultApp)
const envPath = isPackaged
  ? join(process.resourcesPath, 'config/.env')
  : join(process.cwd(), '.env')

loadEnv({ path: envPath })

export const config = {
  radicale: {
    baseUrl: process.env.RADICALE_URL,
    username: process.env.RADICALE_USER,
    password: process.env.RADICALE_PASSWORD,
    calendarPath: process.env.RADICALE_CALENDAR_PATH || '/familia/casa/'
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    accountLabels: (process.env.GOOGLE_ACCOUNTS ?? 'default')
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean)
  },
  trello: {
    apiKey: process.env.TRELLO_API_KEY,
    token: process.env.TRELLO_TOKEN,
    boardIds: (process.env.TRELLO_BOARD_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  },
  linear: {
    apiKey: process.env.LINEAR_API_KEY,
    teamKeys: (process.env.LINEAR_TEAM_KEYS ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
  },
  wallos: {
    baseUrl: process.env.WALLOS_BASE_URL,
    apiKey: process.env.WALLOS_API_KEY
  },
  vikunja: {
    baseUrl: process.env.VIKUNJA_BASE_URL,
    token: process.env.VIKUNJA_TOKEN,
    projectIds: (process.env.VIKUNJA_PROJECT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  }
}
