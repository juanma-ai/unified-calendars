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
import { seen } from '@wordpress/icons'

const SOURCE_LABELS = {
  google: 'Google Calendar',
  trello: 'Trello',
  reminders: 'Reminders'
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

function SourceStatus({ status, onReconnectGoogle }) {
  const label = status.sourceAccountId
    ? `${SOURCE_LABELS[status.source]} (${status.sourceAccountId})`
    : SOURCE_LABELS[status.source]

  return (
    <div className={`calendar-sidebar__status ${status.ok ? 'is-ok' : 'is-error'}`}>
      <span className="calendar-sidebar__status-dot" aria-hidden="true" />
      <span>{label}: {status.ok ? 'ok' : status.lastError ?? 'error'}</span>
      {status.source === 'google' && !status.ok && (
        <Button variant="link" onClick={() => onReconnectGoogle(status.sourceAccountId)}>
          Connect
        </Button>
      )}
    </div>
  )
}

export function CalendarSidebar({
  calendars,
  hiddenEventCount,
  onColorChange,
  onOpenHiddenEvents,
  onReconnectGoogle,
  onVisibilityChange,
  searchQuery,
  setSearchQuery,
  statuses
}) {
  return (
    <aside className="calendar-sidebar">
      <header className="calendar-sidebar__header">Calendar</header>
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
            if (sourceCalendars.length === 0) return null

            return (
              <section className="calendar-sidebar__section" key={source}>
                <h2>{label}</h2>
                {sourceCalendars.map((calendar, index) => (
                  <CalendarRow
                    calendar={calendar}
                    index={`${source}-${index}`}
                    key={calendar.id}
                    onColorChange={onColorChange}
                    onVisibilityChange={onVisibilityChange}
                  />
                ))}
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
            onReconnectGoogle={onReconnectGoogle}
          />
        ))}
      </footer>
    </aside>
  )
}
