import { useState } from 'react'
import {
  Button,
  ColorPicker,
  DropdownMenu,
  MenuGroup,
  SearchControl
} from '@wordpress/components'
import { moreVertical } from '@wordpress/icons'

const SOURCE_LABELS = {
  google: 'Google Calendar',
  trello: 'Trello',
  reminders: 'Reminders'
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

  if (status.ok) return `${sourceLabel}: ok`

  if (status.source === 'google') {
    return `${sourceLabel}: connect in Settings`
  }

  return `${sourceLabel}: ${status.lastError ?? 'error'}`
}

function CalendarRow({ calendar, onColorChange, onVisibilityChange }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div
      className={`calendar-sidebar__calendar${calendar.visible ? '' : ' is-hidden'}${
        isMenuOpen ? ' is-menu-open' : ''
      }`}
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
      <span className="calendar-sidebar__count">{calendar.count}</span>
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
          {() => (
            <MenuGroup label="Color">
              <div className="calendar-color-popover">
                <ColorPicker
                  color={calendar.color}
                  onChange={(color) => onColorChange(calendar.id, color)}
                  enableAlpha={false}
                />
              </div>
            </MenuGroup>
          )}
        </DropdownMenu>
      </div>
    </div>
  )
}

function SourceStatus({ status }) {
  const text = getStatusText(status)

  return (
    <div
      className={`calendar-sidebar__status ${status.ok ? 'is-ok' : 'is-error'}`}
      title={status.lastError ?? text}
    >
      <span className="calendar-sidebar__status-dot" aria-hidden="true" />
      <span>{text}</span>
    </div>
  )
}

export function CalendarSidebar({
  calendars,
  calendarCountBySource,
  hiddenEventCount,
  onColorChange,
  onOpenSettings,
  onVisibilityChange,
  searchQuery,
  setSearchQuery,
  statuses
}) {
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

            return (
              <section className="calendar-sidebar__section" key={source}>
                <h2>{label}</h2>
                {sourceCalendars.length > 0 ? (
                  sourceCalendars.map((calendar) => (
                    <CalendarRow
                      calendar={calendar}
                      key={calendar.id}
                      onColorChange={onColorChange}
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
                        !isGoogle &&
                        !isTrello &&
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
      <footer className="calendar-sidebar__footer">
        {statuses.map((status) => (
          <SourceStatus key={`${status.source}:${status.sourceAccountId ?? ''}`} status={status} />
        ))}
      </footer>
    </aside>
  )
}
