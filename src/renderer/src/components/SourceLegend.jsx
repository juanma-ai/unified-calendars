import { SOURCES } from '../sourceColors.js'

export function SourceLegend() {
  return (
    <div class="source-legend">
      {SOURCES.map((s) => (
        <span class="source-legend-item" key={s.key}>
          <span class="source-legend-swatch" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}
