import { TZDate } from '@date-fns/tz'
import { isCalendarView } from './calendarViews.js'

export function readCalendarLocation(search, storedView, today = new Date(), timeZone) {
  const params = new URLSearchParams(search)
  const requestedView = params.get('view')
  const view = isCalendarView(requestedView) ? requestedView : storedView
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get('date') || '')
  let date = today
  if (match) {
    const [year, month, day] = match.slice(1).map(Number)
    const candidate = timeZone ? new TZDate(year, month - 1, day, 12, timeZone) : new Date(year, month - 1, day, 12)
    if (year >= 1900 && candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day) date = candidate
  }
  return { view, date }
}
