export const FALLBACK_COLOR = '#757575'

// Above this relative luminance a color is treated as light enough to be used
// as a soft tinted background with dark text; below it the color is saturated
// enough to be used as a solid fill with white text.
const SOLID_FILL_LUMINANCE = 0.3
const MAX_TEXT_LUMINANCE = 0.22
const BACKGROUND_TINT = 0.16

function parseHex(value) {
  if (typeof value !== 'string') return null

  const hex = value.trim().replace(/^#/, '')
  const expanded = hex.length === 3 || hex.length === 4
    ? hex.slice(0, 3).split('').map((char) => char + char).join('')
    : hex.slice(0, 6)

  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16)
  }
}

function toHex({ r, g, b }) {
  const channel = (value) => Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const ratio = value / 255
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function mixWithWhite(rgb, colorWeight) {
  return {
    r: rgb.r * colorWeight + 255 * (1 - colorWeight),
    g: rgb.g * colorWeight + 255 * (1 - colorWeight),
    b: rgb.b * colorWeight + 255 * (1 - colorWeight)
  }
}

function darkenToLuminance(rgb, maxLuminance) {
  let current = { ...rgb }
  // Scale the channels down until the color is dark enough to read against a
  // tinted background. Bounded so a pathological input still terminates.
  for (let step = 0; step < 24 && relativeLuminance(current) > maxLuminance; step += 1) {
    current = { r: current.r * 0.85, g: current.g * 0.85, b: current.b * 0.85 }
  }
  return current
}

/**
 * Turns a calendar color into the palette used to paint an event: a soft tinted
 * background with dark text for light colors, and a solid fill with white text
 * for colors that are already dark enough to carry white type.
 */
export function getEventPalette(color) {
  const rgb = parseHex(color) ?? parseHex(FALLBACK_COLOR)
  const accent = toHex(rgb)

  if (relativeLuminance(rgb) < SOLID_FILL_LUMINANCE) {
    return { background: accent, text: '#fff', accent }
  }

  return {
    background: toHex(mixWithWhite(rgb, BACKGROUND_TINT)),
    text: toHex(darkenToLuminance(rgb, MAX_TEXT_LUMINANCE)),
    accent
  }
}
