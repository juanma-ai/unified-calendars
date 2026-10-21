import { randomUUID } from 'node:crypto'
import ICAL from 'ical.js'
import { parseCalendarCollections } from '../main/sources/radicale.js'

// The only people an event can name. They are written as one
// X-FAMILIA-ASISTENTE line each: ATTENDEE turns the event into an invitation
// on the iPhone and removes its Edit button, and a comma-joined value loses
// everything after the first name once the iPhone saves it.
export const ATTENDEES = ['JuanMa', 'Laura']
const ATTENDEE_PROP = 'x-familia-asistente'
const DEFAULT_TZID = 'Europe/Madrid'

// Copied from an event the iPhone wrote (vendor/casa-agent/test/fixtures).
// ical.js ships no zone data, so new events carry this definition themselves.
const MADRID_VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Madrid',
  'BEGIN:STANDARD', 'DTSTART:19961027T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'TZNAME:CET', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'END:STANDARD',
  'BEGIN:DAYLIGHT', 'DTSTART:19810329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'TZNAME:CEST', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'END:DAYLIGHT',
  'END:VTIMEZONE'
].join('\r\n')

const fail = (status, message, code) => Object.assign(new Error(message), { status, code })
const conflict = () => fail(409, 'Alguien ha cambiado este evento. Recarga y vuelve a intentarlo.', 'conflict')
const basicAuth = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function registerZones(vcalendar) {
  for (const component of vcalendar.getAllSubcomponents('vtimezone')) {
    const zone = new ICAL.Timezone(component)
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone.tzid, zone)
  }
}

function ensureZone(vcalendar, tzid) {
  if (tzid !== DEFAULT_TZID || vcalendar.getAllSubcomponents('vtimezone').some(c => c.getFirstPropertyValue('tzid') === tzid)) return
  vcalendar.addSubcomponent(new ICAL.Component(ICAL.parse(MADRID_VTIMEZONE)))
}

function madridZone() {
  if (!ICAL.TimezoneService.has(DEFAULT_TZID)) {
    ICAL.TimezoneService.register(DEFAULT_TZID, new ICAL.Timezone(new ICAL.Component(ICAL.parse(MADRID_VTIMEZONE))))
  }
  return ICAL.TimezoneService.get(DEFAULT_TZID)
}

// The zone new times are written in: the one the event already uses, so the
// iPhone keeps showing the TZID it wrote, or Madrid for floating/date values.
function zoneOf(time) {
  if (time && !time.isDate && time.zone && time.zone !== ICAL.Timezone.localTimezone) return time.zone
  return madridZone()
}

function toTime(value, field, zone) {
  if (typeof value !== 'string') throw fail(400, `${field} is required`, 'invalid-time')
  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    const time = new ICAL.Time({ year, month, day, isDate: true }, ICAL.Timezone.localTimezone)
    if (time.toString() !== value) throw fail(400, `${field} is not a valid date`, 'invalid-time')
    return time
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw fail(400, `${field} is not a valid date`, 'invalid-time')
  return ICAL.Time.fromJSDate(date, true).convertToZone(zone)
}

// start/end come as plain dates for an all-day event and as instants otherwise;
// mixing them, or an end not after the start, is refused.
function setTimes(event, vcalendar, start, end) {
  const zone = zoneOf(event.startDate)
  const startTime = toTime(start, 'start', zone)
  const endTime = toTime(end, 'end', zone)
  if (startTime.isDate !== endTime.isDate) throw fail(400, 'start and end must both be dates or both be times', 'invalid-time')
  if (endTime.compare(startTime) <= 0) throw fail(400, 'end must be after start', 'invalid-range')
  if (!startTime.isDate) ensureZone(vcalendar, zone.tzid)
  event.component.removeAllProperties('duration')
  event.startDate = startTime
  event.endDate = endTime
}

function setText(component, name, value) {
  if (value === undefined) return
  if (typeof value !== 'string') throw fail(400, `${name} must be text`, 'invalid-field')
  if (value.trim()) component.updatePropertyWithValue(name, value)
  else component.removeAllProperties(name)
}

function setAttendees(component, attendees) {
  if (attendees === undefined) return
  if (!Array.isArray(attendees) || attendees.some(name => !ATTENDEES.includes(name))) {
    throw fail(400, 'Unknown attendee', 'invalid-field')
  }
  component.removeAllProperties(ATTENDEE_PROP)
  for (const name of ATTENDEES.filter(name => attendees.includes(name))) component.addPropertyWithValue(ATTENDEE_PROP, name)
}

