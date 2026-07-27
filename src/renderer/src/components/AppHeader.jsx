import { Button, ButtonGroup, Spinner } from '@wordpress/components'
import { addWeeks, subWeeks } from 'date-fns'
import { formatWeekRange, getMondayWeek } from '../calendarDates.js'

export function AppHeader({ onNavigateWeek, onOpenSettings, onRefresh, refreshing, weekStart }) {
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
          <Button variant="secondary" onClick={() => onNavigateWeek(subWeeks(weekStart, 1))}>
            Prev
          </Button>
          <Button
            variant="secondary"
            onClick={() => onNavigateWeek(getMondayWeek(new Date()).start)}
          >
            Today
          </Button>
          <Button variant="secondary" onClick={() => onNavigateWeek(addWeeks(weekStart, 1))}>
            Next
          </Button>
        </ButtonGroup>
        <p className="app-header__range">{formatWeekRange(weekStart)}</p>
      </div>

      <div className="app-header__actions">
        <Button variant="primary" onClick={onRefresh} disabled={refreshing}>
          {refreshing && <Spinner />}
          {refreshing ? 'Refreshing' : 'Refresh now'}
        </Button>
      </div>
    </header>
  )
}
