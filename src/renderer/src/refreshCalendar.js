export async function refreshCalendar(api, rangeStart, rangeEnd, { force = false } = {}) {
  const events = force
    ? await api.refreshNow(rangeStart, rangeEnd)
    : await api.getUnifiedEvents(rangeStart, rangeEnd)
  const statuses = await api.getSourceStatus()

  return { events, statuses }
}