function applyChanges(event, vcalendar, changes) {
  if (changes.start !== undefined || changes.end !== undefined) setTimes(event, vcalendar, changes.start, changes.end)
  if (changes.title !== undefined && (typeof changes.title !== 'string' || !changes.title.trim())) {
    throw fail(400, 'title is required', 'invalid-field')
  }
  setText(event.component, 'summary', changes.title)
  setText(event.component, 'location', changes.location)
  setText(event.component, 'description', changes.description)
  setAttendees(event.component, changes.attendees)
}

function stamp(component, now, { bumpSequence = true } = {}) {
  const time = ICAL.Time.fromJSDate(now, true)
  component.updatePropertyWithValue('dtstamp', time)
  component.updatePropertyWithValue('last-modified', time)
  if (bumpSequence) component.updatePropertyWithValue('sequence', Number(component.getFirstPropertyValue('sequence') || 0) + 1)
}

// The expanded REPORT names an occurrence by its original start, in UTC for a
// timed series (20261112T090000Z) and as a date for an all-day one (20261112).
function parseRecurrenceId(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/.exec(String(value))
  if (!match) throw fail(400, 'Invalid recurrence id', 'invalid-event')
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number)
  return match[4] === undefined
    ? new ICAL.Time({ year, month, day, isDate: true }, ICAL.Timezone.localTimezone)
    : new ICAL.Time({ year, month, day, hour, minute, second }, ICAL.Timezone.utcTimezone)
}

const sameOccurrence = (a, b) => a.isDate || b.isDate
  ? a.year === b.year && a.month === b.month && a.day === b.day
  : a.toUnixTime() === b.toUnixTime()

// Returns the VEVENT that holds this occurrence, creating the RECURRENCE-ID
// exception if the iPhone has not already made one. The exception is a copy of
// the series so it keeps the alarms and X-APPLE-* lines, and its RECURRENCE-ID
// uses the series' own TZID, which is what the iPhone matches on.
function occurrenceEvent(vcalendar, recurrenceId) {
  const { master, target, existing } = seriesParts(vcalendar, recurrenceId)
  if (existing) return existing
  const occurrence = findOccurrence(master, target)

  const component = new ICAL.Component(structuredClone(master.component.toJSON()))
  for (const name of ['rrule', 'rdate', 'exdate', 'recurrence-id']) component.removeAllProperties(name)
  const exception = new ICAL.Event(component)
  const { endDate } = master.getOccurrenceDetails(occurrence)
  exception.recurrenceId = occurrence.clone()
  exception.startDate = occurrence.clone()
  component.removeAllProperties('duration')
  exception.endDate = endDate.clone()
  vcalendar.addSubcomponent(component)
  return exception
}

// The series, the occurrence the REPORT named and its exception, if any.
function seriesParts(vcalendar, recurrenceId) {
  const vevents = vcalendar.getAllSubcomponents('vevent').map(c => new ICAL.Event(c))
  const master = vevents.find(e => !e.isRecurrenceException())
  if (!master) throw fail(404, 'Series not found', 'not-found')
  const target = parseRecurrenceId(recurrenceId)
  const existing = vevents.find(e => e.isRecurrenceException() && sameOccurrence(e.recurrenceId, target))
  return { master, target, existing }
}

// The occurrence's original start in the series' own zone and value type,
// which is how the iPhone matches a RECURRENCE-ID or an EXDATE.
function findOccurrence(master, target) {
  if (!master.isRecurring()) throw fail(400, 'Event is not part of a series', 'invalid-event')
  const iterator = master.iterator()
  let occurrence
  for (let i = 0; i < 10000 && (occurrence = iterator.next()); i++) {
    if (sameOccurrence(occurrence, target)) break
    if (!occurrence.isDate && !target.isDate && occurrence.toUnixTime() > target.toUnixTime()) { occurrence = null; break }
    if (occurrence.isDate && occurrence.compare(target) > 0) { occurrence = null; break }
  }
  if (!occurrence || !sameOccurrence(occurrence, target)) throw fail(404, 'Occurrence not found in series', 'not-found')
  return occurrence
}

