import { Button, Dropdown } from '@wordpress/components'

import { TrackedSessionPopover } from './TrackedSessionPopover.jsx'

/**
 * One tracked session in the day/week lane. The coloured block is the wrapper — it owns the
 * geometry the time grid computed — and the button inside it is a transparent hit target
 * stretched over it, which is what makes the session reachable by mouse and by keyboard.
 *
 * `label` is the only thing that names the bar, since the block itself carries no text; it
 * lives on the button so a screen reader meets it as an activatable control rather than an
 * image. The card it opens is the same read-only `TrackedSessionPopover` an `EventPill`
 * opens for a tracked event in the other views.
 */
export function TrackedSessionBar({
  color,
  event,
  label,
  onHideEvent,
  running,
  sessionActions,
  style
}) {
  return (
    <div className={`calendar-week__tracked-bar${running ? ' is-running' : ''}`} style={style}>
      {running && <span aria-hidden="true" className="calendar-week__tracked-live" />}
      <Dropdown
        className="calendar-week__tracked-bar-dropdown"
        contentClassName="tracked-session-popover"
        popoverProps={{ placement: 'right-start' }}
        renderToggle={({ isOpen, onToggle }) => (
          <Button
            aria-label={label}
            className={`calendar-week__tracked-bar-button${isOpen ? ' is-session-selected' : ''}`}
            onClick={onToggle}
            title={label}
          />
        )}
        renderContent={({ onClose }) => (
          <TrackedSessionPopover
            color={color}
            event={event}
            onClose={onClose}
            onHideEvent={onHideEvent}
            sessionActions={sessionActions}
          />
        )}
      />
    </div>
  )
}
