import { differenceInMinutes, format, isSameDay, isToday, startOfDay } from 'date-fns'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EventPill } from './EventPill.jsx'
import { formatViewLabel, getViewDays } from '../calendarViews.js'
import {
  buildDayLayout,
  getCenteredTimeScrollTop,
  getMoveResult,
  getResizeResult,
  HOUR_HEIGHT,
  SNAP_MINUTES
} from '../calendarTimeGrid.js'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const CURRENT_TIME_REFRESH_MS = 60 * 1000
// Below this, a pointer gesture is the click that opens the event menu, not a drag.
const DRAG_THRESHOLD_PX = 4

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

function hasSameTimes(event, times) {
  const start = new Date(event.start).getTime()
  const end = new Date(event.end ?? event.start).getTime()
  return start === new Date(times.start).getTime() && end === new Date(times.end).getTime()
}

function getPreviewGeometry(times) {
  const start = new Date(times.start)
  const end = new Date(times.end)
  const startMinutes = differenceInMinutes(start, startOfDay(start))
  const durationMinutes = Math.max(SNAP_MINUTES, differenceInMinutes(end, start))

  return {
    top: (startMinutes / 60) * HOUR_HEIGHT,
    height: (durationMinutes / 60) * HOUR_HEIGHT
  }
}

