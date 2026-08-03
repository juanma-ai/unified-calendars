import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * A merge once ate the `}` closing `.calendar-month__tracked span` together with the `/*`
 * opening the section banner that followed it. CSS has no syntax error to report for that:
 * the parser silently swallowed the next rule and the sidebar's Time Tracker report rendered
 * unstyled for two merges before anyone noticed. These are the two things a merge can break
 * in this file without anything going red, so they get checked.
 */

const CSS_PATH = fileURLToPath(new URL('../src/renderer/src/styles.css', import.meta.url))

/** Strips comments, reporting the position of any comment terminator that never had an opener. */
function stripComments(css) {
  let out = ''
  let index = 0

  while (index < css.length) {
    const open = css.indexOf('/*', index)
    const close = css.indexOf('*/', index)

    if (close !== -1 && (open === -1 || close < open)) {
      return { orphanCloseAt: close, out }
    }
    if (open === -1) {
      out += css.slice(index)
      break
    }

    out += css.slice(index, open)
    const end = css.indexOf('*/', open + 2)
    assert.notEqual(end, -1, `unterminated comment opened at offset ${open}`)
    index = end + 2
  }

  return { orphanCloseAt: -1, out }
}

function describePosition(css, offset) {
  const line = css.slice(0, offset).split('\n').length
  return `styles.css:${line}: ${css.split('\n')[line - 1].trim()}`
}

test('every comment in styles.css is opened before it is closed', () => {
  const css = readFileSync(CSS_PATH, 'utf8')
  const { orphanCloseAt } = stripComments(css)

  assert.equal(
    orphanCloseAt,
    -1,
    orphanCloseAt === -1
      ? ''
      : `a comment is closed but never opened — the '/*' was lost: ${describePosition(css, orphanCloseAt)}`
  )
})

test('every rule in styles.css is closed, so no rule can be silently swallowed', () => {
  const css = readFileSync(CSS_PATH, 'utf8')
  const { out } = stripComments(css)
  let depth = 0

  for (let index = 0; index < out.length; index += 1) {
    if (out[index] === '{') depth += 1
    if (out[index] === '}') depth -= 1
    assert.ok(depth >= 0, `unbalanced '}' at offset ${index}`)
  }

  assert.equal(depth, 0, `${depth} rule(s) left open at the end of styles.css`)
})
