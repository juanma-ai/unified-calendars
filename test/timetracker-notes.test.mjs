import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNoteAppend, noteFileName, placeNote } from '../src/main/timetrackerNotes.js'

// Local midnight-anchored timestamps, because the mirror's headings are local dates.
const seconds = (y, m, d, hh, mm) => Math.floor(new Date(y, m - 1, d, hh, mm).getTime() / 1000)

test('a new file opens with the project heading and one date heading', () => {
  const out = buildNoteAppend(null, 'certification', seconds(2026, 7, 28, 14, 57), 'first note')

  assert.equal(
    out,
    '# certification\n\n## 2026-07-28\n\n- **14:57** first note\n'
  )
})

test('a second note the same day repeats neither heading', () => {
  const existing = '# certification\n\n## 2026-07-28\n\n- **14:57** first note\n'
  const out = buildNoteAppend(existing, 'certification', seconds(2026, 7, 28, 15, 6), 'second')

  assert.equal(out, '- **15:06** second\n')
})

test('the next day adds a date heading but not the project heading', () => {
  const existing = '# certification\n\n## 2026-07-28\n\n- **14:57** first note\n'
  const out = buildNoteAppend(existing, 'certification', seconds(2026, 7, 29, 9, 5), 'next day')

  assert.equal(out, '\n## 2026-07-29\n\n- **09:05** next day\n')
})

test('hours and minutes are zero-padded so the bullets align', () => {
  const out = buildNoteAppend('## 2026-07-28', 'p', seconds(2026, 7, 28, 9, 5), 'x')
  assert.equal(out, '- **09:05** x\n')
})

test('continuation lines are indented so a multiline note stays in its list item', () => {
  const text = '✅ https://developer.wordpress.org/rest-api/\n✅ until #namespaces'
  const out = buildNoteAppend('## 2026-07-28', 'certification', seconds(2026, 7, 28, 15, 6), text)

  assert.equal(
    out,
    '- **15:06** ✅ https://developer.wordpress.org/rest-api/\n  ✅ until #namespaces\n'
  )
})

test('output matches byte-for-byte what the SwiftBar plugin wrote', () => {
  // Taken from the real ~/.timetracker/notes/certification.md the plugin produced, so
  // appending to an existing file leaves no seam.
  const existing = null
  const day = seconds(2026, 7, 28, 14, 57)
  const first = buildNoteAppend(existing, 'certification', day, 'https://developer.wordpress.org/rest-api/extending-the-rest-api/routes-and-endpoints/')
  const second = buildNoteAppend(first, 'certification', seconds(2026, 7, 28, 15, 8), 'just testing')

  assert.equal(
    first + second,
    '# certification\n' +
      '\n## 2026-07-28\n\n' +
      '- **14:57** https://developer.wordpress.org/rest-api/extending-the-rest-api/routes-and-endpoints/\n' +
      '- **15:08** just testing\n'
  )
})

// The file is only ever appended to while notes arrive from a running timer. A note added
// from the calendar to a session that finished days ago is stamped with that session's
// time, so it has to be placed rather than appended.
const TWO_DAYS =
  '# certification\n' +
  '\n## 2026-07-28\n\n' +
  '- **14:57** routes and endpoints\n' +
  '- [ ] **16:19** check sanitize_text_field\n' +
  '\n## 2026-08-03\n\n' +
  '- **09:11** back at it\n'

test('a note for the newest day is still a plain append', () => {
  // Nothing changes for the tray path: same chunk, same bytes, file untouched above it.
  const placement = placeNote(TWO_DAYS, 'certification', seconds(2026, 8, 3, 9, 40), 'later')

  assert.deepEqual(placement, { append: '- **09:40** later\n' })
})

test('a note for an earlier day is slotted into that day, not appended under today', () => {
  const placement = placeNote(TWO_DAYS, 'certification', seconds(2026, 7, 28, 15, 30), 'backfilled')

  assert.equal(placement.append, undefined, 'appending would file it under 2026-08-03')
  assert.equal(
    placement.contents,
    '# certification\n' +
      '\n## 2026-07-28\n\n' +
      '- **14:57** routes and endpoints\n' +
      '- **15:30** backfilled\n' +
      '- [ ] **16:19** check sanitize_text_field\n' +
      '\n## 2026-08-03\n\n' +
      '- **09:11** back at it\n'
  )
})

test('a backfilled note sorts by time inside its day, ahead of a todo bullet', () => {
  const placement = placeNote(TWO_DAYS, 'certification', seconds(2026, 7, 28, 9, 0), 'earliest')
  const lines = placement.contents.split('\n')

  assert.deepEqual(lines.slice(4, 7), [
    '- **09:00** earliest',
    '- **14:57** routes and endpoints',
    '- [ ] **16:19** check sanitize_text_field'
  ])
})

test('a note for a day the file has never seen falls back to appending a heading', () => {
  const placement = placeNote(TWO_DAYS, 'certification', seconds(2026, 8, 4, 8, 0), 'new day')

  assert.deepEqual(placement, { append: '\n## 2026-08-04\n\n- **08:00** new day\n' })
})

test('the file name slug keeps letters, digits, dot, underscore and dash', () => {
  assert.equal(noteFileName('certification'), 'certification.md')
  assert.equal(noteFileName('unified calendars'), 'unified-calendars.md')
  assert.equal(noteFileName('a/b:c'), 'a-b-c.md')
  assert.equal(noteFileName('my_project.v2-final'), 'my_project.v2-final.md')
  // Non-ASCII letters are letters: \p{L} keeps them rather than mangling the name.
  assert.equal(noteFileName('català'), 'català.md')
})

test('a slug can never escape the notes directory', () => {
  // Dots survive the slug (they are legitimate in a project name like `v2.1`), so the
  // guarantee is not "no dots" but "no path separator" — the result always resolves
  // inside the notes directory.
  assert.equal(noteFileName('../../etc/passwd'), '..-..-etc-passwd.md')

  for (const hostile of ['../../etc/passwd', 'a/b', 'a\\b', '/absolute', '..']) {
    const name = noteFileName(hostile)
    assert.ok(!name.includes('/'), `${hostile} produced a slash`)
    assert.ok(!name.includes('\\'), `${hostile} produced a backslash`)
  }
})
