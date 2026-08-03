import { appendFile, mkdir, readFile } from 'node:fs/promises'
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

    await appendFile(file, buildNoteAppend(existing, project, ts, text))
    return file
  }
}