// Drops one occurrence: an EXDATE on the series and, if the iPhone or the web
// had already split it off, its RECURRENCE-ID exception too.
function excludeOccurrence(vcalendar, recurrenceId) {
  const { master, target, existing } = seriesParts(vcalendar, recurrenceId)
  const occurrence = findOccurrence(master, target)
  if (existing) vcalendar.removeSubcomponent(existing.component)
  const exdate = new ICAL.Property('exdate')
  exdate.resetType(occurrence.isDate ? 'date' : 'date-time')
  exdate.setValue(occurrence.clone())
  if (!occurrence.isDate && occurrence.zone?.tzid && !['UTC', 'floating'].includes(occurrence.zone.tzid)) {
    exdate.setParameter('tzid', occurrence.zone.tzid)
  }
  master.component.addProperty(exdate)
  return master
}

function singleEvent(vcalendar) {
  const vevents = vcalendar.getAllSubcomponents('vevent')
  if (vevents.length !== 1) throw fail(400, 'Event is part of a series', 'series')
  const event = new ICAL.Event(vevents[0])
  if (event.isRecurring()) throw fail(400, 'Event is part of a series', 'series')
  return event
}

export function createFamilyWriter(env = process.env) {
  return user => createRadicaleWriter({ baseUrl: env.RADICALE_URL, user, password: env[`RADICALE_PASSWORD_${user.toUpperCase()}`] })
}

