import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  FlexBlock,
  FlexItem,
  CheckboxControl,
  TextControl,
  Notice,
  SearchControl,
  TabPanel
} from '@wordpress/components'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { getIpcErrorMessage } from '../ipcErrors.js'

const SOURCE_NAMES = {
  google: 'Google Calendar',
  trello: 'Trello',
  reminders: 'Apple Reminders',
  timetracker: 'Time Tracker'
}

function ConnectionBadge({ ok, okLabel = 'Connected', okModifier = 'is-ok' }) {
  return (
    <span className={`settings-badge ${ok ? okModifier : 'is-error'}`}>
      {ok ? okLabel : 'Needs attention'}
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
      </CardBody>
    </Card>
  )
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}


/**
 * Projects used to live only in projects.txt, edited by hand through the SwiftBar
 * plugin's "Edit projects…" item. The plugin is being retired, so this is now the only
 * way to manage them.
 */
function TrackerProjects({ onSourceDataChanged }) {
  const [projects, setProjects] = useState(null)
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    window.calendarAPI
      .listProjects()
      .then((list) => active && setProjects(list))
      .catch((err) => active && setError(getIpcErrorMessage(err)))
    return () => {
      active = false
    }
  }, [])

  const run = (action) => {
    setBusy(true)
    setError(null)
    return action()
      .then((list) => {
        setProjects(list)
        // A rename rewrites past entries and their calendar id, so the grid has to be
        // repopulated for the blocks to keep their colour and their name.
        onSourceDataChanged?.()
        return list
      })
      .catch((err) => setError(getIpcErrorMessage(err)))
      .finally(() => setBusy(false))
  }

  const submitAdd = (event) => {
    event.preventDefault()
    if (!draft.trim()) return
    run(() => window.calendarAPI.addProject(draft)).then(() => setDraft(''))
  }

  const submitRename = (event) => {
    event.preventDefault()
    const from = renaming
    run(() => window.calendarAPI.renameProject(from, renameDraft)).then(() => setRenaming(null))
  }

  if (!projects) return null

  return (
    <div className="settings-projects">
      <h3 className="settings-projects__title">Projects</h3>

      {error && (
        <Notice status="error" isDismissible onRemove={() => setError(null)}>
          {error}
        </Notice>
      )}

      {projects.length === 0 && (
        <p className="settings-timetracker__note">
          No projects yet. Add one to start tracking against it.
        </p>
      )}

      <ul className="settings-projects__list">
        {projects.map((project) => (
          <li className="settings-projects__row" key={project}>
            {renaming === project ? (
              <form className="settings-projects__rename" onSubmit={submitRename}>
                <TextControl
                  __nextHasNoMarginBottom
                  label={`New name for ${project}`}
                  hideLabelFromVision
                  value={renameDraft}
                  onChange={setRenameDraft}
                  autoFocus
                />
                <Button variant="primary" size="small" type="submit" disabled={busy}>
                  Save
                </Button>
                <Button variant="tertiary" size="small" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <span className="settings-projects__name">{project}</span>
                <Button
                  variant="tertiary"
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    setRenaming(project)
                    setRenameDraft(project)
                  }}
                >
                  Rename
                </Button>
                <Button
                  variant="tertiary"
                  size="small"
                  isDestructive
                  disabled={busy}
                  onClick={() => run(() => window.calendarAPI.removeProject(project))}
                >
                  Remove
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      <form className="settings-projects__add" onSubmit={submitAdd}>
        <TextControl
          __nextHasNoMarginBottom
          label="Add a project"
          hideLabelFromVision
          placeholder="New project"
          value={draft}
          onChange={setDraft}
        />
        <Button variant="secondary" type="submit" disabled={busy || !draft.trim()}>
          Add
        </Button>
      </form>

      <p className="settings-timetracker__note">
        Removing a project only stops it being offered — past sessions keep their name and
        stay on the calendar. Renaming moves them, their notes file and their colour with it.
      </p>
    </div>
  )
}

/**
 * The timer lives in the menu bar, so it is only there if the app is. This replaces
 * SwiftBar starting with the machine.
 */
function LaunchAtLogin() {
  const [enabled, setEnabled] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    window.calendarAPI
      .getLaunchAtLogin()
      .then((value) => active && setEnabled(value))
      .catch(() => active && setEnabled(false))
    return () => {
      active = false
    }
  }, [])

  if (enabled === null) return null

  return (
    <div className="settings-projects">
      <CheckboxControl
        __nextHasNoMarginBottom
        label="Open Unified Calendar at login"
        help="The timer is in the menu bar, so it is only available while the app is running. Packaged builds only."
        checked={enabled}
        onChange={(next) => {
          setError(null)
          window.calendarAPI
            .setLaunchAtLogin(next)
            .then(setEnabled)
            .catch((err) => setError(getIpcErrorMessage(err)))
        }}
      />
      {error && <p className="settings-timetracker__stats">{error}</p>}
    </div>
  )
}

