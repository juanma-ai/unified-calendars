import {
  Button,
  ButtonGroup,
  Spinner,
  __experimentalToggleGroupControl as ToggleGroupControl,
  __experimentalToggleGroupControlOption as ToggleGroupControlOption
} from '@wordpress/components'
import { formatViewLabel, navigateView, VIEW_LABELS, VIEWS } from '../calendarViews.js'

export function AppHeader({
  anchorDate,
  calendarView,
  onNavigate,
  onOpenSettings,
  onRefresh,
  onViewChange,
  refreshing
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
        <p className="app-header__range">{formatViewLabel(calendarView, anchorDate)}</p>
      </div>

      <div className="app-header__actions">
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
