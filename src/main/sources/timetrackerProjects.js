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

export function serializeProjectsFile(projects) {
  return projects.length ? `${projects.join('\n')}\n` : ''
}

/**
 * A project name has to survive a round trip through projects.txt and become part of a
 * calendar id, so the rules are about what the format can carry, not taste:
 * `#` opens a comment and a newline is the record separator, so either would silently
 * delete the project on the next read.
 */
export function validateProjectName(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) throw new Error('A project name is required')
  if (name.startsWith('#')) throw new Error('A project name cannot start with "#" — that line would be read back as a comment')
  if (/[\r\n]/.test(name)) throw new Error('A project name cannot contain a line break')
  return name
}

// Case-insensitive, because `Admin` and `admin` would be two sidebar rows and two colours
// for what a person means as one project.
const sameName = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase()

export function addProjectToList(projects, value) {
  const name = validateProjectName(value)
  if (projects.some((project) => sameName(project, name))) {
    throw new Error(`${name} is already a project`)
  }
  return [...projects, name]
}

export function removeProjectFromList(projects, value) {
  const name = validateProjectName(value)
  return projects.filter((project) => !sameName(project, name))
}

export function renameProjectInList(projects, from, to) {
  const current = validateProjectName(from)
  const next = validateProjectName(to)

  if (!projects.some((project) => sameName(project, current))) {
    throw new Error(`${current} is not a project`)
  }
  // Changing only the casing of a name is a legitimate rename, so it must not trip the
  // duplicate check against itself.
  if (!sameName(current, next) && projects.some((project) => sameName(project, next))) {
    throw new Error(`${next} is already a project`)
  }

  return projects.map((project) => (sameName(project, current) ? next : project))
}
