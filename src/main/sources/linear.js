import { format } from 'date-fns'
import { config } from '../config.js'
import { mapLinearIssue } from './calendarEventMappers.js'

const LINEAR_API_URL = 'https://api.linear.app/graphql'

const ASSIGNED_DUE_ISSUES_QUERY = `
query AssignedDueIssues($after: String, $gte: TimelessDateOrDuration!, $lte: TimelessDateOrDuration!) {
  viewer {
    assignedIssues(
      first: 100
      after: $after
      filter: {
        dueDate: { gte: $gte, lte: $lte }
        state: { type: { nin: ["completed", "canceled"] } }
      }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        identifier
        title
        dueDate
        url
        state { name type }
        team { id key name }
      }
    }
  }
}
`

async function fetchIssuesPage(after, rangeStart, rangeEnd) {
  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: config.linear.apiKey
    },
    body: JSON.stringify({
      query: ASSIGNED_DUE_ISSUES_QUERY,
      variables: {
        after,
        gte: format(new Date(rangeStart), 'yyyy-MM-dd'),
        lte: format(new Date(rangeEnd), 'yyyy-MM-dd')
      }
    })
  })

  if (!res.ok) throw new Error(`Linear API request failed: ${res.status}`)

  const body = await res.json()
  if (body.errors?.length > 0) {
    throw new Error(`Linear API errors: ${body.errors.map((e) => e.message).join(', ')}`)
  }

  return body.data.viewer.assignedIssues
}

export async function fetchLinearEvents(rangeStart, rangeEnd) {
  if (!config.linear.apiKey) {
    return { events: [], statuses: [{ source: 'linear', ok: false, lastError: 'not-connected' }] }
  }

  try {
    const allIssues = []
    let cursor = null

    do {
      const page = await fetchIssuesPage(cursor, rangeStart, rangeEnd)
      allIssues.push(...page.nodes)
      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
    } while (cursor)

    const teamKeys = config.linear.teamKeys
    const filtered = teamKeys.length > 0
      ? allIssues.filter((issue) => teamKeys.includes(issue.team.key))
      : allIssues

    const teamsById = new Map()
    for (const issue of filtered) {
      if (!teamsById.has(issue.team.id)) {
        teamsById.set(issue.team.id, issue.team)
      }
    }

    const calendars = [...teamsById.values()].map((team) => ({
      source: 'linear',
      calendarId: `linear:${team.id}`,
      providerCalendarId: team.id,
      calendarName: team.name,
      url: `https://linear.app/${team.key}`,
      calendarDefaultColor: '#5e6ad2',
      calendarDefaultVisible: false
    }))

    const events = filtered.map((issue) => mapLinearIssue(issue))

    return {
      events,
      calendars,
      statuses: [{ source: 'linear', ok: true, lastSyncedAt: new Date().toISOString() }]
    }
  } catch (err) {
    return { events: [], statuses: [{ source: 'linear', ok: false, lastError: err.message }] }
  }
}
