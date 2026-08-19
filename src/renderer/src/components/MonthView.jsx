import { Button } from '@wordpress/components'
import { format, isSameMonth, isToday } from 'date-fns'
import { EventPill } from './EventPill.jsx'
import {
  buildMonthWeeks,
  buildTrackedDayTotals,
  DAYS_PER_WEEK,
  formatViewLabel,
  getViewDays,
  TRACKED_FULL_DAY_MS
} from '../calendarViews.js'
import { getEventColor, isSourceEnabled } from '../calendarViewModel.js'
import { formatDuration } from '../trackedTime.js'

// Lanes of events per week row before the rest falls behind "+N more". The "+N more"
// row sits below these, so a row is at most this many bars tall plus one.
const MAX_LANES = 3

// `certification 1h 47m · admin 30m`, the only place the strip's segments are named.
function formatTrackedTooltip(projects) {
  if (projects.length === 0) return 'Nothing tracked'
  return projects.map((entry) => `${entry.project} ${formatDuration(entry.ms)}`).join(' · ')
}

export function MonthView({
  anchorDate,
  events,
  onCompleteReminder,
  onHideEvent,
  onOpenDay,
  preferences,
  sessionActions,
  timeZone
}) {
  const days = getViewDays('month', anchorDate, timeZone)
  const weeks = buildMonthWeeks(events, days, MAX_LANES, timeZone)
  const trackedTotals = buildTrackedDayTotals(events, days)
  const showTracked = isSourceEnabled(preferences, 'timetracker')
  const weekdays = days.slice(0, DAYS_PER_WEEK)

  return (
    <section className="calendar-month" aria-label={formatViewLabel('month', anchorDate, timeZone)}>
      <div className="calendar-month__weekdays">
        {weekdays.map((day) => (
          <div className="calendar-month__weekday" key={day.toISOString()}>
            {format(day, 'EEE')}
          </div>
        ))}
      </div>

      <div className="calendar-month__grid">
        {weeks.map((week, weekIndex) => (
          <div
            className="calendar-month__week"
            key={week.days[0].toISOString()}
            style={{ '--calendar-month-lanes': week.laneCount }}
          >
            {/* The day cells are a layer of their own behind the bars: a bar spans
                columns, so it cannot live inside any one cell, but the borders, the
                today tint and the tracked strip still belong to individual days. */}
            <div className="calendar-month__week-backdrop">
              {week.days.map((day, dayIndex) => {
                const tracked = trackedTotals[weekIndex * DAYS_PER_WEEK + dayIndex]
                return (
                  <div
                    className={`calendar-month__cell${
                      isSameMonth(day, anchorDate) ? '' : ' is-outside-month'
                    }${isToday(day) ? ' is-today' : ''}`}
                    key={day.toISOString()}
                  >
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

            {week.days.map((day, dayIndex) => {
              const currentDay = isToday(day)
              return (
                <div
                  className={`calendar-month__day-number${
                    isSameMonth(day, anchorDate) ? '' : ' is-outside-month'
                  }`}
                  key={day.toISOString()}
                  style={{ gridColumn: dayIndex + 1, gridRow: 1 }}
                >
                  <span aria-current={currentDay ? 'date' : undefined}>{format(day, 'd')}</span>
                </div>
              )
            })}

            {week.segments.map((segment) => (
              <div
                className={`calendar-month__segment${
                  segment.continuesBefore ? ' continues-before' : ''
                }${segment.continuesAfter ? ' continues-after' : ''}`}
                key={segment.event.id}
                style={{
                  gridColumn: `${segment.startIndex + 1} / span ${segment.span}`,
                  gridRow: segment.lane + 2
                }}
              >
                <EventPill
                  continuesAfter={segment.continuesAfter}
                  continuesBefore={segment.continuesBefore}
                  event={segment.event}
                  onCompleteReminder={onCompleteReminder}
                  onHideEvent={onHideEvent}
                  preferences={preferences}
                  sessionActions={sessionActions}
                  showTime
                />
              </div>
            ))}

            {week.overflowCounts.map((count, dayIndex) =>
              count > 0 ? (
                <Button
                  className="calendar-month__more"
                  key={week.days[dayIndex].toISOString()}
                  onClick={() => onOpenDay(week.days[dayIndex])}
                  style={{ gridColumn: dayIndex + 1, gridRow: MAX_LANES + 2 }}
                  variant="link"
                >
                  {`+${count} more`}
                </Button>
              ) : null
            )}

          </div>
        ))}
      </div>
    </section>
  )
}
