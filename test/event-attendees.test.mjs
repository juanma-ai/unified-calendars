import test from 'node:test'
import assert from 'node:assert/strict'
import { getAttendeeInitials, getAttendeeLabel, getEventAttendees } from '../src/renderer/src/eventAttendees.js'
test('attendees follow the editor order whatever order the .ics had', () => {
  const event = { attendees: ['Laura', 'JuanMa'] }
  assert.deepEqual(getEventAttendees(event), ['JuanMa', 'Laura'])
  assert.deepEqual(getAttendeeInitials(event), ['J', 'L'])
  assert.equal(getAttendeeLabel(event), 'JuanMa, Laura')
})
test('unknown, empty and duplicated names are dropped', () => {
  const event = { attendees: ['Agatha', '', 'Laura', 'Laura'] }
  assert.deepEqual(getAttendeeInitials(event), ['L'])
  assert.equal(getAttendeeLabel(event), 'Laura')
})
test('events without attendees render nothing', () => {
  for (const event of [{}, { attendees: [] }, { attendees: 'JuanMa' }, null]) {
    assert.deepEqual(getAttendeeInitials(event), [])
    assert.equal(getAttendeeLabel(event), null)
  }
})
