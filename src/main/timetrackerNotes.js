import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const NOTES_DIR = 'notes'

/**
 * The markdown mirror of every note, ported verbatim from the SwiftBar tracker this app
 * replaces. The output has to stay byte-identical to what the plugin produced, because it
 * appends to files the plugin already wrote — a different heading or bullet shape would
 * leave a visible seam mid-file.
 */
export function noteFileName(project) {
  return `${project.replace(/[^\p{L}\p{N}._-]+/gu, '-')}.md`
}

const pad = (value) => String(value).padStart(2, '0')

export function formatNoteTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatNoteDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * What to append for one note. `existing` is the file's current contents, or null when the
 * file does not exist yet.
 */
export function buildNoteAppend(existing, project, ts, text) {
  const date = new Date(ts * 1000)
  // Continuation lines are indented two spaces so a multiline note stays inside its list
  // item instead of breaking out into a new block.
  const bullet = `- **${formatNoteTime(date)}** ${text.replace(/\n/g, '\n  ')}\n`

  let out = ''
  if (existing === null) out += `# ${project}\n`

  const header = `## ${formatNoteDate(date)}`
  if (existing === null || !existing.includes(header)) out += `\n${header}\n\n`

  return out + bullet
}

/**
 * Where a note belongs in a file that is no longer written in chronological order. Notes
 * used to arrive only from a running timer, so appending was always right; a note added to
 * a session that finished last week is stamped with that session's time, and appending it
 * would file a 14:53 bullet under today's date heading.
 *
 * Returns `{ append }` — the chunk to append, byte-identical to what the SwiftBar plugin
 * produced — or `{ contents }`, the whole file with the bullet slotted into its own day.
 */
export function placeNote(existing, project, ts, text) {
  const append = buildNoteAppend(existing, project, ts, text)
  const header = `## ${formatNoteDate(new Date(ts * 1000))}`
  if (existing === null || !existing.includes(header)) return { append }

  const lines = existing.split('\n')
  const start = lines.findIndex((line) => line.trim() === header)
  if (start === -1) return { append }

  const after = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  // The day is already the last section in the file, so appending puts the bullet in the
  // right place anyway — and leaves the file untouched apart from the addition.
  if (after === -1) return { append }

  // Back up over the blank lines that separate this section from the next one, so the
  // bullet joins its own day rather than opening the following one.
  let end = after
  while (end > start + 1 && lines[end - 1].trim() === '') end -= 1

  // Within the day the file reads as a chronological log, so slot the bullet in front of
  // the first note that is later than it rather than dropping it at the bottom.
  const minutes = formatNoteTime(new Date(ts * 1000))
  let at = end
  for (let index = start + 1; index < end; index += 1) {
    const stamp = lines[index].match(/^- (?:\[[ x]\] )?\*\*(\d{2}:\d{2})\*\*/)
    if (stamp && stamp[1] > minutes) {
      at = index
      break
    }
  }

  const bullet = append.replace(/\n$/, '')
  return { contents: [...lines.slice(0, at), bullet, ...lines.slice(at)].join('\n') }
}

export function createNoteMirror({ notesDir }) {
  return async function appendNote(project, ts, text) {
    await mkdir(notesDir, { recursive: true })
    const file = join(notesDir, noteFileName(project))

    let existing = null
    try {
      existing = await readFile(file, 'utf8')
    } catch {
      // Missing file is the "start a new project log" case, not an error.
    }

    const placement = placeNote(existing, project, ts, text)
    if (placement.append !== undefined) await appendFile(file, placement.append)
    else await writeFile(file, placement.contents)

    return file
  }
}
