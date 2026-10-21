const invalid = message => Object.assign(new Error(message), { status: 400 })

// Copies only the fields a write may use out of what the browser sent, so an
// event object can never smuggle anything else through to Radicale.
function eventRef(event) {
  if (!event || typeof event !== 'object') throw invalid('Missing event')
  if (event.source !== 'radicale') throw Object.assign(new Error('Only family calendar events can be edited'), { status: 403 })
  const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
  if (!text(event.providerEventId, 300) || !text(event.etag, 200)) throw invalid('Invalid event')
  if (event.recurrenceId != null && !text(event.recurrenceId, 40)) throw invalid('Invalid event')
  return { providerEventId: event.providerEventId, etag: event.etag, recurrenceId: event.recurrenceId || null }
}

const FIELD_LIMITS = { title: 200, location: 500, description: 8000, start: 40, end: 40 }
function eventFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw invalid('Invalid changes')
  const clean = {}
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'attendees') {
      if (!Array.isArray(value) || value.length > 2 || value.some(name => typeof name !== 'string')) throw invalid('Invalid attendees')
      clean.attendees = value
    } else if (Object.hasOwn(FIELD_LIMITS, key)) {
      if (typeof value !== 'string' || value.length > FIELD_LIMITS[key]) throw invalid(`Invalid ${key}`)
      clean[key] = value
    } else throw invalid(`Unknown field ${key}`)
  }
  return clean
}

const calendarPath = value => {
  if (typeof value !== 'string' || !value || value.length > 300) throw invalid('Invalid calendar')
  return value
}

const single = args => {
  if (args.length !== 1 || !args[0] || typeof args[0] !== 'object') throw invalid('Invalid arguments')
  return args[0]
}

export function createCalendarApi(aggregatorFor, writerFor = () => { throw Object.assign(new Error('Calendar is read-only'), { status: 403 }) }) {
  const range = args => {
    if (args.length !== 2 || args.some(value => typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) {
      throw Object.assign(new Error('Invalid date range'), { status: 400 })
    }
    const [start, end] = args.map(Date.parse)
    if (end <= start || end - start > 400 * 86400000) throw Object.assign(new Error('Invalid date range'), { status: 400 })
  }
  // Writes validate first, then drop the member's cached Radicale events so the
  // next read shows the change (and the new etag) instead of a minute-old copy.
  const write = run => async (user, ...args) => {
    const call = run(single(args))
    const result = await call(writerFor(user))
    aggregatorFor(user).invalidateSourceCache('radicale')
    return result
  }
  const reads = {
    getUnifiedEvents: (user, ...args) => { range(args); return aggregatorFor(user).getUnifiedEvents(...args) },
    refreshNow: (user, ...args) => { range(args); return aggregatorFor(user).getUnifiedEvents(...args, { force: true }) },
    getCachedEvents: user => aggregatorFor(user).getStartupCache(),
    getSourceStatus: user => aggregatorFor(user).getSourceStatus(),
    getAvailableCalendars: user => aggregatorFor(user).getAvailableCalendars()
  }
  const writes = {
    createEvent: write(({ calendarPath: path, ...fields }) => {
      const input = { calendarPath: calendarPath(path), ...eventFields(fields) }
      return writer => writer.createEvent(input)
    }),
    updateEvent: write(({ event, changes }) => {
      const input = { event: eventRef(event), changes: eventFields(changes) }
      return writer => writer.updateEvent(input)
    }),
    // Same shape as Electron's updateEventTime, so the web bridge can pass the
    // drag result straight through.
    updateEventTime: write(({ event, start, end }) => {
      const { start: s, end: e } = eventFields({ start, end })
      const input = { event: eventRef(event), start: s, end: e }
      return writer => writer.updateEventTime(input)
    }),
    moveEventToCalendar: write(({ event, calendarPath: path }) => {
      const input = { event: eventRef(event), calendarPath: calendarPath(path) }
      return writer => writer.moveEventToCalendar(input)
    }),
    // The writer decides whether a scope is needed (a series needs one); here
    // it only has to be one of the two the web offers.
    deleteEvent: write(({ event, scope }) => {
      if (scope !== undefined && scope !== 'occurrence' && scope !== 'series') throw invalid('Invalid scope')
      const input = { event: eventRef(event), scope }
      return writer => writer.deleteEvent(input)
    })
  }
  const methods = { ...reads, ...writes }
  return async (method, args, context) => {
    // Every call acts for a signed-in family member; without one there is no
    // Radicale account to read or write with.
    if (typeof context?.user !== 'string' || !context.user) throw Object.assign(new Error('Sign in required'), { status: 401 })
    if (!Object.hasOwn(methods, method)) throw Object.assign(new Error('Method not available'), { status: 403 })
    if (!Array.isArray(args) || args.length > 2) throw Object.assign(new Error('Invalid arguments'), { status: 400 })
    return methods[method](context.user, ...args)
  }
}