// Writes for one signed-in member, with their own Radicale account. The rights
// file is the real boundary; on top of it, every path must belong to a calendar
// this member's PROPFIND returns right now, never one the browser names.
export function createRadicaleWriter({ baseUrl, user, password, fetch = globalThis.fetch, now = () => new Date(), uid = () => randomUUID().toUpperCase() }) {
  const authorization = basicAuth(user, password)
  const request = (path, init) => fetch(new URL(path, baseUrl), {
    redirect: 'error', signal: AbortSignal.timeout(15000), ...init,
    headers: { Authorization: authorization, ...init.headers }
  })

  async function calendarPaths() {
    if (!baseUrl || !password) throw fail(503, 'Calendar not connected', 'not-connected')
    const response = await request(`/${user}/`, {
      method: 'PROPFIND',
      headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body: '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><D:resourcetype/><D:displayname/><C:supported-calendar-component-set/></D:prop></D:propfind>'
    })
    if (response.status !== 207) throw fail(502, `Radicale request failed: ${response.status}`)
    return parseCalendarCollections(await response.text(), user).map(c => c.providerCalendarId)
  }

  function assertCalendar(paths, calendarPath) {
    if (typeof calendarPath !== 'string' || !paths.includes(calendarPath)) throw fail(403, 'Calendar not available', 'forbidden')
    return calendarPath
  }

  // An event href is one .ics file directly inside one of those calendars.
  function assertEventHref(paths, href) {
    if (typeof href !== 'string') throw fail(400, 'Missing event', 'invalid-event')
    const calendarPath = paths.find(path => href.startsWith(path))
    const name = calendarPath && href.slice(calendarPath.length)
    if (!name || !/^[^/]+\.ics$/.test(name) || name.includes('..') || /%2f|%5c/i.test(name)) {
      throw fail(403, 'Event not available', 'forbidden')
    }
    return { calendarPath, name }
  }

  async function load(event) {
    const paths = await calendarPaths()
    const { calendarPath, name } = assertEventHref(paths, event?.providerEventId)
    if (typeof event.etag !== 'string' || !event.etag) throw fail(400, 'Missing etag', 'invalid-event')
    const response = await request(event.providerEventId, { method: 'GET', headers: {} })
    if (response.status === 404) throw fail(404, 'Event not found', 'not-found')
    if (response.status !== 200) throw fail(502, `Radicale request failed: ${response.status}`)
    if (response.headers.get('etag') !== event.etag) throw conflict()
    const vcalendar = new ICAL.Component(ICAL.parse(await response.text()))
    registerZones(vcalendar)
    return { paths, calendarPath, name, vcalendar }
  }

  async function save(href, vcalendar, headers) {
    const response = await request(href, {
      method: 'PUT', headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...headers }, body: vcalendar.toString()
    })
    if (response.status === 412) throw conflict()
    if (response.status !== 201 && response.status !== 204) throw fail(502, `Radicale request failed: ${response.status}`)
    return { providerEventId: href, etag: response.headers.get('etag') }
  }

  async function updateEvent({ event, changes }) {
    if (!changes || typeof changes !== 'object') throw fail(400, 'Missing changes', 'invalid-field')
    const { vcalendar } = await load(event)
    const target = event.recurrenceId ? occurrenceEvent(vcalendar, event.recurrenceId) : singleEvent(vcalendar)
    applyChanges(target, vcalendar, changes)
    stamp(target.component, now())
    return save(event.providerEventId, vcalendar, { 'If-Match': event.etag })
  }

  async function remove(href, etag) {
    const response = await request(href, { method: 'DELETE', headers: { 'If-Match': etag } })
    if (response.status === 412) throw conflict()
    if (response.status === 404) throw fail(404, 'Event not found', 'not-found')
    if (response.status !== 200 && response.status !== 204) throw fail(502, `Radicale request failed: ${response.status}`)
    return { providerEventId: null, etag: null }
  }

  return {
    async createEvent({ calendarPath, ...fields }) {
      assertCalendar(await calendarPaths(), calendarPath)
      const vcalendar = new ICAL.Component(['vcalendar', [], []])
      vcalendar.updatePropertyWithValue('version', '2.0')
      vcalendar.updatePropertyWithValue('calscale', 'GREGORIAN')
      vcalendar.updatePropertyWithValue('prodid', '-//juanma.rocks//Calendario familiar//ES')
      const component = new ICAL.Component('vevent')
      vcalendar.addSubcomponent(component)
      const event = new ICAL.Event(component)
      const id = uid()
      event.uid = id
      component.updatePropertyWithValue('created', ICAL.Time.fromJSDate(now(), true))
      component.updatePropertyWithValue('transp', 'OPAQUE')
      if (fields.title === undefined) throw fail(400, 'title is required', 'invalid-field')
      if (fields.start === undefined || fields.end === undefined) throw fail(400, 'start and end are required', 'invalid-time')
      applyChanges(event, vcalendar, fields)
      stamp(component, now(), { bumpSequence: false })
      component.updatePropertyWithValue('sequence', 0)
      // If-None-Match: * turns a clashing UID into a 412 instead of an overwrite.
      return save(`${calendarPath}${id}.ics`, vcalendar, { 'If-None-Match': '*' })
    },

    updateEvent,

    updateEventTime: ({ event, start, end }) => updateEvent({ event, changes: { start, end } }),

    // A standalone event goes with its file. In a series, `scope` says whether
    // only this occurrence goes (an EXDATE, the file stays) or the whole file,
    // exceptions included; the web asks which, so there is no default.
    async deleteEvent({ event, scope }) {
      const { vcalendar } = await load(event)
      if (!event.recurrenceId) {
        singleEvent(vcalendar)
        return remove(event.providerEventId, event.etag)
      }
      if (scope === 'occurrence') {
        const master = excludeOccurrence(vcalendar, event.recurrenceId)
        stamp(master.component, now())
        return save(event.providerEventId, vcalendar, { 'If-Match': event.etag })
      }
      if (scope !== 'series') throw fail(400, 'Choose this occurrence or the whole series', 'invalid-field')
      // One file, one series: never take an unrelated event along with it.
      const uids = new Set(vcalendar.getAllSubcomponents('vevent').map(c => c.getFirstPropertyValue('uid')))
      if (uids.size !== 1) throw fail(400, 'File holds more than one event', 'invalid-event')
      return remove(event.providerEventId, event.etag)
    },

    // A whole file moves, so only a standalone event can: moving one
    // occurrence would take the rest of its series along.
    async moveEventToCalendar({ event, calendarPath }) {
      if (event?.recurrenceId) throw fail(400, 'Event is part of a series', 'series')
      const { paths, calendarPath: from, name, vcalendar } = await load(event)
      singleEvent(vcalendar)
      assertCalendar(paths, calendarPath)
      if (calendarPath === from) throw fail(400, 'Event is already in that calendar', 'invalid-field')
      const destination = `${calendarPath}${name}`
      const response = await request(event.providerEventId, {
        method: 'MOVE',
        headers: { Destination: new URL(destination, baseUrl).href, Overwrite: 'F', 'If-Match': event.etag }
      })
      if (response.status === 412) throw conflict()
      if (response.status !== 201 && response.status !== 204) throw fail(502, `Radicale request failed: ${response.status}`)
      return { providerEventId: destination, etag: response.headers.get('etag') }
    }
  }
}
