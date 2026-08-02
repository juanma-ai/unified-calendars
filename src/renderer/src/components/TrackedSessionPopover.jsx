import { Button, Icon } from '@wordpress/components'
import { closeSmall, lockSmall } from '@wordpress/icons'
import { format } from 'date-fns'

import { formatRunningLabel, formatSessionRange, getSessionNotes } from '../trackedSession.js'
import { isRunning } from '../trackedTime.js'

/**
 * A tracked session is not an event you can act on: there is no URL to open, no series, and
 * it is edited in the tracker, not here. So it gets a read-only card instead of the standard
 * `EventPill` action menu — the only action left is hiding this occurrence, which the
 * hidden-events machinery covers for tracked sessions like any other event.
 *
 * `now` exists so the live-session clock can drive the elapsed counter; without it the card
 * reads the clock once, at render.
 */
export function TrackedSessionPopover({ event, color, onClose, onHideEvent, now = Date.now() }) {
  const running = isRunning(event)
  const notes = getSessionNotes(event)

  return (
    <div className="tracked-session">
      <div className="tracked-session__header">
        <span
          className="tracked-session__swatch"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <div className="tracked-session__heading">
          <h2 className="tracked-session__project">{event.title}</h2>
          <p className="tracked-session__range">{formatSessionRange(event, now)}</p>
        </div>
        <Button
          className="tracked-session__close"
          icon={closeSmall}
          label="Close"
          onClick={onClose}
          size="small"
        />
      </div>

      {running && (
        <p className="tracked-session__running">
          <span className="tracked-session__pulse" aria-hidden="true" />
          {formatRunningLabel(event, now)}
        </p>
      )}

      {notes.length > 0 && (
        <div className="tracked-session__section">
          <h3 className="tracked-session__label">Session notes</h3>
          <ul className="tracked-session__notes">
            {notes.map((note, index) => (
              <li className="tracked-session__note" key={`${note.ts}:${index}`}>
                <time className="tracked-session__note-time" dateTime={note.ts}>
                  {format(new Date(note.ts), 'HH:mm')}
                </time>
                {/* Notes are stored verbatim, markdown and all; rendering them literally
                    beats guessing at a renderer the tracker never promised. */}
                <span className="tracked-session__note-text">
                  {note.isTodo && <span className="tracked-session__todo" aria-hidden="true">☐</span>}
                  {note.isTodo && <span className="tracked-session__sr">To-do: </span>}
                  {note.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="tracked-session__footer">
        <Button
          className="tracked-session__hide"
          onClick={() => {
            onHideEvent(event, 'occurrence')
            onClose()
          }}
          variant="link"
        >
          Hide this occurrence
        </Button>
        <p className="tracked-session__readonly">
          <Icon icon={lockSmall} size={12} />
          Read-only — edit in Time Tracker
        </p>
      </div>
    </div>
  )
}
