import { useEffect, useRef, useState } from 'react'
import { Button } from '@wordpress/components'

/**
 * The note composer, opened from the tray while a timer runs. It is deliberately a real
 * Electron window rather than the AppleScript dialog the SwiftBar tracker used: a
 * foreground app gets the macOS emoji palette and a normal multiline text field for free,
 * which is the only reason that dialog had to be hosted by Finder.
 */
export function NoteWindow() {
  const [project, setProject] = useState(null)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const textarea = useRef(null)

  useEffect(() => {
    window.calendarAPI
      .getRunningTracking()
      .then((running) => setProject(running?.project ?? null))
      .catch(() => setProject(null))
    textarea.current?.focus()
  }, [])

  const close = () => window.calendarAPI.closeNoteWindow()

  async function save() {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      await window.calendarAPI.addTrackingNote(text)
      close()
    } catch (err) {
      setError(err?.message ?? 'The note could not be saved')
      setSaving(false)
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      close()
      return
    }
    // Enter saves; ⌥Enter (and ⇧Enter) insert a newline, matching the tracker's dialog.
    if (event.key === 'Enter' && !event.altKey && !event.shiftKey) {
      event.preventDefault()
      save()
    }
  }

  return (
    <div className="note-window">
      <header className="note-window__header">
        {project ? `Note · ${project}` : 'No timer running'}
      </header>

      <textarea
        ref={textarea}
        className="note-window__input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="What are you working on?"
        aria-label="Note text"
      />

      {error && <p className="note-window__error">{error}</p>}

      <footer className="note-window__footer">
        <span className="note-window__hint">⌥↩ newline · ↩ save</span>
        <Button variant="tertiary" onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!text.trim() || saving}>
          Save
        </Button>
      </footer>
    </div>
  )
}
