/**
 * Visibility rule for the split-lane legend strip, kept out of the component so it can be
 * tested without a JSX loader.
 */
import { isSourceEnabled } from './calendarViewModel.js'

/** Mockup value. Issue #11 stores a real data directory and will pass it in as `dbPath`. */
export const DEFAULT_TRACKER_DB_PATH = '~/.timetracker/timetracker.db'

/**
 * The strip explains the tracked lane bars and says where they came from, so it is only
 * worth showing when tracked bars can be on screen.
 *
 * `detected: false` is issue #4's "no tracker installed" signal — no database, no bars, and
 * a db-path hint that would be pointing at nothing. `ok: false` is different: the tracker is
 * there but the read failed, so the path stays true and worth showing.
 *
 * Before the first fetch resolves `statuses` is empty. That is treated as visible, matching
 * the optimistic default of `isSourceEnabled`; hiding first would flash the strip into
 * existence on every launch for everyone who does run the tracker.
 */
export function shouldShowSourceLegend(preferences, statuses = []) {
  if (!isSourceEnabled(preferences, 'timetracker')) return false

  return !statuses.some((status) => status.source === 'timetracker' && status.detected === false)
}
