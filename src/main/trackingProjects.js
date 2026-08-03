import { readFile as fsReadFile, rename as fsRename, writeFile as fsWriteFile } from 'node:fs/promises'
import { join } from 'node:path'
import { noteFileName, NOTES_DIR } from './timetrackerNotes.js'
import { DB_FILE, resolveDataDir } from './sources/timetracker.js'
import {
  addProjectToList,
  parseProjectsFile,
  removeProjectFromList,
  renameProjectInList,
  serializeProjectsFile,
  validateProjectName
} from './sources/timetrackerProjects.js'
import { createSqliteWriteRunner, quote } from './sources/timetrackerWriter.js'

const PROJECTS_FILE = 'projects.txt'

/**
 * A project name is the join key in four places at once: the projects.txt list, the
 * `project` column of every past entry, the notes markdown filename, and the
 * `timetracker:<project>` calendar id the sidebar files colour and visibility under.
 * Renaming only the list orphans the other three, so a rename has to move all of them.
 */
export function createProjectAdmin({
  resolveDir = resolveDataDir,
  readFile = fsReadFile,
  writeFile = fsWriteFile,
  renameFile = fsRename,
  createRunner = createSqliteWriteRunner,
  renamePreferences = () => {},
  invalidateCache = () => {}
} = {}) {
  const paths = () => {
    const dataDir = resolveDir()
    return {
      dataDir,
      projectsFile: join(dataDir, PROJECTS_FILE),
      notesDir: join(dataDir, NOTES_DIR),
      dbPath: join(dataDir, DB_FILE)
    }
  }

  async function readList(projectsFile) {
    try {
      return parseProjectsFile(await readFile(projectsFile, 'utf8'))
    } catch {
      // No file yet is an empty list, not an error: the first add creates it.
      return []
    }
  }

  async function writeList(projectsFile, projects) {
    await writeFile(projectsFile, serializeProjectsFile(projects))
    invalidateCache('timetracker')
    return projects
  }

  return {
    async list() {
      return readList(paths().projectsFile)
    },

    async add(name) {
      const { projectsFile } = paths()
      const projects = await readList(projectsFile)
      return writeList(projectsFile, addProjectToList(projects, name))
    },

    /**
     * Removing only drops the name from the list. Past entries keep it, and the source
     * still lists projects that appear in the data, so history stays visible and coloured
     * — it just stops being offered as something to start.
     */
    async remove(name) {
      const { projectsFile } = paths()
      const projects = await readList(projectsFile)
      return writeList(projectsFile, removeProjectFromList(projects, name))
    },

    async rename(from, to) {
      const current = validateProjectName(from)
      const next = validateProjectName(to)
      const { projectsFile, notesDir, dbPath } = paths()

      const projects = await readList(projectsFile)
      // Validate before touching anything: there is no transaction across a text file, a
      // database and the preference store, so the only real protection is refusing early.
      const renamed = renameProjectInList(projects, current, next)

      if (current !== next) {
        await createRunner(dbPath)(
          `UPDATE entries SET project = ${quote(next)} WHERE project = ${quote(current)};`
        )

        const notesPath = join(notesDir, noteFileName(next))
        try {
          await renameFile(join(notesDir, noteFileName(current)), notesPath)
          // The file opens with `# <project>`, so renaming only the file would leave it
          // contradicting its own name.
          const contents = await readFile(notesPath, 'utf8')
          if (contents.startsWith(`# ${current}\n`)) {
            await writeFile(notesPath, `# ${next}\n${contents.slice(`# ${current}\n`.length)}`)
          }
        } catch (error) {
          // No notes file is the common case; anything else is worth surfacing rather
          // than leaving the caller thinking the notes moved.
          if (error?.code !== 'ENOENT') throw error
        }

        renamePreferences(`timetracker:${current}`, `timetracker:${next}`)
      }

      return writeList(projectsFile, renamed)
    }
  }
}
