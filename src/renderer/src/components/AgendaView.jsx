import { format, isSameDay, isToday } from 'date-fns'
import { EventPill } from './EventPill.jsx'
import {
  buildAgendaSections,
  formatViewLabel,
  getEventDayRange,
  getViewDays
} from '../calendarViews.js'

/**
 * What the event does on *this* day. A multi-day event appears in several sections, and
 * printing its overall `09:00 – 18:00` in every one of them would claim it starts and
 * ends again each morning, so each day gets only the edge that actually falls in it.
 */
function formatEventTime(event, day, timeZone) {
  if (event.allDay) return 'All day'

  const { firstDay, lastDay } = getEventDayRange(event, timeZone)
  const start = new Date(event.start)
  const end = event.end ? new Date(event.end) : null
  if (!end || end <= start) return format(start, 'HH:mm')

  if (firstDay.getTime() !== lastDay.getTime()) {
    const isFirst = isSameDay(day, firstDay)
    const isLast = isSameDay(day, lastDay)
    if (isFirst) return `${format(start, 'HH:mm')} →`
    if (isLast) return `→ ${format(end, 'HH:mm')}`
    return 'All day'
  }

  return `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
}

export function AgendaView({ anchorDate, events, onCompleteReminder, onHideEvent, preferences, sessionActions, timeZone }) {
  const sections = buildAgendaSections(events, getViewDays('agenda', anchorDate, timeZone), timeZone)

  if (sections.length === 0) {
    return (
      <section className="calendar-agenda" aria-label={formatViewLabel('agenda', anchorDate, timeZone)}>
        <p className="calendar-agenda__empty">No events in {formatViewLabel('agenda', anchorDate, timeZone)}.</p>
      </section>
    )
  }

  return (
    <section className="calendar-agenda" aria-label={formatViewLabel('agenda', anchorDate, timeZone)}>
      {sections.map((section) => (
        <div className="calendar-agenda__section" key={section.day.toISOString()}>
          <div
            className={`calendar-agenda__date${isToday(section.day) ? ' is-today' : ''}`}
            aria-current={isToday(section.day) ? 'date' : undefined}
          >
            <span className="calendar-agenda__weekday">{format(section.day, 'EEE')}</span>
            <strong className="calendar-agenda__day-number">{format(section.day, 'd')}</strong>
            <span className="calendar-agenda__month">{format(section.day, 'MMM')}</span>
          </div>

          <ul className="calendar-agenda__events">
            {section.events.map((event) => (
              <li className="calendar-agenda__event" key={event.id}>
                <span className="calendar-agenda__time">
                  {formatEventTime(event, section.day, timeZone)}
                </span>
                <EventPill
                  onCompleteReminder={onCompleteReminder}
                  event={event}
                  onHideEvent={onHideEvent}
                  sessionActions={sessionActions}
                  preferences={preferences}
                  variant="row"
                />
                <span className="calendar-agenda__calendar">{event.calendarName}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
