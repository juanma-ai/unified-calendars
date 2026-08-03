import { useState } from 'react'
import { Button, TextareaControl } from '@wordpress/components'
import { closeSmall, edit, trash } from '@wordpress/icons'
import { format } from 'date-fns'

import { useLiveClock } from '../liveClock.js'
import { formatRunningLabel, formatSessionRange, getSessionNotes } from '../trackedSession.js'
import { isRunning } from '../trackedTime.js'

/**
 * A tracked session used to be a read-only card, on the grounds that it was "edited in the
 * tracker". There is no tracker left to edit it in — the calendar owns starting, stopping
 * and noting — so this is now the one place a session's notes are written, corrected and
 * removed. There is still no URL to open and no series, so the only borrowed action is
 * hiding this occurrence.
 *
 * The elapsed counter reads the shared live clock rather than a timestamp taken at render,
 * which is what it used to do: a card left open on a running session sat there insisting the
 * session was still `1h 12m` old an hour later. `now` stays overridable so the card can be
 * rendered at a fixed moment in a test.
 */
export function TrackedSessionPopover({
  event,
  color,
  onClose,
  onHideEvent,
  sessionActions,
  now: nowOverride
}) {
  const liveNow = useLiveClock()
  const now = nowOverride ?? liveNow
  const running = isRunning(event)
  const notes = getSessionNotes(event)
  // A session whose provider id never survived the read cannot be addressed by a write.
  // That is the on-disk cache from a previous run, which a refresh replaces; until then the
  // card reads exactly as it used to.
  const editable = Boolean(sessionActions && event.providerEventId)

  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const reset = () => {
    setEditingId(null)
    setAdding(false)
    setDraft('')
    setConfirmingDelete(false)
  }

  // Every write goes through the same guard. The popover lives inside a Dropdown, so a
  // half-finished edit left open after a failure is what would let the next click write the
  // wrong thing. A rejection keeps the draft on screen; App surfaces the message.
  const run = async (write) => {
    if (busy) return
    setBusy(true)
    try {
      await write()
      reset()
    } catch {
      // Already reported through the calendar's error notice.
    } finally {
      setBusy(false)
    }
  }

  const startEditing = (note) => {
    setAdding(false)
    setEditingId(note.id)
    setDraft(note.rawText)
  }

  const startAdding = () => {
    setEditingId(null)
    setAdding(true)
    setDraft('')
  }

  // Enter saves and ⇧/⌥Enter makes a newline, matching the note window's keys, so the two
  // places you can type a note do not disagree about what Enter means.
  const onDraftKeyDown = (submit) => (keyEvent) => {
    if (keyEvent.key === 'Escape') {
      keyEvent.stopPropagation()
      reset()
      return
    }
    if (keyEvent.key === 'Enter' && !keyEvent.shiftKey && !keyEvent.altKey) {
      keyEvent.preventDefault()
      submit()
    }
  }

  const saveEdit = () => run(() => sessionActions.updateNote(editingId, draft))
  const saveNew = () => run(() => sessionActions.addNote(event, draft))

  const composer = (submit) => (
    <div className="tracked-session__composer">
      <TextareaControl
        __nextHasNoMarginBottom
        className="tracked-session__composer-input"
        hideLabelFromVision
        label={adding ? 'New note' : 'Edit note'}
        onChange={setDraft}
        onKeyDown={onDraftKeyDown(submit)}
        placeholder="What happened in this session?"
        rows={3}
        value={draft}
      />
      <div className="tracked-session__composer-actions">
        <Button disabled={busy} onClick={reset} size="small" variant="tertiary">
          Cancel
        </Button>
        <Button disabled={busy || !draft.trim()} onClick={submit} size="small" variant="primary">
          Save
        </Button>
      </div>
    </div>
  )

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

      {(notes.length > 0 || editable) && (
        <div className="tracked-session__section">
          <h3 className="tracked-session__label">Session notes</h3>
          {notes.length === 0 && (
            <p className="tracked-session__empty">No notes on this session yet.</p>
          )}
          <ul className="tracked-session__notes">
            {notes.map((note, index) => (
              <li className="tracked-session__note" key={note.id ?? `${note.ts}:${index}`}>
                <time className="tracked-session__note-time" dateTime={note.ts}>
                  {format(new Date(note.ts), 'HH:mm')}
                </time>
                {note.id !== null && editingId === note.id ? (
                  composer(saveEdit)
                ) : (
                  <>
                    {/* Notes are stored verbatim, markdown and all; rendering them literally
                        beats guessing at a renderer the tracker never promised. */}
                    <span className="tracked-session__note-text">
                      {note.isTodo && (
                        <span className="tracked-session__todo" aria-hidden="true">☐</span>
                      )}
                      {note.isTodo && <span className="tracked-session__sr">To-do: </span>}
                      {note.text}
                    </span>
                    {editable && note.id !== null && (
                      <span className="tracked-session__note-actions">
                        <Button
                          disabled={busy}
                          icon={edit}
                          label={`Edit note at ${format(new Date(note.ts), 'HH:mm')}`}
                          onClick={() => startEditing(note)}
                          size="small"
                        />
                        <Button
                          disabled={busy}
                          icon={trash}
                          isDestructive
                          label={`Delete note at ${format(new Date(note.ts), 'HH:mm')}`}
                          onClick={() => run(() => sessionActions.deleteNote(note.id))}
                          size="small"
                        />
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>

          {editable &&
            (adding ? (
              composer(saveNew)
            ) : (
              <Button
                className="tracked-session__add"
                disabled={busy}
                onClick={startAdding}
                size="small"
                variant="secondary"
              >
                Add a note
              </Button>
            ))}
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
        {/* Hiding only removes the bar from the grid; the tracker's totals still count the
            session. This is the hard delete. The card lives inside a Dropdown, so the
            confirm is an inline second click rather than a nested modal. */}
        {editable &&
          (confirmingDelete ? (
            <span className="tracked-session__delete-confirm">
              <span className="tracked-session__delete-question">
                Delete this session and its notes?
              </span>
              <Button disabled={busy} onClick={reset} size="small" variant="tertiary">
                Cancel
              </Button>
              <Button
                disabled={busy}
                isDestructive
                onClick={() =>
                  run(async () => {
                    await sessionActions.deleteSession(event)
                    // The session no longer exists; an open card would describe a dead row.
                    onClose()
                  })
                }
                size="small"
                variant="primary"
              >
                Delete
              </Button>
            </span>
          ) : (
            <Button
              className="tracked-session__delete"
              disabled={busy}
              isDestructive
              onClick={() => setConfirmingDelete(true)}
              variant="link"
            >
              Delete session
            </Button>
          ))}
      </div>
    </div>
  )
}
