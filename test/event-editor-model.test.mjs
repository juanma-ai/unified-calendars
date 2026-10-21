import test from 'node:test'
import assert from 'node:assert/strict'
import { eventToForm, formToFields, getEventChanges, newEventForm, saveEventForm, updateForm, validateForm } from '../src/renderer/src/eventEditorModel.js'
const tz = 'Europe/Madrid'
const timed = {
  title: 'Dentista', calendarId: 'radicale:familia', allDay: false, location: 'Centro', description: '',
  start: '2026-10-29T15:00:00.000Z', end: '2026-10-29T16:30:00.000Z', attendees: ['Laura']
}
test('a timed event opens in the calendar zone and saves back to the same instants', () => {
  const form = eventToForm(timed, tz)
  assert.deepEqual([form.startDate, form.startTime, form.endDate, form.endTime], ['2026-10-29', '16:00', '2026-10-29', '17:30'])
  assert.deepEqual(form.attendees, ['Laura'])
  const fields = formToFields(form, tz)
  assert.equal(Date.parse(fields.start), Date.parse(timed.start))
  assert.equal(Date.parse(fields.end), Date.parse(timed.end))
})
test('the form crosses daylight saving time correctly', () => {
  // 25 Oct 2026 is the last Sunday of October: Madrid goes from +02:00 to +01:00.
  const form = { ...eventToForm(timed, tz), multiDay: true, startDate: '2026-10-24', startTime: '10:00', endDate: '2026-10-25', endTime: '10:00' }
  const { start, end } = formToFields(form, tz)
  assert.equal(new Date(start).toISOString(), '2026-10-24T08:00:00.000Z')
  assert.equal(new Date(end).toISOString(), '2026-10-25T09:00:00.000Z')
})
test('all-day events show an inclusive last day and save an exclusive end', () => {
  const form = eventToForm({ ...timed, allDay: true, start: '2026-10-24', end: '2026-10-27' }, tz)
  assert.deepEqual([form.allDay, form.startDate, form.endDate], [true, '2026-10-24', '2026-10-26'])
  assert.deepEqual([formToFields(form, tz).start, formToFields(form, tz).end], ['2026-10-24', '2026-10-27'])
  const oneDay = { ...form, endDate: '2026-10-24' }
  assert.equal(formToFields(oneDay, tz).end, '2026-10-25')
})
test('only changed fields are sent, and times travel together', () => {
  const form = eventToForm(timed, tz)
  assert.deepEqual(getEventChanges(timed, form, tz), {})
  assert.deepEqual(getEventChanges(timed, { ...form, title: ' Dentista Laura ' }, tz), { title: 'Dentista Laura' })
  assert.deepEqual(getEventChanges(timed, { ...form, attendees: ['Laura', 'JuanMa'] }, tz), { attendees: ['JuanMa', 'Laura'] })
  assert.deepEqual(getEventChanges(timed, { ...form, attendees: ['Laura'] }, tz), {})
  const moved = getEventChanges(timed, { ...form, endTime: '18:00' }, tz)
  assert.deepEqual(Object.keys(moved), ['start', 'end'])
  assert.equal(new Date(moved.end).toISOString(), '2026-10-29T17:00:00.000Z')
  assert.deepEqual(getEventChanges(timed, { ...form, location: '' }, tz), { location: '' })
  const allDay = getEventChanges(timed, { ...form, allDay: true }, tz)
  assert.deepEqual([allDay.start, allDay.end], ['2026-10-29', '2026-10-30'])
})
test('a new event starts at the next hour today, or at nine on another day', () => {
  const now = new Date('2026-10-20T14:20:00Z') // 16:20 in Madrid
  const today = newEventForm({ anchorDate: new Date(2026, 9, 20), now, timeZone: tz, calendarId: 'radicale:familia' })
  assert.deepEqual([today.startDate, today.startTime, today.endDate, today.endTime], ['2026-10-20', '17:00', '2026-10-20', '18:00'])
  assert.deepEqual([today.attendees, today.calendarId, today.allDay], [[], 'radicale:familia', false])
  const other = newEventForm({ anchorDate: new Date(2026, 10, 3), now, timeZone: tz, calendarId: 'radicale:familia' })
  assert.deepEqual([other.startDate, other.startTime, other.endTime], ['2026-11-03', '09:00', '10:00'])
  const late = newEventForm({ anchorDate: new Date(2026, 9, 20), now: new Date('2026-10-20T21:30:00Z'), timeZone: tz }) // 23:30 in Madrid
  assert.deepEqual([late.startDate, late.startTime, late.endDate, late.endTime], ['2026-10-21', '00:00', '2026-10-21', '01:00'])
})
test('validation names the first problem', () => {
  const form = eventToForm(timed, tz)
  assert.equal(validateForm(form, tz), null)
  assert.match(validateForm({ ...form, title: '  ' }, tz), /título/)
  assert.match(validateForm({ ...form, endTime: '15:00' }, tz), /después/)
  assert.match(validateForm({ ...form, startDate: '' }, tz), /Elige la fecha/)
  assert.match(validateForm({ ...form, multiDay: true, endDate: '' }, tz), /fecha de fin/)
  assert.equal(validateForm({ ...form, endDate: '' }, tz), null)
  assert.match(validateForm({ ...form, startTime: '' }, tz), /horas/)
  assert.equal(validateForm({ ...form, allDay: true, startTime: '', endDate: form.startDate }, tz), null)
  assert.match(validateForm({ ...form, allDay: true, multiDay: true, endDate: '2026-10-28' }, tz), /después/)
})
test('saving creates, updates and moves in that order, with the etag from the update', async () => {
  const calls = []
  const api = {
    createEvent: async input => { calls.push(['create', input]) },
    updateEvent: async input => { calls.push(['update', input]); return { etag: '"2"' } },
    moveEventToCalendar: async input => { calls.push(['move', input]) }
  }
  const calendars = [{ calendarId: 'radicale:familia', providerCalendarId: '/juanma/casa/' }, { calendarId: 'radicale:juanma:personal', providerCalendarId: '/juanma/personal/' }]
  const event = { ...timed, source: 'radicale', providerEventId: '/juanma/casa/a.ics', etag: '"1"', recurrenceId: null }
  await saveEventForm({ api, event: null, form: { ...eventToForm(timed, tz), title: 'Nuevo' }, calendars, timeZone: tz })
  assert.equal(calls[0][1].calendarPath, '/juanma/casa/'); assert.equal(calls[0][1].title, 'Nuevo')
  calls.length = 0
  await saveEventForm({ api, event, form: { ...eventToForm(event, tz), title: 'Otro', calendarId: 'radicale:juanma:personal' }, calendars, timeZone: tz })
  assert.deepEqual(calls.map(c => c[0]), ['update', 'move'])
  assert.equal(calls[1][1].event.etag, '"2"'); assert.equal(calls[1][1].calendarPath, '/juanma/personal/')
  calls.length = 0
  await saveEventForm({ api, event, form: eventToForm(event, tz), calendars, timeZone: tz })
  assert.deepEqual(calls, [])
  await saveEventForm({ api, event, form: { ...eventToForm(event, tz), calendarId: 'radicale:juanma:personal' }, calendars, timeZone: tz })
  assert.deepEqual(calls.map(c => c[0]), ['move']); assert.equal(calls[0][1].event.etag, '"1"')
  calls.length = 0
  const occurrence = { ...event, recurrenceId: '20261029T090000Z' }
  await assert.rejects(saveEventForm({ api, event: occurrence, form: { ...eventToForm(occurrence, tz), title: 'Cambio', calendarId: 'radicale:juanma:personal' }, calendars, timeZone: tz }), /serie/)
  await assert.rejects(saveEventForm({ api, event: null, form: { ...eventToForm(timed, tz), calendarId: 'radicale:gone' }, calendars, timeZone: tz }), /Recarga/)
  assert.deepEqual(calls, [])
})
test('moving the start drags the end with it, keeping the duration', () => {
  const form = eventToForm(timed, tz) // 29 Oct 16:00-17:30
  const later = updateForm(form, 'startDate', '2026-11-03', tz)
  assert.deepEqual([later.startDate, later.startTime, later.endDate, later.endTime], ['2026-11-03', '16:00', '2026-11-03', '17:30'])
  const earlier = updateForm(form, 'startTime', '09:15', tz)
  assert.deepEqual([earlier.endDate, earlier.endTime], ['2026-10-29', '10:45'])
  const allDay = { ...form, allDay: true, startDate: '2026-10-24', endDate: '2026-10-26' }
  assert.deepEqual([updateForm(allDay, 'startDate', '2026-10-30', tz).endDate], ['2026-11-01'])
  // An end that was already missing comes back instead of staying empty.
  const noEnd = { ...form, allDay: true, endDate: '' }
  assert.equal(updateForm(noEnd, 'startDate', '2026-10-22', tz).endDate, '2026-10-22')
  // Other fields, and clearing the start, change only themselves.
  assert.equal(updateForm(form, 'endTime', '19:00', tz).startTime, '16:00')
  assert.deepEqual(updateForm(form, 'startDate', '', tz), { ...form, startDate: '' })
  assert.deepEqual(updateForm(form, 'title', 'x', tz), { ...form, title: 'x' })
})
test('a single date is the default; the range is opt-in and only preset for multi-day events', () => {
  const now = new Date('2026-10-20T08:00:00Z')
  assert.equal(newEventForm({ anchorDate: new Date(2026, 9, 20), now, timeZone: tz }).multiDay, false)
  assert.equal(eventToForm(timed, tz).multiDay, false)
  assert.equal(eventToForm({ ...timed, allDay: true, start: '2026-10-24', end: '2026-10-25' }, tz).multiDay, false)
  assert.equal(eventToForm({ ...timed, allDay: true, start: '2026-10-24', end: '2026-10-27' }, tz).multiDay, true)
  assert.equal(eventToForm({ ...timed, end: '2026-10-30T09:00:00.000Z' }, tz).multiDay, true)
  // With one date, a stale end date is ignored: the event ends on its start day.
  const single = { ...eventToForm(timed, tz), endDate: '2026-11-15' }
  const { start, end } = formToFields(single, tz)
  assert.equal(new Date(start).toISOString(), '2026-10-29T15:00:00.000Z')
  assert.equal(new Date(end).toISOString(), '2026-10-29T16:30:00.000Z')
  const day = { ...single, allDay: true }
  assert.deepEqual([formToFields(day, tz).start, formToFields(day, tz).end], ['2026-10-29', '2026-10-30'])
  // Overnight without the range is an error that says how to fix it.
  assert.match(validateForm({ ...eventToForm(timed, tz), startTime: '22:00', endTime: '01:00' }, tz), /Varios días/)
  assert.equal(validateForm({ ...eventToForm(timed, tz), multiDay: true, startTime: '22:00', endDate: '2026-10-30', endTime: '01:00' }, tz), null)
  // Switching the range off brings the end date back to the start date.
  const ranged = eventToForm({ ...timed, allDay: true, start: '2026-10-24', end: '2026-10-27' }, tz)
  assert.equal(updateForm(ranged, 'multiDay', false, tz).endDate, '2026-10-24')
  // Unchanged multi-day events still round-trip with no changes.
  const multi = { ...timed, allDay: true, start: '2026-10-24', end: '2026-10-27' }
  assert.deepEqual(getEventChanges(multi, eventToForm(multi, tz), tz), {})
})

