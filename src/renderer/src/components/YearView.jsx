import { format, isToday } from 'date-fns'
import { buildYearHeatmap, formatViewLabel, YEAR_HEAT_LEVELS } from '../calendarViews.js'

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const LEGEND_LEVELS = Array.from({ length: YEAR_HEAT_LEVELS + 1 }, (_, level) => level)

// date-fns keeps Sunday at 0; the grid starts on Monday.
function leadingBlanks(date) {
  return (date.getDay() + 6) % 7
}

export function YearView({ anchorDate, events, onOpenDay }) {
  const heatmap = buildYearHeatmap(events, anchorDate)

  return (
    <section className="calendar-year" aria-label={formatViewLabel('year', anchorDate)}>
      <div className="calendar-year__intro">
        <p className="calendar-year__hint">Colour shows how full each day is. Click a day to open it.</p>
        <div className="calendar-year__legend" aria-hidden="true">
          <span>Quiet</span>
          {LEGEND_LEVELS.map((level) => (
            <span className={`calendar-year__swatch is-level-${level}`} key={level} />
          ))}
          <span>Busy</span>
        </div>
      </div>

      <div className="calendar-year__months">
        {heatmap.months.map((month) => (
          <div className="calendar-year__month" key={month.month}>
            <h2 className="calendar-year__month-name">{format(month.start, 'MMMM')}</h2>
            <div className="calendar-year__weekdays" aria-hidden="true">
              {WEEKDAY_INITIALS.map((initial, index) => (
                <span key={`${initial}-${index}`}>{initial}</span>
              ))}
            </div>
            <div className="calendar-year__days">
              {Array.from({ length: leadingBlanks(month.start) }, (_, index) => (
                <span className="calendar-year__blank" key={`blank-${index}`} />
              ))}
              {month.days.map((entry) => (
                <button
                  aria-current={isToday(entry.day) ? 'date' : undefined}
                  aria-label={`${format(entry.day, 'EEEE d MMMM yyyy')}, ${entry.count} ${
                    entry.count === 1 ? 'event' : 'events'
                  }`}
                  className={`calendar-year__day is-level-${entry.level}${
                    isToday(entry.day) ? ' is-today' : ''
                  }`}
                  key={entry.day.toISOString()}
                  onClick={() => onOpenDay(entry.day)}
                  type="button"
                >
                  {format(entry.day, 'd')}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
