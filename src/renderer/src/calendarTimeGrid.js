import { addDays, differenceInMinutes, startOfDay } from 'date-fns'

export const HOUR_HEIGHT = 64
export const MINIMUM_EVENT_MINUTES = 30

export function getCenteredTimeScrollTop(date, viewportHeight) {
  const currentMinutes = date.getHours() * 60 + date.getMinutes()
  const currentTop = (currentMinutes / 60) * HOUR_HEIGHT
  const gridHeight = 24 * HOUR_HEIGHT
  const maxScrollTop = Math.max(0, gridHeight - viewportHeight)

  return Math.min(Math.max(0, currentTop - viewportHeight / 2), maxScrollTop)
}

function timedPosition(event, day) {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  const eventStart = new Date(event.start)
  const rawEnd = new Date(event.end ?? event.start)
  const eventEnd = rawEnd > eventStart
    ? rawEnd
    : new Date(eventStart.getTime() + MINIMUM_EVENT_MINUTES * 60_000)
  const clampedStart = eventStart < dayStart ? dayStart : eventStart
  const clampedEnd = eventEnd > dayEnd ? dayEnd : eventEnd
  const startMinutes = Math.max(0, differenceInMinutes(clampedStart, dayStart))
  const durationMinutes = Math.max(1, differenceInMinutes(clampedEnd, clampedStart))

  return {
    event,
    startMinutes,
    durationMinutes,
    endMinutes: startMinutes + durationMinutes,
    column: 0,
    columnCount: 1
  }
}

function assignOverlapColumns(events) {
  const sorted = [...events].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.durationMinutes - a.durationMinutes
  )
  let group = []
  let groupEnd = -1

  const finishGroup = () => {
    if (group.length === 0) return
    const columnCount = Math.max(...group.map((item) => item.column)) + 1
    for (const item of group) item.columnCount = columnCount
  }

  for (const item of sorted) {
    if (item.startMinutes >= groupEnd) {
      finishGroup()
      group = []
      groupEnd = -1
    }

    const activeColumns = new Set(
      group
        .filter((other) => other.endMinutes > item.startMinutes)
        .map((other) => other.column)
    )
    let column = 0
    while (activeColumns.has(column)) column += 1
    item.column = column
    group.push(item)
    groupEnd = Math.max(groupEnd, item.endMinutes)
  }

  finishGroup()
  return sorted
}

export function buildDayLayout(events, day) {
  const allDayEvents = events.filter((event) => event.allDay)
  const timedEvents = assignOverlapColumns(
    events.filter((event) => !event.allDay).map((event) => timedPosition(event, day))
  )

  return { allDayEvents, timedEvents }
}
