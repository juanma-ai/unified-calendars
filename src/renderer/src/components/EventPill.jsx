import { Button, Dropdown, MenuGroup, MenuItem } from '@wordpress/components'
import { external } from '@wordpress/icons'
import { format } from 'date-fns'
import { getEventColor } from '../calendarViewModel.js'

function getShortAssigneeName(assignee) {
  if (assignee.isMe) return 'You'
  return assignee.name?.split(' ')[0] || assignee.username || assignee.initials || 'Unknown'
}

function getTrelloAssigneeLabel(event) {
  if (event.source !== 'trello') return null
  if (!Array.isArray(event.assignees)) return null
  const assignees = event.assignees
  if (assignees.length === 0) return 'Unassigned'

  const me = assignees.find((assignee) => assignee.isMe)
  const others = assignees.filter((assignee) => !assignee.isMe)
  if (me && others.length === 0) return 'You'
  if (me && others.length === 1) return `You + ${getShortAssigneeName(others[0])}`
  if (me) return `You + ${others.length}`
  if (assignees.length === 1) return getShortAssigneeName(assignees[0])
  return `${getShortAssigneeName(assignees[0])} + ${assignees.length - 1}`
}

function getFullTrelloAssigneeLabel(event) {
  const assignees = event.assignees ?? []
  if (assignees.length === 0) return 'Unassigned'
  return assignees
    .map((assignee) => (assignee.isMe ? 'You' : assignee.name))
    .join(', ')
}

function lightenHexColor(color, amount = 0.6) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)
  if (!match) return color

  const hex = match[1].length === 3
    ? match[1].split('').map((char) => `${char}${char}`).join('')
    : match[1]
  const channels = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
  const lightened = channels
    .map((channel) => Math.round(channel + (255 - channel) * amount))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')

  return `#${lightened}`
}

export function EventPill({ event, onHideEvent, preferences, showTime = false }) {
  const color = getEventColor(event, preferences)
  const assignmentKnown = event.source === 'trello' && Array.isArray(event.assignees)
  const displayColor = assignmentKnown && !event.assignedToMe ? lightenHexColor(color) : color
  const time = showTime ? format(new Date(event.start), 'HH:mm') : null
  const trelloAssigneeLabel = getTrelloAssigneeLabel(event)
  const trelloDueLabel = event.source === 'trello' ? format(new Date(event.start), 'MMM d, HH:mm') : null
  const trelloMetaLabel = trelloAssigneeLabel
    ? `${trelloAssigneeLabel} - ${showTime ? format(new Date(event.start), 'HH:mm') : trelloDueLabel}`
    : null
  const actionLabel = [
    event.title,
    trelloAssigneeLabel ? `Assigned: ${trelloAssigneeLabel}` : null,
    trelloDueLabel ? `Due: ${trelloDueLabel}` : null,
    'Open event actions'
  ].filter(Boolean).join('. ')

  return (
    <Dropdown
      contentClassName="event-actions-popover"
      popoverProps={{ placement: 'right-start' }}
      renderToggle={({ onToggle }) => (
        <Button
          className={`event-pill${showTime ? ' is-timed' : ''}${
            event.assignedToMe ? ' is-assigned-to-me' : ''
          }`}
          aria-label={actionLabel}
          onClick={onToggle}
          style={{ backgroundColor: displayColor }}
        >
          {time && <span className="event-pill__time">{time}</span>}
          <span className="event-pill__title">{event.title}</span>
          {trelloMetaLabel && <span className="event-pill__meta">{trelloMetaLabel}</span>}
        </Button>
      )}
      renderContent={({ onClose }) => (
        <MenuGroup label={event.title}>
          {event.source === 'trello' && trelloAssigneeLabel && (
            <div className="event-actions-popover__meta">
              <span>Assigned: {getFullTrelloAssigneeLabel(event)}</span>
              <span>Due: {trelloDueLabel}</span>
            </div>
          )}
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
