// This module stays free of Electron and source imports so the dispatch rules can
// be unit-tested in plain Node; ipc.js supplies the real updaters.

// Trello cards and reminders are points in time, not intervals: they can be
// moved but never resized.
const MOVE_ONLY_SOURCES = new Set(['trello', 'reminders'])

export class EventMutationError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'EventMutationError'
    this.code = code
  }
}

function parseInstant(value, field) {
  if (typeof value !== 'string') throw new EventMutationError(`${field} must be an ISO string`, 'invalid-time')
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) throw new EventMutationError(`${field} is not a valid date`, 'invalid-time')
  return time
}

function assertDurationPreserved(event, startTime, endTime) {
  const originalStart = new Date(event.start).getTime()
  const originalEnd = new Date(event.end ?? event.start).getTime()
  if (endTime - startTime !== originalEnd - originalStart) {
    throw new EventMutationError(
      `${event.source} events cannot be resized, only moved`,
      'resize-unsupported'
    )
  }
}

export function createEventTimeUpdater(updaters, invalidate) {
  return async function updateEventTime({ event, start, end }) {
    if (!event?.source) throw new EventMutationError('Missing event source', 'invalid-event')
    if (!event.providerEventId) {
      throw new EventMutationError('Event cannot be edited: missing provider id', 'not-editable')
    }

    const updater = updaters[event.source]
    if (!updater) {
      throw new EventMutationError(`Editing ${event.source} events is not supported`, 'not-editable')
    }

    const startTime = parseInstant(start, 'start')
    const endTime = parseInstant(end ?? start, 'end')
    if (endTime < startTime) throw new EventMutationError('End is before start', 'invalid-range')
    if (MOVE_ONLY_SOURCES.has(event.source)) assertDurationPreserved(event, startTime, endTime)

    const updated = await updater(event, { start, end: end ?? start })
    invalidate(event.source)
    return updated
  }
}
