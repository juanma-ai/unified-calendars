import { TZDate, tz } from '@date-fns/tz'
import { differenceInMinutes, format, isToday, startOfDay } from 'date-fns'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EventPill } from './EventPill.jsx'
import { TrackedSessionBar } from './TrackedSessionBar.jsx'
import { formatViewLabel, getViewDays } from '../calendarViews.js'
import {
  buildDayLayout,
  getCenteredTimeScrollTop,
  getMoveResult,
  getResizeResult,
  HOUR_HEIGHT,
  SNAP_MINUTES
} from '../calendarTimeGrid.js'
import {
  buildSecondaryRulerMarks,
  formatTimeZoneReference,
  formatZoneName,
  getZoneOffsetsDiffer,
  MAX_SECONDARY_ZONES,
  resolveTimeZone
} from '../calendarTimeZones.js'
import { getEventColor, isSourceEnabled } from '../calendarViewModel.js'
import { durationMs, effectiveEnd, isLongSession, isRunning, formatDuration } from '../trackedTime.js'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
// Below this, a pointer gesture is the click that opens the event menu, not a drag.
const DRAG_THRESHOLD_PX = 4

function getCurrentMinutes(date) {
  return date.getHours() * 60 + date.getMinutes()
}

function getPreviewGeometry(times, timeZone) {
  const start = new Date(times.start)
  const end = new Date(times.end)
  const dayStart = startOfDay(start, { in: tz(timeZone) })

  const startMinutes = differenceInMinutes(start, dayStart)
  const durationMinutes = Math.max(SNAP_MINUTES, differenceInMinutes(end, start))

  return {
    top: (startMinutes / 60) * HOUR_HEIGHT,
    height: (durationMinutes / 60) * HOUR_HEIGHT
  }
}

// One header per gutter column, so a bare `17:00` two columns over still says which city it
// belongs to. The note, and any DST caveat, ride along in the tooltip.
function ZoneColumnHeader({ city, isPrimary, note, offsetsDiffer, zone }) {
  const name = formatZoneName(zone, city)
  const title = [
    `${name} — ${zone}`,
    note,
    offsetsDiffer ? 'Clocks change inside this range, so the offset is not the same every day.'
      : null
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      className={`calendar-week__zone-header${isPrimary ? ' is-primary' : ''}`}
      title={title}
    >
      <span className="calendar-week__zone-header__city">
        {name}
        {offsetsDiffer && <abbr aria-label="Clocks change inside this range">*</abbr>}
      </span>
      <span className="calendar-week__zone-header__offset">
        {formatTimeZoneReference(zone, new Date())}
      </span>
    </div>
  )
}

function hasSameTimes(event, times) {
  const start = new Date(event.start).getTime()
  const end = new Date(event.end ?? event.start).getTime()
  return start === new Date(times.start).getTime() && end === new Date(times.end).getTime()
}

// `certification · 10:05–11:52 · 1h 47m`, or `certification · 15:30 – now · 1h 12m` while
// the timer is open. The bar itself carries no text, so this is the only thing that
// names it, for a mouse and for a screen reader alike.
function getTrackedLabel(event, now) {
  const start = format(new Date(event.start), 'HH:mm')
  const end = isRunning(event) ? 'now' : format(new Date(effectiveEnd(event, now)), 'HH:mm')
  const separator = isRunning(event) ? ' – ' : '–'
  // The bar's stripes say "this looks wrong" but cannot say why, and nothing else on the
  // grid names the suspicion — so the label spells it out for a mouse and a screen reader.
  const warning = isLongSession(event, now) ? ' · over 12h — forgot to stop?' : ''

  return `${event.title} · ${start}${separator}${end} · ${formatDuration(durationMs(event, now))}${warning}`
}

