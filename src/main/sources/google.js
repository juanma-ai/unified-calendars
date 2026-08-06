import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { shell } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'
import { config } from '../config.js'
import {
  clearGoogleTokens,
  getGoogleAccounts,
  getGoogleTokens,
  saveGoogleAccount,
  setGoogleTokens
} from '../tokenStore.js'
import { mapGoogleEvent } from './calendarEventMappers.js'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events'
]

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

export function startOAuthFlow(existingAccountId) {
  if (!config.google.clientId || !config.google.clientSecret) {
    return Promise.reject(
      new Error('Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET — copy .env.example to .env and fill it in')
    )
  }

  return new Promise((resolve, reject) => {
    let oAuth2Client
    const requestedAccountId = existingAccountId || randomUUID()
    const oauthState = randomUUID()

    const server = createServer((req, res) => {
      if (!req.url.startsWith('/oauth2callback')) {
        res.end()
        return
      }

      const qs = new URL(req.url, `http://127.0.0.1:${server.address().port}`).searchParams
      const code = qs.get('code')
      const error = qs.get('error')
      const returnedState = qs.get('state')

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

      if (returnedState !== oauthState) {
        reject(new Error('Google OAuth state did not match'))
        return
      }

      oAuth2Client
        .getToken(code)
        .then(async ({ tokens }) => {
          oAuth2Client.setCredentials(tokens)
          const calendarApi = google.calendar({ version: 'v3', auth: oAuth2Client })
          const calendars = await listGoogleCalendars(calendarApi)
          const primary = calendars.find(({ primary }) => primary) ?? calendars[0]
          const existingAccount = existingAccountId
            ? null
            : getGoogleAccounts(config.google.accountLabels)
                .find(({ email }) => email && email === primary?.id)
          const account = {
            id: existingAccount?.id ?? requestedAccountId,
            label: primary?.summaryOverride ?? primary?.summary ?? primary?.id ?? 'Google account',
            email: primary?.id
          }

          saveGoogleAccount(account, tokens)
          persistTokensOnRefresh(oAuth2Client, account.id)
          clients.set(account.id, oAuth2Client)
          resolve(account)
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
        prompt: 'consent',
        state: oauthState
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

// events.list caps a page at 250 by default, which a week never hit but a month
// or a year easily does — without following nextPageToken the later part of the
// range silently comes back empty.
async function listAllEvents(calendarApi, calendarId, rangeStart, rangeEnd) {
  const items = []
  let pageToken

  do {
    const response = await calendarApi.events.list({
      calendarId,
      maxResults: 2500,
      orderBy: 'startTime',
      pageToken,
      singleEvents: true,
      timeMax: rangeEnd,
      timeMin: rangeStart
    })
    items.push(...(response.data.items ?? []))
    pageToken = response.data.nextPageToken
  } while (pageToken)

  return items
}

export async function fetchGoogleEvents(rangeStart, rangeEnd) {
  const events = []
  const sourceCalendars = []
  const statuses = []

  const accounts = getGoogleAccounts(config.google.accountLabels)

  for (const account of accounts) {
    try {
      const client = await getAuthClient(account.id)
      if (!client) {
        statuses.push({
          source: 'google',
          sourceAccountId: account.id,
          sourceAccountName: account.label,
          ok: false,
          lastError: 'not-connected'
        })
        continue
      }

      const calendar = google.calendar({ version: 'v3', auth: client })
      const calendars = await listGoogleCalendars(calendar)
      sourceCalendars.push(...calendars.map((calendarEntry) => ({
        source: 'google',
        sourceAccountId: account.id,
        sourceAccountName: account.label,
        calendarId: `google:${account.id}:${calendarEntry.id}`,
        providerCalendarId: calendarEntry.id,
        accountEmail: account.email,
        calendarName: calendarEntry.summaryOverride ?? calendarEntry.summary ?? calendarEntry.id,
        calendarDefaultColor: calendarEntry.backgroundColor ?? '#3858e9',
        calendarDefaultVisible: Boolean(calendarEntry.primary)
      })))
      const calendarEvents = await Promise.all(
        calendars.map(async (calendarEntry) => {
          const items = await listAllEvents(calendar, calendarEntry.id, rangeStart, rangeEnd)
          return items.map((item) => mapGoogleEvent(item, account.id, calendarEntry))
        })
      )

      events.push(...calendarEvents.flat())
      statuses.push({
        source: 'google',
        sourceAccountId: account.id,
        sourceAccountName: account.label,
        ok: true,
        lastSyncedAt: new Date().toISOString()
      })
    } catch (err) {
      statuses.push({
        source: 'google',
        sourceAccountId: account.id,
        sourceAccountName: account.label,
        ok: false,
        lastError: err.message
      })
    }
  }

  return { events, calendars: sourceCalendars, statuses }
}

// All-day boundaries are plain calendar dates; the renderer shifts them at UTC
// midnight, so the UTC date part is the value Google expects back.
function toAllDayDate(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function toGoogleTimes(event, { start, end }) {
  if (event.allDay) {
    return { start: { date: toAllDayDate(start) }, end: { date: toAllDayDate(end) } }
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return {
    start: { dateTime: new Date(start).toISOString(), timeZone },
    end: { dateTime: new Date(end).toISOString(), timeZone }
  }
}

export async function updateGoogleEventTime(event, times) {
  const client = await getAuthClient(event.sourceAccountId)
  if (!client) throw new Error('Google account is not connected')

  const calendar = google.calendar({ version: 'v3', auth: client })

  let response
  try {
    response = await calendar.events.patch({
      calendarId: event.providerCalendarId,
      eventId: event.providerEventId,
      requestBody: toGoogleTimes(event, times)
    })
  } catch (error) {
    const status = error?.response?.status ?? error?.code
    if (status === 401 || status === 403) {
      throw new Error(
        'Google denied the edit. Reconnect this account in Settings to grant calendar editing.'
      )
    }
    throw error
  }

  // The patch response is a bare event resource, so rebuild the calendar fields
  // this event already carries rather than refetching the calendar list.
  return mapGoogleEvent(response.data, event.sourceAccountId, {
    id: event.providerCalendarId,
    summary: event.calendarName,
    backgroundColor: event.calendarDefaultColor,
    primary: event.calendarDefaultVisible
  })
}

export function disconnectGoogleAccount(accountId) {
  clients.delete(accountId)
  clearGoogleTokens(accountId)
}
