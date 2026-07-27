import { format, isSameDay, isToday } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { EventPill } from './EventPill.jsx'
import { formatWeekRange, getMondayWeek } from '../calendarDates.js'
import { buildDayLayout, HOUR_HEIGHT } from '../calendarTimeGrid.js'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const CURRENT_TIME_REFRESH_MS = 60 * 1000

function getCurrentMinutes(date) {
  return date.getHours() * 60 + date.getMinutes()
}

function formatTimezoneOffset(date) {
  // getTimezoneOffset() is minutes *behind* UTC, so the sign is inverted.
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes < 0 ? '-' : '+'
  const hours = Math.floor(Math.abs(offsetMinutes) / 60)
  const minutes = Math.abs(offsetMinutes) % 60

  return `GMT${sign}${String(hours).padStart(2, '0')}${
    minutes ? `:${String(minutes).padStart(2, '0')}` : ''
  }`
}

export function CalendarGrid({ events, onHideEvent, preferences, weekStart }) {
  const { days } = getMondayWeek(weekStart)
  const viewportRef = useRef(null)
  const todayRef = useRef(null)
  const timeScrollRef = useRef(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' })
    } else if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0
    }
    // Offset a little so the topmost hour label is not clipped by the all-day row.
    if (timeScrollRef.current) timeScrollRef.current.scrollTop = 8 * HOUR_HEIGHT - 12
  }, [weekStart])

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CURRENT_TIME_REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  const layouts = days.map((day) => {
    const dayEvents = events.filter((event) => isSameDay(new Date(event.start), day))
    return buildDayLayout(dayEvents, day)
  })
  const weekContainsToday = days.some((day) => isToday(day))
  const currentTimeTop = (getCurrentMinutes(now) / 60) * HOUR_HEIGHT

  return (
    <section className="calendar-grid" aria-label={formatWeekRange(weekStart)}>
      <div className="calendar-grid-viewport" ref={viewportRef}>
        <div className="calendar-week">
          <div className="calendar-week__day-headers">
            <div className="calendar-week__corner">
              <span className="calendar-week__timezone">{formatTimezoneOffset(now)}</span>
            </div>
            {days.map((day) => {
              const currentDay = isToday(day)
              return (
                <header
                  className={`calendar-grid-day-label${currentDay ? ' is-today' : ''}`}
                  aria-current={currentDay ? 'date' : undefined}
                  key={day.toISOString()}
                  ref={currentDay ? todayRef : undefined}
                >
                  <span>{format(day, 'EEE')}</span>
                  <strong>{format(day, 'd')}</strong>
                </header>
              )
            })}
          </div>

          <div className="calendar-week__all-day">
            <div className="calendar-week__all-day-label">All day</div>
            {layouts.map((layout, dayIndex) => (
              <div
                className={`calendar-week__all-day-cell${
                  isToday(days[dayIndex]) ? ' is-today' : ''
                }`}
                key={days[dayIndex].toISOString()}
              >
                {layout.allDayEvents.map((event) => (
                  <EventPill
                    key={event.id}
                    event={event}
                    onHideEvent={onHideEvent}
                    preferences={preferences}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="calendar-week__time-scroll" ref={timeScrollRef}>
            <div className="calendar-week__time-grid" style={{ height: 24 * HOUR_HEIGHT }}>
              <div className="calendar-week__time-labels">
                {HOURS.map((hour) => (
                  <span key={hour} style={{ top: hour * HOUR_HEIGHT }}>
                    {String(hour).padStart(2, '0')}:00
                  </span>
                ))}
              </div>
              {layouts.map((layout, dayIndex) => {
                const currentDay = isToday(days[dayIndex])
                return (
                  <div
                    className={`calendar-week__time-day${currentDay ? ' is-today' : ''}`}
                    key={days[dayIndex].toISOString()}
                  >
                    {layout.timedEvents.map((position) => (
                      <div
                        className="calendar-week__timed-event"
                        key={position.event.id}
                        style={{
                          top: (position.startMinutes / 60) * HOUR_HEIGHT,
                          height: (position.durationMinutes / 60) * HOUR_HEIGHT,
                          left: `${(position.column / position.columnCount) * 100}%`,
                          width: `${100 / position.columnCount}%`
                        }}
                      >
                        <EventPill
                          event={position.event}
                          onHideEvent={onHideEvent}
                          preferences={preferences}
                          showTime
                        />
                      </div>
                    ))}
                  </div>
                )
              })}
              {weekContainsToday && (
                <div
                  className="calendar-week__current-time"
                  style={{ top: currentTimeTop }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
