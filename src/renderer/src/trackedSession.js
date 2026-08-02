/**
 * Presentation-level strings for a single tracked session, kept out of the popover
 * component so they can be tested without a DOM. All duration and running-state maths comes
 * from `trackedTime.js` — this module only decides how a session reads.
 */

import { format } from 'date-fns'

import { durationMs, effectiveEnd, formatDuration, isRunning } from './trackedTime.js'

/**
 * `Saturday, 1 August · 15:30 – now` while the session is open,
 * `Saturday, 1 August · 15:30 – 17:05 · 1h 35m` once it has closed.
 */
export function formatSessionRange(event, now = Date.now()) {
  const start = new Date(event.start)
  const day = format(start, 'EEEE, d MMMM')
  const startTime = format(start, 'HH:mm')

  if (isRunning(event)) return `${day} · ${startTime} – now`

  const endTime = format(new Date(effectiveEnd(event, now)), 'HH:mm')
  return `${day} · ${startTime} – ${endTime} · ${formatDuration(durationMs(event, now))}`
}

/** `Running · 1h 12m so far`. Only meaningful while `isRunning(event)`. */
export function formatRunningLabel(event, now = Date.now()) {
  return `Running · ${formatDuration(durationMs(event, now))} so far`
}

// The tracker strips a leading `todo:` or `[]` when it mirrors a note into its markdown
// to-do list, so the prefix is a marker rather than part of the text. Anything else —
// markdown, URLs, emoji, newlines — is left exactly as the tracker stored it.
const TODO_PREFIX = /^\s*(?:todo:|\[\s*\])\s*/i

export function parseSessionNote(note) {
  const text = note.text ?? ''
  const isTodo = TODO_PREFIX.test(text)

  return {
    ts: note.ts,
    text: isTodo ? text.replace(TODO_PREFIX, '') : text,
    isTodo
  }
}

export function getSessionNotes(event) {
  if (!Array.isArray(event?.notes)) return []
  return event.notes.map(parseSessionNote)
}
