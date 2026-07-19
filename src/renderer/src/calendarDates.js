import { addDays, format, startOfWeek } from 'date-fns'

export const WEEK_OPTIONS = { weekStartsOn: 1 }

export function getMondayWeek(date) {
  const start = startOfWeek(date, WEEK_OPTIONS)
  return {
    start,
    days: Array.from({ length: 7 }, (_, index) => addDays(start, index))
  }
}

export function formatWeekRange(weekStart) {
  const weekEnd = addDays(weekStart, 6)
  return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
}
