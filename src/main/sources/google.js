import { createServer } from 'node:http'
import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'
import { config } from '../config.js'
import { getGoogleTokens, setGoogleTokens } from '../tokenStore.js'
import { mapGoogleEvent } from './calendarEventMappers.js'

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

// Authenticated OAuth2Client per account label, kept in memory once loaded/authorized.
const clients = new Map()

function createOAuth2Client(redirectUri) {
  return new OAuth2Client({
    clientId: config.google.clientId,
    clientSecret: config.google.clientSecret,
    redirectUri
  })
}

// Google only sends a refresh_token on the first consent; later token refreshes
// only carry a new access_token, so merge rather than overwrite what's stored.
function persistTokensOnRefresh(client, accountLabel) {
  client.on('tokens', (tokens) => {
    const existing = getGoogleTokens(accountLabel) ?? {}
    setGoogleTokens(accountLabel, { ...existing, ...tokens })
  })
}

export function startOAuthFlow(accountLabel) {
  if (!config.google.clientId || !config.google.clientSecret) {
    return Promise.reject(
      new Error('Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET — copy .env.example to .env and fill it in')
    )
  }

  return new Promise((resolve, reject) => {
    let oAuth2Client

    const server = createServer((req, res) => {
      if (!req.url.startsWith('/oauth2callback')) {
        res.end()
        return
      }

      const qs = new URL(req.url, `http://127.0.0.1:${server.address().port}`).searchParams
      const code = qs.get('code')
      const error = qs.get('error')

      res.end(
        error
          ? 'Authentication failed. You can close this tab and return to the app.'
          : 'Authentication successful. You can close this tab and return to the app.'
      )
      server.close()

      if (error) {
        reject(new Error(`Google OAuth error: ${error}`))
        return
      }

      oAuth2Client
        .getToken(code)
        .then(({ tokens }) => {
          oAuth2Client.setCredentials(tokens)
          setGoogleTokens(accountLabel, tokens)
          persistTokensOnRefresh(oAuth2Client, accountLabel)
          clients.set(accountLabel, oAuth2Client)
          resolve()
        })
        .catch(reject)
    })

    server.on('error', reject)

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      oAuth2Client = createOAuth2Client(`http://127.0.0.1:${port}/oauth2callback`)
      const authorizeUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
      })
      shell.openExternal(authorizeUrl)
    })
  })
}

async function getAuthClient(accountLabel) {
  if (clients.has(accountLabel)) return clients.get(accountLabel)

  const tokens = getGoogleTokens(accountLabel)
  if (!tokens) return null

  const client = createOAuth2Client(undefined)
  client.setCredentials(tokens)
  persistTokensOnRefresh(client, accountLabel)
  clients.set(accountLabel, client)
  return client
}

async function listGoogleCalendars(calendarApi) {
  const calendars = []
  let pageToken

  do {
    const response = await calendarApi.calendarList.list({
      pageToken,
      showDeleted: false,
      showHidden: false
    })
    calendars.push(...(response.data.items ?? []))
    pageToken = response.data.nextPageToken
  } while (pageToken)

  return calendars
}

export async function fetchGoogleEvents(rangeStart, rangeEnd) {
  const events = []
  const statuses = []

  for (const accountLabel of config.google.accountLabels) {
    try {
      const client = await getAuthClient(accountLabel)
      if (!client) {
        statuses.push({ source: 'google', sourceAccountId: accountLabel, ok: false, lastError: 'not-connected' })
        continue
      }

      const calendar = google.calendar({ version: 'v3', auth: client })
      const calendars = await listGoogleCalendars(calendar)
      const calendarEvents = await Promise.all(
        calendars.map(async (calendarEntry) => {
          const response = await calendar.events.list({
            calendarId: calendarEntry.id,
            timeMin: rangeStart,
            timeMax: rangeEnd,
            singleEvents: true,
            orderBy: 'startTime'
          })

          return (response.data.items ?? []).map((item) =>
            mapGoogleEvent(item, accountLabel, calendarEntry)
          )
        })
      )

      events.push(...calendarEvents.flat())
      statuses.push({
        source: 'google',
        sourceAccountId: accountLabel,
        ok: true,
        lastSyncedAt: new Date().toISOString()
      })
    } catch (err) {
      statuses.push({
        source: 'google',
        sourceAccountId: accountLabel,
        ok: false,
        lastError: err.message
      })
    }
  }

  return { events, statuses }
}
