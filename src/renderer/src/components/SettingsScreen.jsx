import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  FlexBlock,
  FlexItem,
  CheckboxControl,
  SearchControl,
  TabPanel
} from '@wordpress/components'
import { useState } from 'react'
import { format } from 'date-fns'

const SOURCE_NAMES = {
  google: 'Google Calendar',
  trello: 'Trello',
  reminders: 'Apple Reminders',
  timetracker: 'Time Tracker'
}

function ConnectionBadge({ ok }) {
  return (
    <span className={`settings-badge ${ok ? 'is-ok' : 'is-error'}`}>
      {ok ? 'Connected' : 'Needs attention'}
    </span>
  )
}

function GoogleConnectionCard({ accounts, onConnect, onDisconnect, onReconnect, statuses }) {
  const googleStatuses = statuses.filter((status) => status.source === 'google')
  const connected = googleStatuses.some((status) => status.ok)

  return (
    <Card className="settings-card">
      <CardHeader>
        <Flex>
          <FlexBlock><h2>Google Calendar</h2></FlexBlock>
          <FlexItem><ConnectionBadge ok={connected} /></FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        {accounts.length > 0 ? (
          <div className="settings-connection-list">
            {accounts.map((account) => {
              const status = googleStatuses.find(
                ({ sourceAccountId }) => sourceAccountId === account.id
              )
              return (
                <Flex className="settings-connection" key={account.id}>
                  <FlexBlock>
                    <strong>{account.label}</strong>
                    {account.email && account.email !== account.label && <p>{account.email}</p>}
                    {status && !status.ok && <p>{status.lastError ?? 'Connection failed'}</p>}
                    {status?.ok && !account.canEdit && (
                      <p>Read-only access. Reconnect to move and resize events from the calendar.</p>
                    )}
                  </FlexBlock>
                  <FlexItem>
                    {status?.ok ? (
                      <Flex gap={2} justify="flex-end">
                        {!account.canEdit && (
                          <Button variant="secondary" onClick={() => onReconnect(account.id)}>
                            Reconnect to enable editing
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          isDestructive
                          onClick={() => onDisconnect(account.id)}
                        >
                          {account.legacy ? 'Disconnect' : 'Remove'}
                        </Button>
                      </Flex>
                    ) : (
                      <Button variant="secondary" onClick={() => onReconnect(account.id)}>
                        Connect
                      </Button>
                    )}
                  </FlexItem>
                </Flex>
              )
            })}
          </div>
        ) : (
          <div className="settings-empty-state">
            <p>
              No Google accounts are connected. Add one account first, then enable the calendars you
              want.
            </p>
          </div>
        )}
        <Button variant="secondary" onClick={onConnect}>
          Connect another account
        </Button>
      </CardBody>
    </Card>
  )
}

function ConnectionCard({ source, statuses }) {
  const sourceStatuses = statuses.filter((status) => status.source === source)
  // A source can be ok while having nothing behind it: the time tracker reports ok with
  // `detected: false` when there is no database, because a missing tracker is not a
  // failure worth putting in the sidebar footer. It must not read as Connected here.
  const connected =
    sourceStatuses.length > 0 &&
    sourceStatuses.every((status) => status.ok && status.detected !== false)

  return (
    <Card className="settings-card">
      <CardHeader>
        <Flex>
          <FlexBlock>
            <h2>{SOURCE_NAMES[source]}</h2>
          </FlexBlock>
          <FlexItem><ConnectionBadge ok={connected} /></FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        {sourceStatuses
          .filter((status) => !status.ok)
          .map((status) => (
            <Flex
              className="settings-connection"
              key={`${source}:${status.sourceAccountId ?? 'default'}`}
            >
              <FlexBlock>
                <strong>{status.sourceAccountId ?? SOURCE_NAMES[source]}</strong>
                <p>{status.lastError ?? 'Connection failed'}</p>
              </FlexBlock>
            </Flex>
          ))}
        {source === 'trello' && (
          <p>One Trello connection provides every open board the account can access.</p>
        )}
        {source === 'reminders' && (
          <p>Access is controlled by macOS in Privacy &amp; Security → Reminders.</p>
        )}
        {source === 'timetracker' && (
          <p>
            Reads <code>~/.timetracker/timetracker.db</code> — nothing to connect.
            {!connected && ' No tracker database was found there.'}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

function getConnectionLabel(calendar) {
  const account = calendar.sourceAccountName ?? calendar.sourceAccountId
  return account ? `${SOURCE_NAMES[calendar.source]} · ${account}` : SOURCE_NAMES[calendar.source]
}

function groupByConnection(calendars) {
  const groups = new Map()

  for (const calendar of calendars) {
    const key = `${calendar.source}:${calendar.sourceAccountId ?? 'default'}`
    if (!groups.has(key)) {
      groups.set(key, { key, label: getConnectionLabel(calendar), calendars: [] })
    }
    groups.get(key).calendars.push(calendar)
  }

  return [...groups.values()]
}

function CalendarsTab({ calendars, onVisibilityChange }) {
  const [filter, setFilter] = useState('')

  if (calendars.length === 0) {
    return (
      <div className="settings-empty-state">
        <p>
          No calendars are available yet. Connect Google in the Connections tab, or add Trello
          credentials in `.env` and relaunch the app.
        </p>
      </div>
    )
  }

  const query = filter.trim().toLocaleLowerCase()
  const matching = query
    ? calendars.filter((calendar) => calendar.name.toLocaleLowerCase().includes(query))
    : calendars
  const groups = groupByConnection(matching)
  const selectedCount = calendars.filter((calendar) => calendar.sidebarVisible).length

  return (
    <div className="settings-calendar-list">
      <p className="settings-calendar-list__intro">
        Select the calendars and boards that appear in the sidebar. {selectedCount} of{' '}
        {calendars.length} selected.
      </p>

      <SearchControl
        className="settings-calendar-list__search"
        label="Filter calendars"
        placeholder="Filter calendars"
        value={filter}
        onChange={setFilter}
        __nextHasNoMarginBottom
      />

      {groups.length === 0 ? (
        <p className="settings-calendar-list__empty">No calendars match “{filter}”.</p>
      ) : (
        groups.map((group) => (
          <section className="settings-calendar-group" key={group.key}>
            <h3>{group.label}</h3>
            {group.calendars.map((calendar) => (
              // Wrapping the row in a label makes the whole row — name included — toggle the
              // checkbox it contains, without relying on a `for`/`id` association.
              <label className="settings-calendar" key={calendar.id}>
                <CheckboxControl
                  checked={calendar.sidebarVisible}
                  onChange={(visible) => onVisibilityChange(calendar.id, visible)}
                  __nextHasNoMarginBottom
                />
                <span
                  className="calendar-swatch"
                  aria-hidden="true"
                  style={{ '--calendar-color': calendar.color }}
                />
                <span className="settings-calendar__name">{calendar.name}</span>
              </label>
            ))}
          </section>
        ))
      )}
    </div>
  )
}

function HiddenEventsTab({ hiddenEvents, onRestore }) {
  if (hiddenEvents.length === 0) {
    return (
      <div className="settings-empty-state">
        <p>No events are hidden. Hide one from its menu in the calendar to see it listed here.</p>
      </div>
    )
  }

  return (
    <div className="settings-hidden-events">
      <p className="settings-hidden-events__intro">
        {hiddenEvents.length} {hiddenEvents.length === 1 ? 'event is' : 'events are'} hidden from the
        calendar view.
      </p>
      {hiddenEvents.map((event) => (
        <Flex className="settings-hidden-event" key={event.key}>
          <FlexBlock>
            <strong>{event.title}</strong>
            <p>
              {event.start ? format(new Date(event.start), 'MMM d, yyyy') : null}
              {event.scope === 'series' ? ' · Entire series' : ''}
              {event.calendarName ? ` · ${event.calendarName}` : ''}
            </p>
          </FlexBlock>
          <FlexItem>
            <Button variant="secondary" onClick={() => onRestore(event.key)}>
              Restore
            </Button>
          </FlexItem>
        </Flex>
      ))}
    </div>
  )
}

export function SettingsScreen({
  calendars,
  googleAccounts,
  hiddenEvents,
  initialTab = 'connections',
  onBack,
  onConnectGoogle,
  onDisconnectGoogle,
  onReconnectGoogle,
  onRestoreHiddenEvent,
  onVisibilityChange,
  statuses
}) {
  return (
    <main className="settings-screen">
      <header className="settings-header">
        <Button variant="link" onClick={onBack}>
          Back to calendar
        </Button>
        <h1>Settings</h1>
        <p>Manage accounts, calendars, and event visibility.</p>
      </header>

      <TabPanel
        className="settings-tabs"
        initialTabName={initialTab}
        tabs={[
          { name: 'connections', title: 'Connections' },
          { name: 'calendars', title: 'Calendars' },
          { name: 'hidden-events', title: 'Hidden events' }
        ]}
      >
        {(tab) => {
          if (tab.name === 'calendars') {
            return <CalendarsTab calendars={calendars} onVisibilityChange={onVisibilityChange} />
          }

          if (tab.name === 'hidden-events') {
            return <HiddenEventsTab hiddenEvents={hiddenEvents} onRestore={onRestoreHiddenEvent} />
          }

          return (
            <div className="settings-card-grid">
              <GoogleConnectionCard
                accounts={googleAccounts}
                onConnect={onConnectGoogle}
                onDisconnect={onDisconnectGoogle}
                onReconnect={onReconnectGoogle}
                statuses={statuses}
              />
              {['trello', 'reminders', 'timetracker'].map((source) => (
                <ConnectionCard key={source} source={source} statuses={statuses} />
              ))}
            </div>
          )
        }}
      </TabPanel>
    </main>
  )
}
