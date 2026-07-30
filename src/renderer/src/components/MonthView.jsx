import { Button } from '@wordpress/components'
import { format, isSameMonth, isToday } from 'date-fns'
import { EventPill } from './EventPill.jsx'
import { buildMonthCells, formatViewLabel, getViewDays } from '../calendarViews.js'

const MAX_EVENTS_PER_DAY = 3

export function MonthView({ anchorDate, events, onHideEvent, onOpenDay, preferences }) {
  const days = getViewDays('month', anchorDate)
  const cells = buildMonthCells(events, days, MAX_EVENTS_PER_DAY)
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
        {cells.map((cell) => {
          const currentDay = isToday(cell.day)
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
            </div>
          )
        })}
      </div>
    </section>
  )
}
