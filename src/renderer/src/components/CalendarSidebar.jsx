import { useMemo, useState } from 'react'
import {
  Button,
  ColorPicker,
  DropdownMenu,
  FormToggle,
  MenuGroup,
  MenuItem,
  SearchControl
} from '@wordpress/components'
import { check, external, moreVertical } from '@wordpress/icons'

import { getCalendarLink } from '../calendarLinks.js'
import { formatTrackedRangeLabel } from '../calendarViews.js'
import { formatDuration } from '../trackedTime.js'
import { buildTrackedSummary, trackedMsByCalendar } from '../trackedSummary.js'

const SOURCE_LABELS = {
  google: 'Google Calendar',
  trello: 'Trello',
  linear: 'Linear',
  reminders: 'Reminders',
  timetracker: 'Time Tracker',
  wallos: 'Wallos'
}

function compactAccountLabel(value) {
  if (!value) return ''
  if (!value.includes('@')) return value
  return value.split('@')[0]
}

function getStatusText(status) {
  const accountLabel = compactAccountLabel(status.sourceAccountName ?? status.sourceAccountId)
  const sourceLabel = accountLabel
    ? `${SOURCE_LABELS[status.source]} (${accountLabel})`
    : SOURCE_LABELS[status.source]

  if (status.source === 'google') {
    return `${sourceLabel}: connect in Settings`
  }

  return `${sourceLabel}: ${status.lastError ?? 'error'}`
}

function CalendarRow({ calendar, countLabel, onColorChange, onVisibilityChange, onFocusedToggle }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const link = getCalendarLink(calendar)

  return (
    <div
      className={`calendar-sidebar__calendar${calendar.visible ? '' : ' is-hidden'}${
        calendar.focused ? ' is-focused' : ''
      }${isMenuOpen ? ' is-menu-open' : ''}`}
    >
      <Button
        className="calendar-sidebar__calendar-toggle"
        aria-pressed={calendar.visible}
        label={calendar.visible ? `Hide ${calendar.name}` : `Show ${calendar.name}`}
        onClick={() => onVisibilityChange(calendar.id, !calendar.visible)}
      >
        <span
          className="calendar-swatch"
          aria-hidden="true"
          style={{ '--calendar-color': calendar.color }}
        />
        <span className="calendar-sidebar__calendar-name">{calendar.name}</span>
      </Button>
      <span
        className={`calendar-sidebar__count${countLabel ? ' calendar-sidebar__duration' : ''}`}
      >
        {countLabel ?? calendar.count}
      </span>
      <div className="calendar-sidebar__calendar-menu">
        <DropdownMenu
          icon={moreVertical}
          label="Options"
          onToggle={setIsMenuOpen}
          popoverProps={{ placement: 'right-start' }}
          toggleProps={{
            className: 'block-editor-list-view-block__menu',
            size: 'small'
          }}
        >
          {({ onClose }) => (
            <>
              <MenuGroup>
                <MenuItem
                  icon={calendar.focused ? check : null}
                  onClick={() => {
                    onFocusedToggle(calendar.id)
                    onClose()
                  }}
                >
                  Display only this calendar
                </MenuItem>
                {link && (
                  <MenuItem
                    icon={external}
                    onClick={() => {
                      window.calendarAPI.openExternal(link.url)
                      onClose()
                    }}
                  >
                    {link.label}
                  </MenuItem>
                )}
              </MenuGroup>
              <MenuGroup label="Color">
                <div className="calendar-color-popover">
                  <ColorPicker
                    color={calendar.color}
                    onChange={(color) => onColorChange(calendar.id, color)}
                    enableAlpha={false}
                  />
                </div>
              </MenuGroup>
            </>
          )}
        </DropdownMenu>
      </div>
    </div>
  )
}

/**
 * The tracked-time report under the project rows: total for the range on screen, a stacked
 * proportion bar and, while a timer runs, the open session. The bar is decorative — every
 * number in it is already spelled out in the lines around it — so it is hidden from
 * assistive tech rather than described twice.
 */
function TrackedSummary({ anchorDate, calendarView, summary }) {
  return (
    <div className="calendar-sidebar__tracked-summary">
      <div className="calendar-sidebar__tracked-total">
        <span>{formatTrackedRangeLabel(calendarView, anchorDate)}</span>
        <strong>{formatDuration(summary.totalMs)}</strong>
      </div>
      <div className="calendar-sidebar__tracked-bar" aria-hidden="true">
        {summary.segments.map((segment) => (
          <span
            key={segment.calendarId}
            style={{ width: `${segment.percent}%`, background: segment.color }}
          />
        ))}
      </div>
      {summary.running && (
        <p className="calendar-sidebar__tracked-running" style={{ color: summary.running.color }}>
          <span className="calendar-sidebar__tracked-dot" aria-hidden="true" />
          {`${summary.running.project} running · ${formatDuration(summary.running.ms)}`}
        </p>
      )}
    </div>
  )
}