/**
 * The time tracker has nothing to authenticate, so its card explains where the data comes
 * from instead of offering a Connect button. The stats come from `timetracker:getStats`
 * rather than the events already in the renderer: those cover whatever range the grid is
 * showing (a day, a month, a year), and this line says "this week".
 */
function TimeTrackerCard({ statuses, onSourceDataChanged }) {
  const status = statuses.find(({ source }) => source === 'timetracker')
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Reading the stats spawns sqlite3, so it can still be in flight when the user leaves
  // Settings again.
  useEffect(() => {
    let active = true

    window.calendarAPI
      .getTimetrackerStats()
      .then((result) => active && setStats(result))
      .catch((err) => active && setError(getIpcErrorMessage(err)))

    return () => {
      active = false
    }
  }, [])

  // A missing database is not a failure — the sidebar stays quiet about it — but it must
  // not read as Detected here. Once the stats have loaded they are the fresher answer:
  // they reflect the folder that was just picked, before the grid has refetched.
  const detected = stats
    ? stats.detected && !stats.lastError
    : Boolean(status) && status.ok !== false && status.detected !== false

  const handleChangeFolder = () => {
    setBusy(true)
    setError(null)
    window.calendarAPI
      .chooseTimetrackerFolder()
      .then((result) => {
        if (result?.cancelled) return
        setStats(result.stats)
        // The main process already invalidated the source cache; this repopulates the grid
        // from it so the new folder's sessions appear without a restart.
        onSourceDataChanged?.()
      })
      .catch((err) => setError(getIpcErrorMessage(err)))
      .finally(() => setBusy(false))
  }

  return (
    <Card className="settings-card">
      <CardHeader>
        <Flex>
          <FlexBlock>
            <h2>{SOURCE_NAMES.timetracker}</h2>
          </FlexBlock>
          <FlexItem>
            <ConnectionBadge ok={detected} okLabel="Detected" okModifier="is-detected" />
          </FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        {error && (
          <Notice status="error" isDismissible onRemove={() => setError(null)}>
            {error}
          </Notice>
        )}
        <Flex align="flex-start" gap={4}>
          <FlexBlock>
            <p>
              Reads{' '}
              <code className="settings-timetracker__path">
                {stats?.displayPath ?? '~/.timetracker/timetracker.db'}
              </code>{' '}
              — nothing to connect.
              {!detected && ' No tracker database was found there.'}
            </p>
            {detected && stats && (
              <p className="settings-timetracker__stats">
                {pluralize(stats.projectCount, 'project')} ·{' '}
                {pluralize(stats.sessionCount, 'session')} this week
                {status?.lastSyncedAt
                  ? ` · last read ${format(new Date(status.lastSyncedAt), 'HH:mm')}`
                  : ''}
              </p>
            )}
            {stats?.lastError && <p className="settings-timetracker__stats">{stats.lastError}</p>}
            <p className="settings-timetracker__note">
              The calendar reads and writes this database. Point it somewhere else and both
              follow — sessions started from the menu bar land in the folder shown here.
            </p>
          </FlexBlock>
          <FlexItem>
            <Button variant="secondary" onClick={handleChangeFolder} disabled={busy}>
              Change folder
            </Button>
          </FlexItem>
        </Flex>
        {detected && <TrackerProjects onSourceDataChanged={onSourceDataChanged} />}
        <LaunchAtLogin />
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
  onSourceDataChanged,
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
              {['trello', 'reminders'].map((source) => (
                <ConnectionCard key={source} source={source} statuses={statuses} />
              ))}
              <TimeTrackerCard statuses={statuses} onSourceDataChanged={onSourceDataChanged} />
            </div>
          )
        }}
      </TabPanel>
    </main>
  )
}
