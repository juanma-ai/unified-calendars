import assert from 'node:assert/strict'
import test from 'node:test'

import { createProjectAdmin } from '../src/main/trackingProjects.js'
import {
  addProjectToList,
  parseProjectsFile,
  removeProjectFromList,
  renameProjectInList,
  serializeProjectsFile,
  validateProjectName
} from '../src/main/sources/timetrackerProjects.js'

function createAdmin({ projects = ['certification', 'admin'], notesExist = true } = {}) {
  const files = { 'projects.txt': serializeProjectsFile(projects) }
  const queries = []
  const renames = []
  const prefRenames = []
  const invalidated = []

  const admin = createProjectAdmin({
    resolveDir: () => '/data',
    readFile: async (path) => {
      const key = path.split('/').pop()
      if (!(key in files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return files[key]
    },
    writeFile: async (path, contents) => {
      files[path.split('/').pop()] = contents
    },
    renameFile: async (from, to) => {
      if (!notesExist) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      renames.push([from, to])
    },
    createRunner: () => async (sql) => {
      queries.push(sql)
      return []
    },
    renamePreferences: (oldId, newId) => prefRenames.push([oldId, newId]),
    invalidateCache: (source) => invalidated.push(source)
  })

  return { admin, files, queries, renames, prefRenames, invalidated }
}

test('a name that would be read back as a comment is refused', () => {
  // `#` opens a comment in projects.txt, so this project would vanish on the next read.
  assert.throws(() => validateProjectName('#admin'), /read back as a comment/)
  assert.throws(() => validateProjectName('a\nb'), /line break/)
  assert.throws(() => validateProjectName('   '), /required/)
  assert.equal(validateProjectName('  admin  '), 'admin')
})

test('a written list parses back to exactly what went in', () => {
  const projects = ['certification', 'unified calendars', 'admin']
  assert.deepEqual(parseProjectsFile(serializeProjectsFile(projects)), projects)
  assert.equal(serializeProjectsFile([]), '')
})

test('duplicates are caught regardless of casing', () => {
  assert.throws(() => addProjectToList(['admin'], 'Admin'), /already a project/)
  assert.deepEqual(addProjectToList(['admin'], 'billing'), ['admin', 'billing'])
  assert.deepEqual(removeProjectFromList(['admin', 'billing'], 'ADMIN'), ['billing'])
})

test('changing only the casing of a name is a valid rename', () => {
  assert.deepEqual(renameProjectInList(['admin'], 'admin', 'Admin'), ['Admin'])
  assert.throws(() => renameProjectInList(['admin'], 'nope', 'x'), /is not a project/)
  assert.throws(
    () => renameProjectInList(['admin', 'billing'], 'admin', 'Billing'),
    /already a project/
  )
})

test('adding writes the list and drops the cache', async () => {
  const { admin, files, invalidated } = createAdmin()

  await admin.add('  billing  ')

  assert.deepEqual(parseProjectsFile(files['projects.txt']), [
    'certification',
    'admin',
    'billing'
  ])
  assert.deepEqual(invalidated, ['timetracker'])
})

test('a rename moves the history, the notes file and the preferences with the name', async () => {
  const { admin, files, queries, renames, prefRenames } = createAdmin()

  await admin.rename('admin', 'operations')

  assert.deepEqual(parseProjectsFile(files['projects.txt']), ['certification', 'operations'])
  assert.deepEqual(queries, [
    "UPDATE entries SET project = 'operations' WHERE project = 'admin';"
  ])
  assert.deepEqual(renames, [['/data/notes/admin.md', '/data/notes/operations.md']])
  assert.deepEqual(prefRenames, [['timetracker:admin', 'timetracker:operations']])
})

test('a rename to a name with an apostrophe is escaped, not broken', async () => {
  const { admin, queries } = createAdmin()

  await admin.rename('admin', "juanma's admin")

  assert.equal(
    queries[0],
    "UPDATE entries SET project = 'juanma''s admin' WHERE project = 'admin';"
  )
})

test('a project with no notes file still renames', async () => {
  const { admin, files, queries } = createAdmin({ notesExist: false })

  await admin.rename('admin', 'operations')

  assert.deepEqual(parseProjectsFile(files['projects.txt']), ['certification', 'operations'])
  assert.equal(queries.length, 1, 'the history still moved')
})

test('an invalid rename touches nothing at all', async () => {
  // There is no transaction across a text file, a database and the preference store, so
  // the protection is refusing before the first write.
  const { admin, files, queries, renames, prefRenames } = createAdmin()

  await assert.rejects(() => admin.rename('admin', 'certification'), /already a project/)
  await assert.rejects(() => admin.rename('nope', 'x'), /is not a project/)
  await assert.rejects(() => admin.rename('admin', '#x'), /comment/)

  assert.deepEqual(queries, [])
  assert.deepEqual(renames, [])
  assert.deepEqual(prefRenames, [])
  assert.deepEqual(parseProjectsFile(files['projects.txt']), ['certification', 'admin'])
})

test('removing drops the name without touching history', async () => {
  const { admin, files, queries, renames } = createAdmin()

  await admin.remove('admin')

  assert.deepEqual(parseProjectsFile(files['projects.txt']), ['certification'])
  assert.deepEqual(queries, [], 'past entries keep the project name')
  assert.deepEqual(renames, [], 'the notes file stays where it is')
})

test('a missing projects.txt reads as an empty list, and the first add creates it', async () => {
  const admin = createProjectAdmin({
    resolveDir: () => '/data',
    readFile: async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    writeFile: async () => {},
    createRunner: () => async () => []
  })

  assert.deepEqual(await admin.list(), [])
  assert.deepEqual(await admin.add('first'), ['first'])
})

test('a rename rewrites the notes heading so the file does not contradict its name', async () => {
  const files = {
    'projects.txt': 'admin\n',
    'admin.md': '# admin\n\n## 2026-08-01\n\n- **10:00** old note\n'
  }
  const written = []

  const admin = createProjectAdmin({
    resolveDir: () => '/data',
    readFile: async (path) => {
      const key = path.split('/').pop()
      if (!(key in files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return files[key]
    },
    writeFile: async (path, contents) => {
      const key = path.split('/').pop()
      files[key] = contents
      written.push(key)
    },
    renameFile: async (from, to) => {
      files[to.split('/').pop()] = files[from.split('/').pop()]
      delete files[from.split('/').pop()]
    },
    createRunner: () => async () => []
  })

  await admin.rename('admin', 'operations')

  assert.ok(written.includes('operations.md'))
  assert.equal(
    files['operations.md'],
    '# operations\n\n## 2026-08-01\n\n- **10:00** old note\n',
    'only the heading changes; the notes themselves are untouched'
  )
})
