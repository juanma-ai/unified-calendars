// The tracker has no notion of a project colour, so the calendar assigns one. A hash
// keeps it stable across refreshes and — more importantly — identical between the events
// path and the calendars path, which `buildCalendars` reads separately: if the two ever
// disagreed, a project's sidebar swatch would not match its blocks in the grid.
const PROJECT_PALETTE = [
  '#00875a',
  '#0b6bcb',
  '#7c3aed',
  '#c2410c',
  '#0f766e',
  '#b91c1c',
  '#a16207',
  '#be185d'
]

export function parseProjectsFile(text = '') {
  const projects = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

  return [...new Set(projects)]
}

export function projectColor(name = '') {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return PROJECT_PALETTE[hash % PROJECT_PALETTE.length]
}
