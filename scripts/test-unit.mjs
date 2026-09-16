import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const tests = readdirSync(new URL('../test/', import.meta.url))
  .filter(name => /\.test\.(mjs|js)$/.test(name) && !name.includes('.integration.'))
  .map(name => fileURLToPath(new URL(`../test/${name}`, import.meta.url)))
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
