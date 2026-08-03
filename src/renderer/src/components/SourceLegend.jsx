import { SOURCE_COLORS } from '../sourceColors.js'
import { DEFAULT_TRACKER_DB_PATH } from '../sourceLegend.js'

/**
 * The one-line key for the split lane: the time grid draws scheduled events as pills and
 * tracked sessions as thin lane bars, and the two shapes need explaining once. Callers
 * decide whether to render it at all — see `shouldShowSourceLegend`.
 */
export function SourceLegend({ dbPath = DEFAULT_TRACKER_DB_PATH }) {
  return (
    <div className="source-legend">
      <span className="source-legend__item">
        <span className="source-legend__swatch source-legend__swatch--scheduled" />
        Scheduled
      </span>
      <span className="source-legend__item">
        <span
          className="source-legend__swatch source-legend__swatch--tracked"
          style={{ backgroundColor: SOURCE_COLORS.timetracker }}
        />
        Tracked
      </span>
      <span className="source-legend__hint">
        Tracked sessions read from <code>{dbPath}</code>
      </span>
    </div>
  )
}
