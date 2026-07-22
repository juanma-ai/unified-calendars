import { useState } from 'react'
import {
  Button,
  ColorPicker,
  Dropdown,
  DropdownMenu,
  Flex,
  FlexBlock,
  FlexItem,
  MenuGroup,
  MenuItem,
  SearchControl
} from '@wordpress/components'
import { moreVertical, seen, settings, unseen } from '@wordpress/icons'

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
    <Flex
      className={`calendar-sidebar__calendar${calendar.visible ? '' : ' is-hidden'}${isMenuOpen ? ' is-menu-open' : ''}`}
      gap={2}
      justify="flex-start"
    >
      <FlexItem>
        <Dropdown
          contentClassName="calendar-color-popover"
          popoverProps={{ placement: 'right-start' }}
          renderToggle={({ onToggle }) => (
            <Button
              className="calendar-color-swatch"
              aria-label={`Change color for ${calendar.name}`}
              onClick={onToggle}
              style={{ '--calendar-color': calendar.color }}
            />
          )}
          renderContent={() => (
            <ColorPicker
              color={calendar.color}
              onChange={(color) => onColorChange(calendar.id, color)}
              enableAlpha={false}
            />
          )}
        />
      </FlexItem>
      <FlexBlock>
        <span className="calendar-sidebar__calendar-name">
          {calendar.name}
        </span>
      </FlexBlock>
      <FlexItem className="calendar-sidebar__count">{calendar.count}</FlexItem>
      <FlexItem className="calendar-sidebar__calendar-menu">
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
            <MenuGroup>
              <MenuItem
                icon={calendar.visible ? unseen : seen}
                onClick={() => {
                  onVisibilityChange(calendar.id, !calendar.visible)
                  onClose()
                }}
              >
                {calendar.visible ? 'Hide' : 'Show'}
              </MenuItem>
            </MenuGroup>
          )}
        </DropdownMenu>
      </FlexItem>
    </Flex>
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
  onOpenHiddenEvents,
  onOpenSettings,
  onReconnectGoogle,
  onVisibilityChange,
  searchQuery,
  setSearchQuery,
  statuses
}) {
  return (
    <aside className="calendar-sidebar">
      <header className="calendar-sidebar__header">
        <span>Calendar</span>
        <Button
          icon={settings}
          label="Open settings"
          text="Settings"
          onClick={onOpenSettings}
          showTooltip
          variant="tertiary"
        />
      </header>
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
            const hasAvailableCalendars = Boolean(calendarCountBySource[source])
            const isGoogle = source === 'google'
            const isTrello = source === 'trello'

            return (
              <section className="calendar-sidebar__section" key={source}>
                <h2>{label}</h2>
                {sourceCalendars.length > 0 ? (
                  sourceCalendars.map((calendar, index) => (
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
                      {!hasAvailableCalendars && isGoogle && 'No Google calendars are connected yet.'}
                      {!hasAvailableCalendars && isTrello && 'No Trello boards are available yet.'}
                      {!hasAvailableCalendars && !isGoogle && !isTrello && 'No calendars are available here yet.'}
                    </p>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={onOpenSettings}
                    >
                      {hasAvailableCalendars ? 'Manage calendars' : isGoogle ? 'Connect Google in Settings' : 'Open Settings'}
                    </Button>
                  </div>
                )}
              </section>
            )
          })}

          {hiddenEventCount > 0 && (
            <Button icon={seen} variant="tertiary" onClick={onOpenHiddenEvents}>
              Hidden events ({hiddenEventCount})
            </Button>
          )}
        </div>
      </div>
      <footer className="calendar-sidebar__footer">
        {statuses.map((status) => (
          <SourceStatus
            key={`${status.source}:${status.sourceAccountId ?? ''}`}
            status={status}
          />
        ))}
      </footer>
    </aside>
  )
}
