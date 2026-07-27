import assert from 'node:assert/strict'
import test from 'node:test'
import { getEventPalette, FALLBACK_COLOR } from '../src/renderer/src/eventColors.js'

test('light colors become a soft tint with dark text', () => {
  const palette = getEventPalette('#fbbc04')

  assert.equal(palette.accent, '#fbbc04')
  assert.notEqual(palette.background, '#fbbc04')
  assert.notEqual(palette.text, '#fff')
  // The tint must stay closer to white than to the source color.
  assert.ok(parseInt(palette.background.slice(1, 3), 16) > 0xf0)
})

test('dark colors keep a solid fill with white text', () => {
  const palette = getEventPalette('#3858e9')

  assert.deepEqual(palette, { background: '#3858e9', text: '#fff', accent: '#3858e9' })
})

test('shorthand hex is expanded', () => {
  assert.equal(getEventPalette('#0f0').accent, '#00ff00')
})

test('invalid input falls back to the neutral gray', () => {
  for (const value of [undefined, null, '', 'not-a-color', 42]) {
    assert.equal(getEventPalette(value).accent, FALLBACK_COLOR)
  }
})
