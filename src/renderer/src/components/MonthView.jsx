import { Button } from '@wordpress/components'
import { format, isSameMonth, isToday } from 'date-fns'
import { EventPill } from './EventPill.jsx'
import {
  buildMonthCells,
  buildTrackedDayTotals,
  formatViewLabel,
  getViewDays,
  TRACKED_FULL_DAY_MS
} from '../calendarViews.js'
import { getEventColor, isSourceEnabled } from '../calendarViewModel.js'
import { formatDuration } from '../trackedTime.js'

const MAX_EVENTS_PER_DAY = 3

// `certification 1h 47m · admin 30m`, the only place the strip's segments are named.
function formatTrackedTooltip(projects) {
  if (projects.length === 0) return 'Nothing tracked'
  return projects.map((entry) => `${entry.project} ${formatDuration(entry.ms)}`).join(' · ')
}

export function MonthView({
  anchorDate,
  events,
  onHideEvent,
  onOpenDay,
  preferences,
  sessionActions
}) {
  const days = getViewDays('month', anchorDate)
  const cells = buildMonthCells(events, days, MAX_EVENTS_PER_DAY)
  const trackedTotals = buildTrackedDayTotals(events, days)
  const showTracked = isSourceEnabled(preferences, 'timetracker')
  const weekdays = days.slice(0, 7)

  return (
    <section className="calendar-month" aria-label={formatViewLabel('month', anchorDate)}>
      <div className="calendar-month__weekdays">
        {weekdays.map((day) => (
          <div className="calendar-month__weekday" key={day.toISOString()}>
            {format(day, 'EEE')}
          </div>
        ))}
      </div>

      <div className="calendar-month__grid">
        {cells.map((cell, cellIndex) => {
          const currentDay = isToday(cell.day)
          const tracked = trackedTotals[cellIndex]
          const outsideMonth = !isSameMonth(cell.day, anchorDate)

          return (
            <div
              className={`calendar-month__cell${outsideMonth ? ' is-outside-month' : ''}${
                currentDay ? ' is-today' : ''
              }`}
              key={cell.day.toISOString()}
            >
              <div className="calendar-month__day-number" aria-current={currentDay ? 'date' : undefined}>
                <span>{format(cell.day, 'd')}</span>
              </div>

              <div className="calendar-month__events">
                {cell.events.map((event) => (
                  <EventPill
                    event={event}
                    key={event.id}
                    onHideEvent={onHideEvent}
                    sessionActions={sessionActions}
                    preferences={preferences}
                    showTime
                  />
                ))}
                {cell.overflowCount > 0 && (
                  <Button
                    className="calendar-month__more"
                    onClick={() => onOpenDay(cell.day)}
                    variant="link"
                  >
                    {`+${cell.overflowCount} more`}
                  </Button>
                )}
              </div>

              {showTracked && tracked.projects.length > 0 && (
                <div
                  aria-label={`Tracked: ${formatTrackedTooltip(tracked.projects)}`}
                  className="calendar-month__tracked"
                  role="img"
                  title={formatTrackedTooltip(tracked.projects)}
                >
                  {tracked.projects.map((entry) => (
                    <span
                      key={entry.calendarId}
                      style={{
                        background: getEventColor(entry.event, preferences),
                        width: `${Math.min(100, (entry.ms / TRACKED_FULL_DAY_MS) * 100)}%`
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
