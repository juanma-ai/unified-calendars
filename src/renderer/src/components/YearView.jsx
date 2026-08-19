import { format, isToday } from 'date-fns'
import { buildYearHeatmap, formatViewLabel, YEAR_HEAT_LEVELS } from '../calendarViews.js'
import { getEventColor, isSourceEnabled } from '../calendarViewModel.js'

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const LEGEND_LEVELS = Array.from({ length: YEAR_HEAT_LEVELS + 1 }, (_, level) => level)
// A year cell is 34px wide: past four dots they stop being countable.
const MAX_PROJECT_DOTS = 4

// date-fns keeps Sunday at 0; the grid starts on Monday.
function leadingBlanks(date) {
  return (date.getDay() + 6) % 7
}

export function YearView({ anchorDate, events, onOpenDay, preferences, timeZone }) {
  const heatmap = buildYearHeatmap(events, anchorDate)
  const showTracked = isSourceEnabled(preferences, 'timetracker')

  return (
    <section className="calendar-year" aria-label={formatViewLabel('year', anchorDate, timeZone)}>
      <div className="calendar-year__intro">
        <p className="calendar-year__hint">
          Colour shows how full each day is.
          {showTracked ? ' Dots show which projects you worked on.' : ''} Click a day to open it.
        </p>
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
            <h2 className="calendar-year__month-name">
              {format(month.start, 'MMMM')}
              {showTracked && (
                <span className="calendar-year__tracked-days">
                  {`${month.trackedDays}/${month.days.length} days`}
                </span>
              )}
            </h2>
            <div className="calendar-year__weekdays" aria-hidden="true">
              {WEEKDAY_INITIALS.map((initial, index) => (
                <span key={`${initial}-${index}`}>{initial}</span>
              ))}
            </div>
            <div className="calendar-year__days">
              {Array.from({ length: leadingBlanks(month.start) }, (_, index) => (
                <span className="calendar-year__blank" key={`blank-${index}`} />
              ))}
              {month.days.map((entry) => {
                const worked = showTracked ? entry.trackedProjects : []
                const workedLabel = worked.length
                  ? `, worked on ${worked.map((project) => project.project).join(', ')}`
                  : ''

                return (
                  <button
                    aria-current={isToday(entry.day) ? 'date' : undefined}
                    aria-label={`${format(entry.day, 'EEEE d MMMM yyyy')}, ${entry.count} ${
                      entry.count === 1 ? 'event' : 'events'
                    }${workedLabel}`}
                    className={`calendar-year__day is-level-${entry.level}${
                      isToday(entry.day) ? ' is-today' : ''
                    }`}
                    key={entry.day.toISOString()}
                    onClick={() => onOpenDay(entry.day)}
                    type="button"
                  >
                    {format(entry.day, 'd')}
                    {showTracked && (
                      // The row is reserved even when empty, so days do not jump
                      // around as the dots come and go down a column.
                      <span aria-hidden="true" className="calendar-year__dots">
                        {worked.slice(0, MAX_PROJECT_DOTS).map((project) => (
                          <span
                            key={project.calendarId}
                            style={{ background: getEventColor(project.event, preferences) }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
