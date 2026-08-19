import { Button, TextControl } from '@wordpress/components'
import { useMemo, useState } from 'react'
import { searchCities } from '../cityTimeZones.js'

export function TimeZonePicker({
  allowNote = false,
  buttonLabel = 'Select',
  note = '',
  onChange,
  onNoteChange,
  placeholder = 'Search city'
}) {
  const [query, setQuery] = useState('')
  const [draftNote, setDraftNote] = useState(note)
  const results = useMemo(() => searchCities(query), [query])

  function handleSelect(result) {
    onChange?.(result.zone, result.city)
    setQuery('')
  }

  function handleNoteBlur() {
    onNoteChange?.(draftNote)
  }

  return (
    <div className="timezone-picker">
      <TextControl
        __nextHasNoMarginBottom
        label={placeholder}
        onChange={setQuery}
        value={query}
      />
      {query && results.length > 0 && (
        <ul className="timezone-picker__results">
          {results.slice(0, 8).map((result) => (
            <li key={result.zone}>
              <Button variant="link" onClick={() => handleSelect(result)}>
                {result.city} ({result.zone})
              </Button>
            </li>
          ))}
        </ul>
      )}
      {allowNote && (
        <TextControl
          __nextHasNoMarginBottom
          className="timezone-picker__note"
          label="Note"
          onBlur={handleNoteBlur}
          onChange={setDraftNote}
          value={draftNote}
        />
      )}
    </div>
  )
}
