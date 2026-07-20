import {
  Button,
  CheckboxControl,
  ColorPicker,
  Dropdown,
  Flex,
  FlexBlock,
  FlexItem,
  SearchControl
} from '@wordpress/components'
import { seen, settings } from '@wordpress/icons'

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

function CalendarRow({ calendar, index, onColorChange, onVisibilityChange }) {
  const checkboxId = `calendar-visibility-${index}`

  return (
    <Flex className="calendar-sidebar__calendar" gap={2} justify="flex-start">
      <FlexItem>
        <CheckboxControl
          id={checkboxId}
          checked={calendar.visible}
          onChange={(visible) => onVisibilityChange(calendar.id, visible)}
          __nextHasNoMarginBottom
        />
      </FlexItem>
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
        <label className="calendar-sidebar__calendar-name" htmlFor={checkboxId}>
          {calendar.name}
        </label>
      </FlexBlock>
      <FlexItem className="calendar-sidebar__count">{calendar.count}</FlexItem>
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
            const isGoogle = source === 'google'
            const isTrello = source === 'trello'

            return (
              <section className="calendar-sidebar__section" key={source}>
                <h2>{label}</h2>
                {sourceCalendars.length > 0 ? (
                  sourceCalendars.map((calendar, index) => (
                    <CalendarRow
                      calendar={calendar}
                      index={`${source}-${index}`}
                      key={calendar.id}
                      onColorChange={onColorChange}
                      onVisibilityChange={onVisibilityChange}
                    />
                  ))
                ) : (
                  <div className="calendar-sidebar__empty-state">
                    <p>
                      {isGoogle && 'No Google calendars are connected yet.'}
                      {isTrello && 'No Trello boards are available yet.'}
                      {!isGoogle && !isTrello && 'No calendars are available here yet.'}
                    </p>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={onOpenSettings}
                    >
                      {isGoogle ? 'Connect Google in Settings' : 'Open Settings'}
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
