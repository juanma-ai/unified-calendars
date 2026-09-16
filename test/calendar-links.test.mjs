import test from 'node:test'
import assert from 'node:assert/strict'

import { getCalendarLink } from '../src/renderer/src/calendarLinks.js'

test('builds a Google Calendar link from the provider calendar id and account email', () => {
  const link = getCalendarLink({
    source: 'google',
    providerCalendarId: 'team@group.calendar.google.com',
    accountEmail: 'juanma@example.com'
  })

  assert.deepEqual(link, {
    label: 'Open in Google Calendar',
    url: 'https://calendar.google.com/calendar/r?cid=team%40group.calendar.google.com&authuser=juanma%40example.com'
  })
})

test('omits authuser when the Google account email is unknown (legacy accounts)', () => {
  const link = getCalendarLink({
    source: 'google',
    providerCalendarId: 'primary@example.com'
  })

  assert.equal(link.url, 'https://calendar.google.com/calendar/r?cid=primary%40example.com')
})

test('returns null for a Google calendar without a provider id (event-only fallback rows)', () => {
  assert.equal(getCalendarLink({ source: 'google' }), null)
})

test('returns the Trello board url as-is', () => {
  const link = getCalendarLink({
    source: 'trello',
    providerCalendarId: 'abc123',
    url: 'https://trello.com/b/abc123/roadmap'
  })

  assert.deepEqual(link, {
    label: 'Open board in Trello',
    url: 'https://trello.com/b/abc123/roadmap'
  })
})

test('returns null for a Trello board without a url', () => {
  assert.equal(getCalendarLink({ source: 'trello', providerCalendarId: 'abc123' }), null)
})

test('returns null for sources with no web destination', () => {
  assert.equal(getCalendarLink({ source: 'reminders', providerCalendarId: 'Recordatorios' }), null)
  assert.equal(getCalendarLink({ source: 'timetracker', providerCalendarId: 'calendar-app' }), null)
  assert.equal(getCalendarLink(undefined), null)
})

test('Radicale never links to a DAV resource even if a URL is present', () => {
  assert.equal(getCalendarLink({ source: 'radicale', url: 'https://calendar.test/familia/casa/a.ics' }), null)
})
