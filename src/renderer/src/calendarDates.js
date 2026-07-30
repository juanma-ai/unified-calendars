import { addDays, format } from 'date-fns'

export const WEEK_OPTIONS = { weekStartsOn: 1 }

export function formatWeekRange(weekStart) {
  const weekEnd = addDays(weekStart, 6)
  return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
}