export function CalendarGrid({
  anchorDate,
  calendarView,
  canEditEvent = () => false,
  events,
  now: nowMs,
  onCompleteReminder,
  onEventTimeChange,
  onHideEvent,
  preferences,
  secondaryTimeZones = [],
  sessionActions,
  timeZone: timeZoneProp,
  timeZoneCity: timeZoneCityProp
}) {
  const timeZone = resolveTimeZone(timeZoneProp)
  const timeZoneCity = timeZoneCityProp
  const days = getViewDays(calendarView, anchorDate, timeZone)
  const viewportRef = useRef(null)
  const todayRef = useRef(null)
  const timeScrollRef = useRef(null)
  // The grid used to keep its own minute timer for the current-time line. It now shares the
  // app's clock, so the line and a running session's bar move on the same tick.
  const now = useMemo(() => new Date(nowMs), [nowMs])
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
            deltaMinutes: event.allDay ? 0 : deltaMinutes,
            timeZone
          })
        : getResizeResult({
            start: event.start,
            end: event.end,
            edge: mode === 'resize-start' ? 'start' : 'end',
            deltaMinutes,
            timeZone
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
          deltaDays: keyEvent.key === 'ArrowLeft' ? -1 : 1,
          timeZone
        })
      } else if (keyEvent.shiftKey) {
        times = getResizeResult({
          start: event.start,
          end: event.end,
          edge: 'end',
          deltaMinutes,
          timeZone
        })
      } else {
        times = getMoveResult({ start: event.start, end: event.end, deltaMinutes, timeZone })
      }

      keyEvent.preventDefault()
      if (!hasSameTimes(event, times)) onEventTimeChange?.(event, times)
    },
    [canEditEvent, canResizeEvent, onEventTimeChange]
  )

  // The lane is reserved whenever the source is on, even on a day with nothing tracked,
  // so scheduled events keep the same width as you page through the weeks.
  const showTrackedLane = isSourceEnabled(preferences, 'timetracker')
  const layouts = days.map((day) =>
    buildDayLayout(events, day, { now: now.getTime(), timeZone })
  )
  const rangeContainsToday = days.some((day) => isToday(day))
  const currentTimeTop = (getCurrentMinutes(new TZDate(now.getTime(), timeZone)) / 60) * HOUR_HEIGHT

  // Two is what the gutter can carry before it starts eating the day columns.
  const secondaryRulerMarks = useMemo(
    () =>
      secondaryTimeZones.slice(0, MAX_SECONDARY_ZONES).map((entry) => ({
        ...entry,
        marks: buildSecondaryRulerMarks(days[0], timeZone, entry.zone),
        // One gutter cannot be right for every day of a week that crosses a clock change,
        // so the column header owns up to it instead of quietly drifting by an hour.
        offsetsDiffer: getZoneOffsetsDiffer(days, timeZone, entry.zone)
      })),
    [days, timeZone, secondaryTimeZones]
  )

  return (
    <section
      className={`calendar-grid${drag ? ' is-dragging' : ''}`}
      aria-label={formatViewLabel(calendarView, anchorDate, timeZone)}
    >
      <div className="calendar-grid-viewport" ref={viewportRef}>
        <div
          className="calendar-week"
          style={{
            '--calendar-day-count': days.length,
            '--calendar-secondary-zone-count': secondaryRulerMarks.length
          }}
        >
          <div className="calendar-week__day-headers">
            <div className="calendar-week__corner">
              <ZoneColumnHeader city={timeZoneCity} isPrimary zone={timeZone} />
              {secondaryRulerMarks.map((entry) => (
                <ZoneColumnHeader
                  city={entry.city}
                  key={entry.zone}
                  note={entry.note}
                  offsetsDiffer={entry.offsetsDiffer}
                  zone={entry.zone}
                />
              ))}
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
                      <EventPill
                        event={event}
                        onCompleteReminder={onCompleteReminder}
                        onHideEvent={onHideEvent}
                        preferences={preferences}
                        sessionActions={sessionActions}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="calendar-week__time-scroll" ref={timeScrollRef}>
            <div className="calendar-week__time-grid" style={{ height: 24 * HOUR_HEIGHT }}>
              <div className="calendar-week__time-labels">
                <div className="calendar-week__time-column is-primary">
                  {HOURS.map((hour) => (
                    <span
                      className="calendar-week__time-label"
                      key={hour}
                      style={{ top: hour * HOUR_HEIGHT }}
                    >
                      {String(hour).padStart(2, '0')}:00
                    </span>
                  ))}
                </div>
                {secondaryRulerMarks.map((entry) => (
                  <div className="calendar-week__time-column" key={entry.zone}>
                    {entry.marks.map((mark) => (
                      <span
                        className={`calendar-week__time-label${
                          mark.label === '00:00' ? ' is-midnight' : ''
                        }`}
                        key={mark.minute}
                        style={{ top: (mark.minute / 60) * HOUR_HEIGHT }}
                      >
                        {mark.label}
                        {mark.dayOffset !== 0 && (
                          <sup className="calendar-week__day-offset">
                            {mark.dayOffset > 0 ? `+${mark.dayOffset}` : `\u2212${-mark.dayOffset}`}
                          </sup>
                        )}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              {layouts.map((layout, dayIndex) => {
                const currentDay = isToday(days[dayIndex])
                return (
                  <div
                    className={`calendar-week__time-day${currentDay ? ' is-today' : ''}${
                      showTrackedLane ? ' has-tracked-lane' : ''
                    }`}
                    key={days[dayIndex].toISOString()}
                  >
                    {layout.timedEvents.map((position) => {
                      const event = position.event
                      const dragging = drag?.eventId === event.id
                      const geometry = dragging
                        ? getPreviewGeometry(drag.times, timeZone)
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
                            // The lane, when present, is carved off the right of the
                            // column before the overlap columns are shared out.
                            left: `calc((100% - var(--tracked-lane-total, 0px)) * ${
                              position.column / position.columnCount
                            })`,
                            width: `calc((100% - var(--tracked-lane-total, 0px)) / ${
                              position.columnCount
                            })`,
                            transform: dragging
                              ? `translateX(${drag.deltaDays * drag.dayWidth}px)`
                              : undefined
                          }}
                        >
                          <EventPill
                            event={event}
                            onCompleteReminder={onCompleteReminder}
                            onHideEvent={onHideEvent}
                            preferences={preferences}
                            sessionActions={sessionActions}
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
                    {showTrackedLane && (
                      <div className="calendar-week__tracked-lane">
                        {layout.trackedEvents.map((position) => {
                          const event = position.event
                          const color = getEventColor(event, preferences)

                          return (
                            <TrackedSessionBar
                              color={color}
                              event={event}
                              key={event.id}
                              label={getTrackedLabel(event, nowMs)}
                              long={isLongSession(event, nowMs)}
                              onHideEvent={onHideEvent}
                              running={isRunning(event)}
                              sessionActions={sessionActions}
                              style={{
                                top: (position.startMinutes / 60) * HOUR_HEIGHT,
                                height: (position.durationMinutes / 60) * HOUR_HEIGHT,
                                // A 4px gutter each side leaves the 14px bar of the
                                // mockup; the column split only ever kicks in for
                                // overlapping rows, which the tracker cannot produce.
                                left: `calc(4px + (100% - 8px) * ${
                                  position.column / position.columnCount
                                })`,
                                width: `calc((100% - 8px) / ${position.columnCount})`,
                                background: color
                              }}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {/* A whole-hour zone marks the lines the grid already draws, so only the
                  5:30/5:45 offsets earn a rule of their own. */}
              {secondaryRulerMarks.map((entry) =>
                entry.marks
                  .filter((mark) => mark.isOffGrid)
                  .map((mark) => (
                    <div
                      aria-hidden="true"
                      className="calendar-week__secondary-ruler"
                      key={`${entry.zone}-${mark.minute}`}
                      style={{ top: (mark.minute / 60) * HOUR_HEIGHT }}
                    />
                  ))
              )}
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
