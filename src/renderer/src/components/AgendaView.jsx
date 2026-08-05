import { format, isToday } from 'date-fns'
import { EventPill } from './EventPill.jsx'
import { buildAgendaSections, formatViewLabel, getViewDays } from '../calendarViews.js'

function formatEventTime(event) {
  if (event.allDay) return 'All day'

  const start = new Date(event.start)
  const end = event.end ? new Date(event.end) : null
  if (!end || end <= start) return format(start, 'HH:mm')

  return `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
}

export function AgendaView({ anchorDate, events, onCompleteReminder, onHideEvent, preferences, sessionActions }) {
  const sections = buildAgendaSections(events, getViewDays('agenda', anchorDate))

  if (sections.length === 0) {
    return (
      <section className="calendar-agenda" aria-label={formatViewLabel('agenda', anchorDate)}>
        <p className="calendar-agenda__empty">No events in {formatViewLabel('agenda', anchorDate)}.</p>
      </section>
    )
  }

  return (
    <section className="calendar-agenda" aria-label={formatViewLabel('agenda', anchorDate)}>
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
                <span className="calendar-agenda__time">{formatEventTime(event)}</span>
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