test('private only exists in a personal calendar and is dropped before a move to Familia', async () => {
  const personal = { ...timed, calendarId: 'radicale:juanma:personal', source: 'radicale', providerEventId: '/juanma/personal/a.ics', etag: '"1"', recurrenceId: null }
  const form = eventToForm(personal, tz)
  assert.equal(form.private, false)
  assert.deepEqual(getEventChanges(personal, { ...form, private: true }, tz), { private: true })
  assert.equal(formToFields({ ...form, private: true, calendarId: 'radicale:familia' }, tz).private, false)
  // Switching the form to Familia clears the toggle.
  assert.equal(updateForm({ ...form, private: true }, 'calendarId', 'radicale:familia', tz).private, false)

  const secret = { ...personal, private: true }
  const calls = []
  const api = {
    updateEvent: async input => { calls.push(['update', input]); return { etag: '"2"' } },
    moveEventToCalendar: async input => { calls.push(['move', input]) }
  }
  const calendars = [{ calendarId: 'radicale:familia', providerCalendarId: '/juanma/casa/' }, { calendarId: 'radicale:juanma:personal', providerCalendarId: '/juanma/personal/' }]
  await saveEventForm({ api, event: secret, form: updateForm(eventToForm(secret, tz), 'calendarId', 'radicale:familia', tz), calendars, timeZone: tz })
  assert.deepEqual(calls.map(c => c[0]), ['update', 'move'])
  assert.deepEqual(calls[0][1].changes, { private: false })
  assert.equal(calls[1][1].event.etag, '"2"')
})
