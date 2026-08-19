import {
  Button,
  ButtonGroup,
  Dropdown,
  Spinner,
  __experimentalToggleGroupControl as ToggleGroupControl,
  __experimentalToggleGroupControlOption as ToggleGroupControlOption
} from '@wordpress/components'
import { useMemo, useState } from 'react'
import { formatViewLabel, navigateView, VIEW_LABELS, VIEWS } from '../calendarViews.js'
import { formatTimeZoneLabel } from '../calendarTimeZones.js'
import { searchCities } from '../cityTimeZones.js'
import { TimeZonePicker } from './TimeZonePicker.jsx'

function TimeZoneControl({
  onSecondaryTimeZonesChange,
  onTimeZoneChange,
  secondaryTimeZones,
  timeZone,
  timeZoneCity
}) {
  const [secondaryNote, setSecondaryNote] = useState('')

  function addSecondaryZone(zone, city) {
    if (!zone || secondaryTimeZones.some((item) => item.zone === zone)) return
    onSecondaryTimeZonesChange([...secondaryTimeZones, { zone, city, note: secondaryNote }])
  }

  function removeSecondaryZone(zone) {
    onSecondaryTimeZonesChange(secondaryTimeZones.filter((item) => item.zone !== zone))
  }

  return (
    <Dropdown
      className="app-header__timezone-control"
      popoverProps={{ placement: 'bottom-end' }}
      renderToggle={({ onToggle }) => (
        <Button variant="secondary" onClick={onToggle}>
          {formatTimeZoneLabel(timeZone, timeZoneCity, new Date())}
        </Button>
      )}
      renderContent={() => (
        <div className="app-header__timezone-popover">
          <h4>Primary time zone</h4>
          <TimeZonePicker onChange={onTimeZoneChange} placeholder="Search city" />

          <div className="app-header__timezone-secondary">
            <h4>Add secondary time zone</h4>
            <TimeZonePicker
              allowNote
              note={secondaryNote}
              onChange={addSecondaryZone}
              onNoteChange={setSecondaryNote}
              placeholder="Search city to add"
            />
          </div>

          {secondaryTimeZones.length > 0 && (
            <ul className="app-header__timezone-secondary-list">
              {secondaryTimeZones.map((entry) => (
                <li key={entry.zone}>
                  <span>{entry.city ?? entry.zone}</span>
                  <Button
                    variant="link"
                    isDestructive
                    onClick={() => removeSecondaryZone(entry.zone)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
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
  onSecondaryTimeZonesChange,
  onTimeZoneChange,
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
          onSecondaryTimeZonesChange={onSecondaryTimeZonesChange}
          onTimeZoneChange={onTimeZoneChange}
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
