import { tz } from '@date-fns/tz'
import { addDays, format } from 'date-fns'
import { resolveTimeZone } from './calendarTimeZones.js'

export const WEEK_OPTIONS = { weekStartsOn: 1 }

export function formatWeekRange(weekStart, timeZone) {
  const zoneContext = { in: tz(resolveTimeZone(timeZone)) }
  const weekEnd = addDays(weekStart, 6, zoneContext)
  return `${format(weekStart, 'MMM d', zoneContext)} – ${format(weekEnd, 'MMM d, yyyy', zoneContext)}`
}
