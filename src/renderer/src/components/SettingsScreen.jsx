import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxControl,
  Flex,
  FlexBlock,
  FlexItem,
  TabPanel
} from '@wordpress/components'
import { arrowLeft } from '@wordpress/icons'

const SOURCE_NAMES = {
  google: 'Google Calendar',
  trello: 'Trello',
  reminders: 'Apple Reminders'
}

function StatusIndicator({ ok }) {
  return (
    <span className={`settings-status ${ok ? 'is-ok' : 'is-error'}`}>
      <span className="settings-status__dot" aria-hidden="true" />
      {ok ? 'Connected' : 'Needs attention'}
    </span>
  )
}

function GoogleConnectionCard({
  accounts,
  onConnect,
  onDisconnect,
  onReconnect,
  statuses
}) {
  const googleStatuses = statuses.filter((status) => status.source === 'google')
  const connected = googleStatuses.some((status) => status.ok)

  return (
    <Card className="settings-card">
      <CardHeader>
        <Flex>
          <FlexBlock><h2>Google Calendar</h2></FlexBlock>
          <FlexItem><StatusIndicator ok={connected} /></FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        {accounts.length > 0 ? (
          <div className="settings-connection-list">
            {accounts.map((account) => {
              const status = googleStatuses.find(({ sourceAccountId }) => sourceAccountId === account.id)
              return (
                <Flex className="settings-connection" key={account.id}>
                  <FlexBlock>
                    <strong>{account.label}</strong>
                    {account.email && account.email !== account.label && <p>{account.email}</p>}
                    {status && !status.ok && <p>{status.lastError ?? 'Connection failed'}</p>}
                  </FlexBlock>
                  <FlexItem>
                    {status?.ok ? (
                      <Button variant="secondary" isDestructive onClick={() => onDisconnect(account.id)}>
                        {account.legacy ? 'Disconnect' : 'Remove'}
                      </Button>
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
            <p>No Google accounts are connected. Add one account first, then enable the calendars you want.</p>
          </div>
        )}
        <Button variant="primary" onClick={onConnect}>Connect another account</Button>
      </CardBody>
    </Card>
  )
}

function ConnectionCard({ source, statuses }) {
  const sourceStatuses = statuses.filter((status) => status.source === source)
  const connected = sourceStatuses.length > 0 && sourceStatuses.every((status) => status.ok)

  return (
    <Card className="settings-card">
      <CardHeader>
        <Flex>
          <FlexBlock>
            <h2>{SOURCE_NAMES[source]}</h2>
          </FlexBlock>
          <FlexItem><StatusIndicator ok={connected} /></FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        {sourceStatuses.map((status) => (
          <Flex className="settings-connection" key={`${source}:${status.sourceAccountId ?? 'default'}`}>
            <FlexBlock>
              <strong>{status.sourceAccountId ?? SOURCE_NAMES[source]}</strong>
              {!status.ok && <p>{status.lastError ?? 'Connection failed'}</p>}
            </FlexBlock>
          </Flex>
        ))}
        {source === 'trello' && (
          <p>One Trello connection can provide every open board the account can access.</p>
        )}
        {source === 'reminders' && (
          <p>Access is controlled by macOS in Privacy &amp; Security → Reminders.</p>
        )}
      </CardBody>
    </Card>
  )
}

export function SettingsScreen({
  calendars,
  googleAccounts,
  hiddenEventCount,
  onBack,
  onConnectGoogle,
  onDisconnectGoogle,
  onOpenHiddenEvents,
  onReconnectGoogle,
  onVisibilityChange,
  statuses
}) {
  return (
    <main className="settings-screen">
      <header className="settings-header">
        <Button icon={arrowLeft} label="Back to calendar" onClick={onBack} />
        <div>
          <h1>Settings</h1>
          <p>Manage accounts, calendars, and event visibility.</p>
        </div>
      </header>

      <TabPanel
        className="settings-tabs"
        tabs={[
          { name: 'connections', title: 'Connections' },
          { name: 'calendars', title: 'Calendars' },
          { name: 'hidden-events', title: 'Hidden events' }
        ]}
      >
        {(tab) => {
          if (tab.name === 'calendars') {
            return (
              <Card className="settings-card">
                <CardHeader><h2>Available calendars</h2></CardHeader>
                <CardBody>
                  {calendars.length > 0 ? (
                    <>
                      <p>{calendars.length} calendars and boards are available.</p>
                      <div className="settings-calendar-list">
                        {calendars.map((calendar) => (
                          <Flex className="settings-calendar" key={calendar.id}>
                            <FlexItem>
                              <CheckboxControl
                                checked={calendar.visible}
                                onChange={(visible) => onVisibilityChange(calendar.id, visible)}
                                __nextHasNoMarginBottom
                              />
                            </FlexItem>
                            <FlexBlock>
                              <strong>{calendar.name}</strong>
                              <p>{calendar.sourceAccountName ?? SOURCE_NAMES[calendar.source]}</p>
                            </FlexBlock>
                            <FlexItem>{calendar.count} events this week</FlexItem>
                          </Flex>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="settings-empty-state">
                      <p>No calendars are available yet. Connect Google in the Connections tab, or add Trello credentials in `.env` and relaunch the app.</p>
                    </div>
                  )}
                </CardBody>
              </Card>
            )
          }

          if (tab.name === 'hidden-events') {
            return (
              <Card className="settings-card">
                <CardHeader><h2>Hidden events</h2></CardHeader>
                <CardBody>
                  <p>{hiddenEventCount} events or recurring series are hidden.</p>
                  <Button variant="secondary" onClick={onOpenHiddenEvents} disabled={!hiddenEventCount}>
                    Review hidden events
                  </Button>
                </CardBody>
              </Card>
            )
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
              {['trello', 'reminders'].map((source) => (
                <ConnectionCard
                  key={source}
                  source={source}
                  statuses={statuses}
                />
              ))}
            </div>
          )
        }}
      </TabPanel>
    </main>
  )
}
