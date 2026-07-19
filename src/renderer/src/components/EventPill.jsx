import { Button, Dropdown, MenuGroup, MenuItem } from '@wordpress/components'
import { external } from '@wordpress/icons'
import { format } from 'date-fns'
import { getEventColor } from '../calendarViewModel.js'

export function EventPill({ event, onHideEvent, preferences, showTime = false }) {
  const color = getEventColor(event, preferences)
  const time = showTime ? format(new Date(event.start), 'HH:mm') : null

  return (
    <Dropdown
      contentClassName="event-actions-popover"
      popoverProps={{ placement: 'right-start' }}
      renderToggle={({ onToggle }) => (
        <Button
          className={`event-pill${showTime ? ' is-timed' : ''}`}
          aria-label={`${event.title}. Open event actions`}
          onClick={onToggle}
          style={{ backgroundColor: color }}
        >
          {time && <span className="event-pill__time">{time}</span>}
          <span className="event-pill__title">{event.title}</span>
        </Button>
      )}
      renderContent={({ onClose }) => (
        <MenuGroup label={event.title}>
          {event.url && (
            <MenuItem
              icon={external}
              onClick={() => {
                window.calendarAPI.openExternal(event.url)
                onClose()
              }}
            >
              {event.source === 'trello' ? 'Open in Trello' : 'Open in Google Calendar'}
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              onHideEvent(event, 'occurrence')
              onClose()
            }}
          >
            Hide this occurrence
          </MenuItem>
          {event.seriesId && (
            <MenuItem
              onClick={() => {
                onHideEvent(event, 'series')
                onClose()
              }}
            >
              Hide entire series
            </MenuItem>
          )}
        </MenuGroup>
      )}
    />
  )
}