function SourceStatus({ status }) {
  const text = getStatusText(status)

  return (
    <div className="calendar-sidebar__status is-error" title={status.lastError ?? text}>
      <span className="calendar-sidebar__status-dot" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}

export function CalendarSidebar({
  anchorDate,
  calendars,
  calendarCountBySource,
  calendarView,
  hiddenEventCount,
  now,
  onColorChange,
  onFocusedToggle,
  onOpenSettings,
  onSourceEnabledChange,
  onVisibilityChange,
  searchQuery,
  setSearchQuery,
  statuses,
  trackedEnabled = true,
  trackedEvents = []
}) {
  const failingStatuses = statuses.filter((status) => !status.ok)

  const trackedColors = useMemo(
    () =>
      Object.fromEntries(
        calendars
          .filter((calendar) => calendar.source === 'timetracker')
          .map((calendar) => [calendar.id, calendar.color])
      ),
    [calendars]
  )
  // Row durations count every tracked session in the range, so a hidden project still
  // says how much it holds. The summary below takes only the visible ones, which is what
  // keeps its total and its bar matching the calendar.
  const rowDurations = useMemo(() => trackedMsByCalendar(trackedEvents, now), [trackedEvents, now])
  const visibleTrackedIds = useMemo(
    () =>
      new Set(
        calendars
          .filter((calendar) => calendar.source === 'timetracker' && calendar.visible)
          .map((calendar) => calendar.id)
      ),
    [calendars]
  )
  const summary = useMemo(
    () =>
      buildTrackedSummary(
        trackedEvents.filter((event) => visibleTrackedIds.has(event.calendarId)),
        trackedColors,
        now
      ),
    [now, trackedColors, trackedEvents, visibleTrackedIds]
  )

  return (
    <aside className="calendar-sidebar">
      <div className="calendar-sidebar__body">
        <SearchControl
          label="Search events"
          placeholder="Search events"
          value={searchQuery}
          onChange={setSearchQuery}
          __nextHasNoMarginBottom
        />

        <div className="calendar-sidebar__scroll-area">
          {Object.entries(SOURCE_LABELS).map(([source, label]) => {
            const sourceCalendars = calendars.filter((calendar) => calendar.source === source)
            const hasAvailableCalendars = Boolean(calendarCountBySource?.[source])
            const isGoogle = source === 'google'
            const isTrello = source === 'trello'
            const isTimetracker = source === 'timetracker'

            return (
              <section
                className={`calendar-sidebar__section${
                  isTimetracker ? ' calendar-sidebar__section--tracked' : ''
                }${isTimetracker && !trackedEnabled ? ' is-source-off' : ''}`}
                key={source}
              >
                <div className="calendar-sidebar__section-header">
                  <h2>{label}</h2>
                  {isTimetracker && (
                    <FormToggle
                      aria-label="Show tracked time"
                      checked={trackedEnabled}
                      onChange={() => onSourceEnabledChange(source, !trackedEnabled)}
                    />
                  )}
                </div>
                {sourceCalendars.length > 0 ? (
                  sourceCalendars.map((calendar) => (
                    <CalendarRow
                      calendar={calendar}
                      countLabel={
                        isTimetracker
                          ? formatDuration(rowDurations[calendar.id] ?? 0)
                          : undefined
                      }
                      key={calendar.id}
                      onColorChange={onColorChange}
                      onFocusedToggle={onFocusedToggle}
                      onVisibilityChange={onVisibilityChange}
                    />
                  ))
                ) : (
                  <div className="calendar-sidebar__empty-state">
                    <p>
                      {hasAvailableCalendars && `${label} calendars are hidden from the sidebar.`}
                      {!hasAvailableCalendars &&
                        isGoogle &&
                        'No Google calendars are connected yet.'}
                      {!hasAvailableCalendars && isTrello && 'No Trello boards are available yet.'}
                      {!hasAvailableCalendars &&
                        source === 'linear' &&
                        'No Linear issues are available yet.'}
                      {!hasAvailableCalendars &&
                        isTimetracker &&
                        'No tracked projects yet — start a timer in Time Tracker.'}
                      {!hasAvailableCalendars &&
                        !isGoogle &&
                        !isTrello &&
                        !isTimetracker &&
                        source !== 'linear' &&
                        'No calendars connected here yet.'}
                    </p>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => onOpenSettings(hasAvailableCalendars ? 'calendars' : undefined)}
                    >
                      {hasAvailableCalendars
                        ? 'Manage calendars'
                        : isGoogle
                          ? 'Connect Google in Settings'
                          : 'Open settings'}
                    </Button>
                  </div>
                )}
                {isTimetracker && sourceCalendars.length > 0 && (
                  <p className="calendar-sidebar__tracked-hint">
                    Click a project to hide it on the calendar.
                  </p>
                )}
                {isTimetracker && trackedEnabled && summary.segments.length > 0 && (
                  <TrackedSummary
                    anchorDate={anchorDate}
                    calendarView={calendarView}
                    summary={summary}
                  />
                )}
              </section>
            )
          })}

          <div className="calendar-sidebar__hidden-events">
            <Button variant="link" onClick={() => onOpenSettings('hidden-events')}>
              Hidden events
            </Button>
            <span className="calendar-sidebar__count">{hiddenEventCount}</span>
          </div>
        </div>
      </div>
      {failingStatuses.length > 0 && (
        <footer className="calendar-sidebar__footer">
          {failingStatuses.map((status) => (
            <SourceStatus key={`${status.source}:${status.sourceAccountId ?? ''}`} status={status} />
          ))}
        </footer>
      )}
    </aside>
  )
}
