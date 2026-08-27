/**
 * Web destination for a sidebar calendar, or null when the source has none
 * (Reminders, Time Tracker) or the entry lacks the data to build one — the
 * caller renders no menu item at all in that case, never a disabled one.
 */
export function getCalendarLink(calendar) {
  if (calendar?.source === 'google' && calendar.providerCalendarId) {
    const cid = encodeURIComponent(calendar.providerCalendarId)
    const authuser = calendar.accountEmail
      ? `&authuser=${encodeURIComponent(calendar.accountEmail)}`
      : ''
    return {
      label: 'Open in Google Calendar',
      url: `https://calendar.google.com/calendar/r?cid=${cid}${authuser}`
    }
  }

  if (calendar?.source === 'trello' && calendar.url) {
    return { label: 'Open board in Trello', url: calendar.url }
  }

  if (calendar?.source === 'linear' && calendar.url) {
    return { label: 'Open in Linear', url: calendar.url }
  }

  if (calendar?.source === 'wallos' && calendar.url) {
    return { label: 'Open in Wallos', url: calendar.url }
  }

  if (calendar?.source === 'vikunja' && calendar.url) {
    return { label: 'Open project in Vikunja', url: calendar.url }
  }

  return null
}
