// This module stays free of Electron and source imports so the dispatch rules can
// be unit-tested in plain Node; ipc.js supplies the real completer.

import { EventMutationError } from './eventMutations.js'

export function createReminderCompleter(complete, invalidate) {
  return async function setReminderCompleted({ event, completed }) {
    if (!event?.source) throw new EventMutationError('Missing event source', 'invalid-event')
    if (event.source !== 'reminders') {
      throw new EventMutationError(`Completing ${event.source} events is not supported`, 'not-editable')
    }
    if (!event.providerEventId) {
      throw new EventMutationError('Event cannot be edited: missing provider id', 'not-editable')
    }

    const updated = await complete(event, Boolean(completed))
    invalidate('reminders')
    return updated
  }
}
