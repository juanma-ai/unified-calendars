import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldShowSourceLegend } from '../src/renderer/src/sourceLegend.js'

const enabled = { sourceEnabled: {} }

test('shows the legend when the tracker is enabled and detected', () => {
  const statuses = [{ source: 'timetracker', ok: true, detected: true }]
  assert.equal(shouldShowSourceLegend(enabled, statuses), true)
})

test('hides the legend when the tracker source is switched off', () => {
  const preferences = { sourceEnabled: { timetracker: false } }
  const statuses = [{ source: 'timetracker', ok: true, detected: true }]
  assert.equal(shouldShowSourceLegend(preferences, statuses), false)
})

test('hides the legend when no tracker database was detected', () => {
  const statuses = [{ source: 'timetracker', ok: true, detected: false }]
  assert.equal(shouldShowSourceLegend(enabled, statuses), false)
})

// A failed read still means the tracker is installed, so the db path stays worth showing.
test('keeps the legend when the tracker is present but failing', () => {
  const statuses = [{ source: 'timetracker', ok: false, detected: true, lastError: 'boom' }]
  assert.equal(shouldShowSourceLegend(enabled, statuses), true)
})

// Statuses are empty until the first refresh resolves; hiding first would flash the strip in.
test('shows the legend before any status has arrived', () => {
  assert.equal(shouldShowSourceLegend(enabled, []), true)
  assert.equal(shouldShowSourceLegend(enabled), true)
  assert.equal(shouldShowSourceLegend(undefined), true)
})

test('ignores other sources reporting undetected', () => {
  const statuses = [
    { source: 'reminders', ok: true, detected: false },
    { source: 'timetracker', ok: true, detected: true }
  ]
  assert.equal(shouldShowSourceLegend(enabled, statuses), true)
})
