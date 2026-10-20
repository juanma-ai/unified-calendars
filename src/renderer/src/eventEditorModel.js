import { TZDate } from '@date-fns/tz'
import { addDays, addHours, format, startOfHour } from 'date-fns'
import { resolveTimeZone } from './calendarTimeZones.js'

// Form state for the family web's event editor and its translation to the API.
// Kept free of React so the date maths can be tested in plain Node.

export const EDITOR_ATTENDEES = ['JuanMa', 'Laura']
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// A date-only value is a civil date: build it from its digits, never parse it
// as an instant (see getEventDayRange).
function civilDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const formatCivil = date => format(date, 'yyyy-MM-dd')

function zonedParts(instant, timeZone) {
  const zoned = new TZDate(new Date(instant).getTime(), resolveTimeZone(timeZone))
  return { date: format(zoned, 'yyyy-MM-dd'), time: format(zoned, 'HH:mm') }
}

function toInstant(date, time, timeZone) {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new TZDate(year, month - 1, day, hours, minutes, resolveTimeZone(timeZone)).toISOString()
}

export function eventToForm(event, timeZone) {
  const base = {
    title: event.title ?? '', calendarId: event.calendarId, location: event.location ?? '',
    description: event.description ?? '', attendees: EDITOR_ATTENDEES.filter(name => event.attendees?.includes(name))
  }
  if (event.allDay && DATE_ONLY.test(event.start)) {
    // The form shows the last day the event covers; the stored end is exclusive.
    const end = DATE_ONLY.test(event.end ?? '') ? addDays(civilDate(event.end), -1) : civilDate(event.start)
    return { ...base, allDay: true, startDate: event.start, endDate: formatCivil(end), startTime: '09:00', endTime: '10:00' }
  }
  const start = zonedParts(event.start, timeZone)
  const end = zonedParts(event.end ?? event.start, timeZone)
  return { ...base, allDay: false, startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time }
}

// A new event starts at the next full hour when the anchor is today, otherwise
// at 09:00 on the anchor day, and lasts an hour.
export function newEventForm({ anchorDate, now = new Date(), timeZone, calendarId }) {
  const zone = resolveTimeZone(timeZone)
  const today = zonedParts(now, zone).date
  const day = formatCivil(anchorDate)
  const [year, month, date] = day.split('-').map(Number)
  const start = day === today
    ? startOfHour(addHours(new TZDate(now.getTime(), zone), 1))
    : new TZDate(year, month - 1, date, 9, 0, zone)
  const end = addHours(start, 1)
  return {
    title: '', calendarId, location: '', description: '', attendees: [], allDay: false,
    startDate: format(start, 'yyyy-MM-dd'), startTime: format(start, 'HH:mm'),
    endDate: format(end, 'yyyy-MM-dd'), endTime: format(end, 'HH:mm')
  }
}

export function formTimes(form, timeZone) {
  if (form.allDay) return { start: form.startDate, end: formatCivil(addDays(civilDate(form.endDate), 1)) }
  return { start: toInstant(form.startDate, form.startTime, timeZone), end: toInstant(form.endDate, form.endTime, timeZone) }
}

// Returns the message to show, or null when the form can be saved.
export function validateForm(form, timeZone) {
  if (!form.title.trim()) return 'Ponle un título al evento.'
  if (!DATE_ONLY.test(form.startDate) || !DATE_ONLY.test(form.endDate)) return 'Elige las fechas de inicio y fin.'
  if (!form.allDay && (!/^\d{2}:\d{2}$/.test(form.startTime) || !/^\d{2}:\d{2}$/.test(form.endTime))) return 'Elige las horas de inicio y fin.'
  const { start, end } = formTimes(form, timeZone)
  const ends = form.allDay ? civilDate(end) > civilDate(start) : Date.parse(end) > Date.parse(start)
  return ends ? null : 'El final tiene que ser después del inicio.'
}

export function formToFields(form, timeZone) {
  return {
    title: form.title.trim(), ...formTimes(form, timeZone),
    location: form.location.trim(), description: form.description.trim(),
    attendees: EDITOR_ATTENDEES.filter(name => form.attendees.includes(name))
  }
}

// Only what the person actually changed goes to the server, so an untouched
// field is never rewritten (or emptied) by the round trip through the form.
export function getEventChanges(event, form, timeZone) {
  const before = formToFields(eventToForm(event, timeZone), timeZone)
  const after = formToFields(form, timeZone)
  const changes = {}
  for (const key of ['title', 'location', 'description']) if (after[key] !== before[key]) changes[key] = after[key]
  if (after.start !== before.start || after.end !== before.end) Object.assign(changes, { start: after.start, end: after.end })
  if (after.attendees.join() !== before.attendees.join()) changes.attendees = after.attendees
  return changes
}

// Saves the form through the bridge. A calendar change is a MOVE of the whole
// file, so the field edits go first and the move carries the etag they return;
// moving first would leave the update holding the old path. Nothing is sent
// when nothing changed.
export async function saveEventForm({ api, event, form, calendars, timeZone }) {
  const calendarPath = calendars.find(calendar => calendar.calendarId === form.calendarId)?.providerCalendarId
  if (!calendarPath) throw new Error('Ese calendario ya no está disponible. Recarga la página.')
  if (!event) return api.createEvent({ calendarPath, ...formToFields(form, timeZone) })
  const moves = form.calendarId !== event.calendarId
  if (moves && event.recurrenceId) throw new Error('Una ocurrencia de una serie no puede cambiar de calendario.')
  let current = event
  const changes = getEventChanges(event, form, timeZone)
  if (Object.keys(changes).length) {
    const result = await api.updateEvent({ event: current, changes })
    current = { ...current, etag: result?.etag ?? current.etag }
  }
  if (moves) await api.moveEventToCalendar({ event: current, calendarPath })
}
