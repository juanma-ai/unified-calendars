import { EDITOR_ATTENDEES } from './eventEditorModel.js'

/**
 * The known attendees of an event, in the editor's fixed order. Only Radicale fills
 * `attendees` (one X-FAMILIA-ASISTENTE line each); anything outside the fixed list is
 * dropped so a hand-edited .ics cannot put arbitrary text in the pill.
 */
export function getEventAttendees(event) {
  if (!Array.isArray(event?.attendees)) return []
  return EDITOR_ATTENDEES.filter(name => event.attendees.includes(name))
}

/** `JuanMa, Laura` for the popover and the accessible name, or null with nobody. */
export function getAttendeeLabel(event) {
  const attendees = getEventAttendees(event)
  return attendees.length ? attendees.join(', ') : null
}

/** One-letter initials for the pill, e.g. `['J', 'L']`. */
export function getAttendeeInitials(event) {
  return getEventAttendees(event).map(name => name[0].toUpperCase())
}
