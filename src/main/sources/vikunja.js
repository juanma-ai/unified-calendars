import { config } from '../config.js'
import { isRealVikunjaDate, mapVikunjaTask } from './calendarEventMappers.js'

// v2 accepts up to 1000; v1 caps at 50. A year view over a busy instance is a single
// request at this size, which is the reason the source targets v2 at all.
const PER_PAGE = 1000

// Vikunja projects carry no colour of their own (hex_color comes back empty), so
// calendars are tinted from a fixed palette in a stable project-id order.
const PROJECT_COLORS = [
  '#1973ff', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4338ca'
]

function apiRequest(path, params = {}) {
  const baseUrl = config.vikunja.baseUrl.replace(/\/+$/, '')
  const query = new URLSearchParams(params).toString()
  return fetch(`${baseUrl}/api/v2${path}${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.vikunja.token}`,
      Accept: 'application/json'
    }
  })
}

/**
 * Walks every page of a v2 collection. The envelope reports `total_pages`, and there is
 * no `x-pagination-total-pages` header on v2, so the page count has to come from the
 * body. Not following this silently truncates the tail of a wide range, the same trap
 * AGENTS.md records for Google's `events.list`.
 */
async function fetchAllPages(path, params, label) {
  const items = []
  let page = 1
  let totalPages = 1

  do {
    const res = await apiRequest(path, { ...params, page, per_page: PER_PAGE })
    if (!res.ok) throw new Error(`Vikunja ${label} request failed: ${res.status}`)

    const body = await res.json()
    items.push(...(body.items ?? []))
    totalPages = Number(body.total_pages) || 1
    page += 1
  } while (page <= totalPages)

  return items
}

/**
 * `/api/v2/projects` also returns saved filters as pseudo-projects with negative ids
 * (`-2` is the built-in "My Open Tasks"). Those hold no tasks of their own and would show
 * up as a phantom calendar, so anything not a real project is dropped here.
 */
function buildProjects(rawProjects) {
  const real = rawProjects.filter((project) => Number(project.id) > 0)
  // Vikunja stores project titles verbatim, trailing spaces included.
  const titlesById = new Map(
    real.map((project) => [Number(project.id), (project.title ?? '').trim()])
  )

  return new Map(
    real.map((project, index) => {
      const parentTitle = titlesById.get(Number(project.parent_project_id))
      const title = titlesById.get(Number(project.id))
      return [
        Number(project.id),
        {
          id: Number(project.id),
          name: parentTitle ? `${parentTitle} / ${title}` : title,
          color: PROJECT_COLORS[index % PROJECT_COLORS.length],
          isArchived: Boolean(project.is_archived)
        }
      ]
    })
  )
}

export async function fetchVikunjaEvents(rangeStart, rangeEnd) {
  if (!config.vikunja?.baseUrl || !config.vikunja?.token) {
    return { events: [], statuses: [{ source: 'vikunja', ok: false, lastError: 'not-connected' }] }
  }

  try {
    const baseUrl = config.vikunja.baseUrl.replace(/\/+$/, '')
    const from = new Date(rangeStart).toISOString()
    const to = new Date(rangeEnd).toISOString()

    const projectsById = buildProjects(await fetchAllPages('/projects', {}, 'projects'))

    const allowed = config.vikunja.projectIds
    const tasks = await fetchAllPages(
      '/tasks',
      // Completed tasks are dropped server-side, matching filterIncompleteTrelloCards:
      // a finished deadline is not something the calendar needs to keep showing.
      { filter: `due_date > '${from}' && due_date < '${to}' && done = false` },
      'tasks'
    )

    const events = []
    const usedProjectIds = new Set()

    for (const task of tasks) {
      if (!isRealVikunjaDate(task.due_date)) continue

      const projectId = Number(task.project_id)
      const project = projectsById.get(projectId)
      // A task in a project the token cannot list has nowhere to hang in the sidebar.
      if (!project) continue
      if (allowed.length > 0 && !allowed.includes(String(projectId))) continue

      usedProjectIds.add(projectId)
      events.push(mapVikunjaTask(task, project, baseUrl))
    }

    const calendars = [...usedProjectIds].map((projectId) => {
      const project = projectsById.get(projectId)
      return {
        source: 'vikunja',
        calendarId: `vikunja:${project.id}`,
        providerCalendarId: String(project.id),
        calendarName: project.name,
        url: `${baseUrl}/projects/${project.id}`,
        calendarDefaultColor: project.color,
        calendarDefaultVisible: false
      }
    })

    return {
      events,
      calendars,
      statuses: [{ source: 'vikunja', ok: true, lastSyncedAt: new Date().toISOString() }]
    }
  } catch (err) {
    return { events: [], statuses: [{ source: 'vikunja', ok: false, lastError: err.message }] }
  }
}