export function CalendarGrid({
  anchorDate,
  calendarView,
  canEditEvent = () => false,
  events,
  onEventTimeChange,
  onHideEvent,
  preferences
}) {
  const days = getViewDays(calendarView, anchorDate)
  const viewportRef = useRef(null)
  const todayRef = useRef(null)
  const timeScrollRef = useRef(null)
  const [now, setNow] = useState(() => new Date())
  // `drag` drives the preview render; `dragRef` holds the gesture bookkeeping so
  // pointermove never reads state that has not committed yet.
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)

  useLayoutEffect(() => {
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' })
    } else if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0
    }
    if (timeScrollRef.current) {
      timeScrollRef.current.scrollTop = getCenteredTimeScrollTop(new Date(), timeScrollRef.current.clientHeight)
    }
  }, [anchorDate, calendarView])

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CURRENT_TIME_REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  const cancelDrag = useCallback(() => {
    dragRef.current = null
    setDrag(null)
  }, [])

  useEffect(() => {
    if (!drag) return undefined
    const handleKeyDown = (nativeEvent) => {
      if (nativeEvent.key === 'Escape') cancelDrag()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelDrag, drag])

  const canResizeEvent = useCallback(
    (event) => event.source === 'google' && !event.allDay && canEditEvent(event),
    [canEditEvent]
  )

  const beginDrag = useCallback(
    (event, mode) => (pointerEvent) => {
      if (pointerEvent.button !== 0 || !canEditEvent(event)) return
      // Resize handles sit inside the pill wrapper, whose pointerdown starts a move.
      if (mode !== 'move') pointerEvent.stopPropagation()

      const wrapper = pointerEvent.currentTarget.closest(
        '.calendar-week__timed-event, .calendar-week__all-day-event'
      )
      const column = wrapper?.closest('.calendar-week__time-day, .calendar-week__all-day-cell')

      suppressClickRef.current = false
      dragRef.current = {
        event,
        mode,
        moved: false,
        originX: pointerEvent.clientX,
        originY: pointerEvent.clientY,
        dayWidth: column?.getBoundingClientRect().width ?? 0,
        times: null
      }
      wrapper?.setPointerCapture(pointerEvent.pointerId)
    },
    [canEditEvent]
  )

  const handleDragMove = useCallback((pointerEvent) => {
    const state = dragRef.current
    if (!state) return

    const deltaX = pointerEvent.clientX - state.originX
    const deltaY = pointerEvent.clientY - state.originY
    if (!state.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return
    state.moved = true

    const { event, mode } = state
    const deltaDays = state.dayWidth ? Math.round(deltaX / state.dayWidth) : 0
    const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60

    const times =
      mode === 'move'
        ? getMoveResult({
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            deltaDays,
            deltaMinutes: event.allDay ? 0 : deltaMinutes
          })
        : getResizeResult({
            start: event.start,
            end: event.end,
            edge: mode === 'resize-start' ? 'start' : 'end',
            deltaMinutes
          })

    state.times = times
    setDrag({
      eventId: event.id,
      mode,
      deltaDays: mode === 'move' ? deltaDays : 0,
      dayWidth: state.dayWidth,
      times
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    const state = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!state?.moved) return

    // It was a drag, so swallow the click it would otherwise fire on the pill.
    suppressClickRef.current = true
    if (state.times && !hasSameTimes(state.event, state.times)) {
      onEventTimeChange?.(state.event, state.times)
    }
  }, [onEventTimeChange])

  const handleClickCapture = useCallback((clickEvent) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    clickEvent.preventDefault()
    clickEvent.stopPropagation()
  }, [])

  const handleKeyDown = useCallback(
    (event) => (keyEvent) => {
      if (!canEditEvent(event)) return

      const vertical = keyEvent.key === 'ArrowUp' || keyEvent.key === 'ArrowDown'
      const horizontal = keyEvent.key === 'ArrowLeft' || keyEvent.key === 'ArrowRight'
      if (!vertical && !horizontal) return
      if (vertical && event.allDay) return
      if (vertical && keyEvent.shiftKey && !canResizeEvent(event)) return

      const deltaMinutes = (keyEvent.key === 'ArrowUp' ? -1 : 1) * SNAP_MINUTES
      let times
      if (horizontal) {
        times = getMoveResult({
          start: event.start,
          end: event.end,
          allDay: event.allDay,
          deltaDays: keyEvent.key === 'ArrowLeft' ? -1 : 1
        })
      } else if (keyEvent.shiftKey) {
        times = getResizeResult({ start: event.start, end: event.end, edge: 'end', deltaMinutes })
      } else {
        times = getMoveResult({ start: event.start, end: event.end, deltaMinutes })
      }

      keyEvent.preventDefault()
      if (!hasSameTimes(event, times)) onEventTimeChange?.(event, times)
    },
    [canEditEvent, canResizeEvent, onEventTimeChange]
  )

  const layouts = days.map((day) => {
    const dayEvents = events.filter((event) => isSameDay(new Date(event.start), day))
    return buildDayLayout(dayEvents, day)
  })
  const rangeContainsToday = days.some((day) => isToday(day))
  const currentTimeTop = (getCurrentMinutes(now) / 60) * HOUR_HEIGHT

  return (
    <section
      className={`calendar-grid${drag ? ' is-dragging' : ''}`}
      aria-label={formatViewLabel(calendarView, anchorDate)}
    >
      <div className="calendar-grid-viewport" ref={viewportRef}>
        <div className="calendar-week" style={{ '--calendar-day-count': days.length }}>
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
                {layout.allDayEvents.map((event) => {
                  const dragging = drag?.eventId === event.id
                  return (
                    <div
                      className={`calendar-week__all-day-event${
                        canEditEvent(event) ? ' is-editable' : ''
                      }${dragging ? ' is-dragging' : ''}`}
                      key={event.id}
                      onClickCapture={handleClickCapture}
                      onKeyDown={handleKeyDown(event)}
                      onLostPointerCapture={handleDragEnd}
                      onPointerDown={beginDrag(event, 'move')}
                      onPointerMove={handleDragMove}
                      onPointerUp={handleDragEnd}
                      style={
                        dragging
                          ? { transform: `translateX(${drag.deltaDays * drag.dayWidth}px)` }
                          : undefined
                      }
                    >
                      <EventPill event={event} onHideEvent={onHideEvent} preferences={preferences} />
                    </div>
                  )
                })}
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
                    {layout.timedEvents.map((position) => {
                      const event = position.event
                      const dragging = drag?.eventId === event.id
                      const geometry = dragging
                        ? getPreviewGeometry(drag.times)
                        : {
                            top: (position.startMinutes / 60) * HOUR_HEIGHT,
                            height: (position.durationMinutes / 60) * HOUR_HEIGHT
                          }

                      return (
                        <div
                          className={`calendar-week__timed-event${
                            canEditEvent(event) ? ' is-editable' : ''
                          }${dragging ? ' is-dragging' : ''}`}
                          key={event.id}
                          onClickCapture={handleClickCapture}
                          onKeyDown={handleKeyDown(event)}
                          onLostPointerCapture={handleDragEnd}
                          onPointerDown={beginDrag(event, 'move')}
                          onPointerMove={handleDragMove}
                          onPointerUp={handleDragEnd}
                          style={{
                            top: geometry.top,
                            height: geometry.height,
                            left: `${(position.column / position.columnCount) * 100}%`,
                            width: `${100 / position.columnCount}%`,
                            transform: dragging
                              ? `translateX(${drag.deltaDays * drag.dayWidth}px)`
                              : undefined
                          }}
                        >
                          <EventPill
                            event={event}
                            onHideEvent={onHideEvent}
                            preferences={preferences}
                            showTime
                          />
                          {canResizeEvent(event) && (
                            <>
                              <span
                                aria-hidden="true"
                                className="calendar-week__resize-handle is-start"
                                onPointerDown={beginDrag(event, 'resize-start')}
                              />
                              <span
                                aria-hidden="true"
                                className="calendar-week__resize-handle is-end"
                                onPointerDown={beginDrag(event, 'resize-end')}
                              />
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {rangeContainsToday && (
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
