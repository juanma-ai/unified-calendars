import {
  Button,
  ButtonGroup,
  Dropdown,
  Spinner,
  __experimentalToggleGroupControl as ToggleGroupControl,
  __experimentalToggleGroupControlOption as ToggleGroupControlOption
} from '@wordpress/components'
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { formatViewLabel, navigateView, VIEW_LABELS, VIEWS } from '../calendarViews.js'
import {
  formatTimeZoneLabel,
  formatTimeZoneReference,
  formatZoneName
} from '../calendarTimeZones.js'

// Read-only on purpose: zones are managed in Settings, so there is one list to keep right
// rather than two screens that can disagree.
function TimeZoneControl({ onOpenSettings, secondaryTimeZones, timeZone, timeZoneCity }) {
  const now = new Date()

  return (
    <Dropdown
      className="app-header__timezone-control"
      popoverProps={{ placement: 'bottom-end' }}
      renderToggle={({ onToggle }) => (
        <Button variant="secondary" onClick={onToggle}>
          {formatTimeZoneLabel(timeZone, timeZoneCity, now)}
        </Button>
      )}
      renderContent={() => (
        <div className="app-header__timezone-popover">
          <ul className="app-header__timezone-list">
            {[{ zone: timeZone, city: timeZoneCity, primary: true }, ...secondaryTimeZones].map(
              (entry) => (
                <li
                  className={`app-header__timezone${entry.primary ? ' is-primary' : ''}`}
                  key={entry.zone}
                >
                  <span className="app-header__timezone-time">
                    {format(new TZDate(now, entry.zone), 'HH:mm')}
                  </span>
                  <span className="app-header__timezone-name">
                    {formatZoneName(entry.zone, entry.city)}
                    {entry.primary && <em>primary</em>}
                  </span>
                  <span className="app-header__timezone-offset">
                    {formatTimeZoneReference(entry.zone, now)}
                  </span>
                  {entry.note && <span className="app-header__timezone-note">{entry.note}</span>}
                </li>
              )
            )}
          </ul>
          <Button
            className="app-header__timezone-manage"
            onClick={() => onOpenSettings('time-zones')}
            variant="secondary"
          >
            Manage time zones
          </Button>
        </div>
      )}
    />
  )
}

export function AppHeader({
  anchorDate,
  calendarView,
  onNavigate,
  onOpenSettings,
  onRefresh,
  onViewChange,
  refreshing,
  secondaryTimeZones,
  timeZone,
  timeZoneCity
}) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <h1>Calendar</h1>
        <Button variant="link" onClick={() => onOpenSettings()}>
          Settings
        </Button>
      </div>

      <div className="app-header__navigation">
        <ButtonGroup className="app-header__week-nav">
          <Button
            variant="secondary"
            onClick={() => onNavigate(navigateView(calendarView, anchorDate, -1))}
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            onClick={() => onNavigate(navigateView(calendarView, anchorDate, 'today'))}
          >
            Today
          </Button>
          <Button
            variant="secondary"
            onClick={() => onNavigate(navigateView(calendarView, anchorDate, 1))}
          >
            Next
          </Button>
        </ButtonGroup>
        <p className="app-header__range">{formatViewLabel(calendarView, anchorDate, timeZone)}</p>
      </div>

      <div className="app-header__actions">
        <TimeZoneControl
          onOpenSettings={onOpenSettings}
          secondaryTimeZones={secondaryTimeZones}
          timeZone={timeZone}
          timeZoneCity={timeZoneCity}
        />
        <ToggleGroupControl
          __next40pxDefaultSize
          __nextHasNoMarginBottom
          className="app-header__view-switcher"
          hideLabelFromVision
          isBlock
          label="Calendar view"
          onChange={onViewChange}
          value={calendarView}
        >
          {VIEWS.map((view) => (
            <ToggleGroupControlOption key={view} label={VIEW_LABELS[view]} value={view} />
          ))}
        </ToggleGroupControl>
        <Button variant="primary" onClick={onRefresh} disabled={refreshing}>
          {refreshing && <Spinner />}
          {refreshing ? 'Refreshing' : 'Refresh now'}
        </Button>
      </div>
    </header>
  )
}
