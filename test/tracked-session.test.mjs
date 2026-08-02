import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatRunningLabel,
  formatSessionRange,
  getSessionNotes,
  parseSessionNote
} from '../src/renderer/src/trackedSession.js'

// Local time, so the formatted clock strings match what the renderer would print.
const NOW = new Date(2026, 7, 1, 16, 42, 0).getTime()

function session({ start, end, running = false, notes } = {}) {
  return {
    source: 'timetracker',
    calendarId: 'timetracker:certification',
    calendarName: 'certification',
    title: 'certification',
    start: new Date(start ?? new Date(2026, 7, 1, 15, 30, 0)).toISOString(),
    end: new Date(end ?? start ?? new Date(2026, 7, 1, 15, 30, 0)).toISOString(),
    isRunning: running,
    notes
  }
}

test('a finished session reads day, range and total', () => {
  const event = session({
    start: new Date(2026, 7, 1, 15, 30, 0),
    end: new Date(2026, 7, 1, 17, 5, 0)
  })

  assert.equal(formatSessionRange(event, NOW), 'Saturday, 1 August · 15:30 – 17:05 · 1h 35m')
})

test('a running session ends at "now" and carries no total', () => {
  const event = session({ start: new Date(2026, 7, 1, 15, 30, 0), running: true })

  assert.equal(formatSessionRange(event, NOW), 'Saturday, 1 August · 15:30 – now')
  assert.equal(formatRunningLabel(event, NOW), 'Running · 1h 12m so far')
})

test('a running session counts to now, not to the end the source last wrote', () => {
  const event = session({
    start: new Date(2026, 7, 1, 15, 30, 0),
    end: new Date(2026, 7, 1, 15, 45, 0),
    running: true
  })

  assert.equal(formatRunningLabel(event, NOW), 'Running · 1h 12m so far')
})

test('todo-prefixed notes lose the prefix and are flagged', () => {
  assert.deepEqual(parseSessionNote({ ts: 'x', text: 'todo: book the exam' }), {
    ts: 'x',
    text: 'book the exam',
    isTodo: true
  })
  assert.deepEqual(parseSessionNote({ ts: 'x', text: '[] book the exam' }), {
    ts: 'x',
    text: 'book the exam',
    isTodo: true
  })
  assert.deepEqual(parseSessionNote({ ts: 'x', text: 'TODO:book the exam' }), {
    ts: 'x',
    text: 'book the exam',
    isTodo: true
  })
})

test('a prefix that is not at the start is left alone', () => {
  const note = parseSessionNote({ ts: 'x', text: 'added a todo: book the exam' })

  assert.equal(note.isTodo, false)
  assert.equal(note.text, 'added a todo: book the exam')
})

test('note text is passed through verbatim — markdown is not rendered', () => {
  const text = '**Chapter 7** — retention\n- see https://example.com/a_b?c=1 🎯'
  const note = parseSessionNote({ ts: 'x', text })

  assert.equal(note.text, text, 'newlines, markdown, URLs and emoji survive untouched')
})

test('a session without notes yields no rows', () => {
  assert.deepEqual(getSessionNotes(session({ notes: [] })), [])
  assert.deepEqual(getSessionNotes(session()), [], 'a missing notes array is not an error')
})

test('notes keep their order and timestamps', () => {
  const notes = getSessionNotes(
    session({
      notes: [
        { ts: '2026-08-01T15:41:00.000Z', text: 'Chapter 7 — retention policies' },
        { ts: '2026-08-01T16:18:00.000Z', text: 'Practice exam 2 — 41/50' }
      ]
    })
  )

  assert.deepEqual(notes.map((note) => note.ts), [
    '2026-08-01T15:41:00.000Z',
    '2026-08-01T16:18:00.000Z'
  ])
  assert.equal(notes[0].text, 'Chapter 7 — retention policies')
})
