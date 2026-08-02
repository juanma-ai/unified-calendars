import { Button, Dropdown, MenuGroup, MenuItem } from '@wordpress/components'
import { external } from '@wordpress/icons'
import { format } from 'date-fns'
import { getEventColor } from '../calendarViewModel.js'
import { getEventPalette } from '../eventColors.js'
import { TrackedSessionPopover } from './TrackedSessionPopover.jsx'

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

/**
 * `variant` picks how the event reads in the surrounding layout: `pill` is the
 * coloured block used in the grids, `row` is the flat list line used by the
 * agenda, where the colour moves into a swatch so the title stays plain text.
 */
export function EventPill({
  event,
  onHideEvent,
  preferences,
  showTime = false,
  variant = 'pill'
}) {
  const color = getEventColor(event, preferences)
  const assignmentKnown = event.source === 'trello' && Array.isArray(event.assignees)
  const displayColor = assignmentKnown && !event.assignedToMe ? lightenHexColor(color) : color
  const palette = getEventPalette(displayColor)
  const isRow = variant === 'row'
  // An all-day event has no meaningful clock time — showing one would print the
  // midnight boundary the source happened to use.
  const time = showTime && !event.allDay ? format(new Date(event.start), 'HH:mm') : null
  const trelloAssigneeLabel = getTrelloAssigneeLabel(event)
  const trelloDueLabel = event.source === 'trello' ? format(new Date(event.start), 'MMM d, HH:mm') : null
  const trelloMetaLabel = trelloAssigneeLabel
    ? `${trelloAssigneeLabel} - ${showTime ? format(new Date(event.start), 'HH:mm') : trelloDueLabel}`
    : null
  const isTracked = event.source === 'timetracker'
  const actionLabel = [
    event.title,
    trelloAssigneeLabel ? `Assigned: ${trelloAssigneeLabel}` : null,
    trelloDueLabel ? `Due: ${trelloDueLabel}` : null,
    isTracked ? 'Open tracked session details' : 'Open event actions'
  ].filter(Boolean).join('. ')

  return (
    <Dropdown
      contentClassName={isTracked ? 'tracked-session-popover' : 'event-actions-popover'}
      popoverProps={{ placement: 'right-start' }}
      renderToggle={({ isOpen, onToggle }) => (
        <Button
          className={`event-pill${isRow ? ' is-row' : ''}${showTime && !isRow ? ' is-timed' : ''}${
            event.assignedToMe ? ' is-assigned-to-me' : ''
          }${isTracked && isOpen ? ' is-session-selected' : ''}`}
          aria-label={actionLabel}
          onClick={onToggle}
          style={isRow ? undefined : { backgroundColor: palette.background, color: palette.text }}
        >
          {isRow && (
            <span
              className="event-pill__swatch"
              style={{ backgroundColor: displayColor }}
              aria-hidden="true"
            />
          )}
          {time && !isRow && <span className="event-pill__time">{time}</span>}
          <span className="event-pill__title">{event.title}</span>
          {trelloMetaLabel && <span className="event-pill__meta">{trelloMetaLabel}</span>}
        </Button>
      )}
      renderContent={({ onClose }) => (isTracked ? (
        <TrackedSessionPopover
          color={displayColor}
          event={event}
          onClose={onClose}
          onHideEvent={onHideEvent}
        />
      ) : (
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
      ))}
    />
  )
}
