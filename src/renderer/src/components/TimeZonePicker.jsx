import { Button, SelectControl, TextControl } from '@wordpress/components'
import { chevronDown, chevronUp } from '@wordpress/icons'
import { useMemo, useState } from 'react'
import { formatTimeZoneReference } from '../calendarTimeZones.js'
import { getZoneArea, listZoneAreas, listZonesByArea, searchCities } from '../cityTimeZones.js'

// Which region to open the browser on: the one the current value already lives in, since
// that is where a nearby city is most likely to be.
function getInitialArea(currentZone) {
  const areas = listZoneAreas()
  const area = currentZone ? getZoneArea(currentZone) : null
  return areas.some((entry) => entry.value === area) ? area : areas[0].value
}

function ZoneBrowser({ currentZone, onSelect }) {
  const [area, setArea] = useState(() => getInitialArea(currentZone))
  const areas = useMemo(() => listZoneAreas(), [])
  // Offsets are read once per region rather than per render; a clock change mid-session
  // would leave a label stale, which is a fair trade for not recomputing 418 zones.
  const groups = useMemo(() => listZonesByArea(area, new Date()), [area])
  const total = groups.reduce((sum, group) => sum + group.cities.length, 0)

  return (
    <div className="timezone-browser">
      <div className="timezone-browser__head">
        <SelectControl
          __nextHasNoMarginBottom
          hideLabelFromVision
          label="Region"
          onChange={setArea}
          options={areas.map((entry) => ({ label: entry.label, value: entry.value }))}
          value={area}
        />
        <span className="timezone-browser__count">{total} zones</span>
      </div>

      <div className="timezone-browser__groups">
        {groups.map((group) => (
          <div className="timezone-browser__group" key={group.offset}>
            <h4>
              {formatTimeZoneReference(group.cities[0].zone, new Date())}
              {/* Any city in the bucket keeps the same clock, so naming a known one turns
                  an unfamiliar id into something you can judge. */}
              {group.reference && <span> · same as {group.reference}</span>}
            </h4>
            <ul>
              {group.cities.map((entry) => (
                <li key={entry.zone}>
                  <Button
                    onClick={() => onSelect(entry.zone, entry.city)}
                    variant="link"
                  >
                    {entry.city}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TimeZonePicker({
  currentZone,
  disabled = false,
  label = 'Search city',
  onChange,
  placeholder = 'Lisbon, Tokyo, New York…'
}) {
  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const results = useMemo(() => searchCities(query), [query])

  function handleSelect(zone, city) {
    onChange?.(zone, city)
    setQuery('')
    setBrowsing(false)
  }

  return (
    <div className="timezone-picker">
      <TextControl
        __nextHasNoMarginBottom
        disabled={disabled}
        label={label}
        onChange={setQuery}
        placeholder={placeholder}
        value={query}
      />
      {query && results.length > 0 && (
        <ul className="timezone-picker__results">
          {results.slice(0, 8).map((result) => (
            <li key={`${result.city}-${result.zone}`}>
              <Button variant="link" onClick={() => handleSelect(result.zone, result.city)}>
                <span className="timezone-picker__city">{result.city}</span>
                <span className="timezone-picker__offset">
                  {formatTimeZoneReference(result.zone, new Date())}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {query && results.length === 0 && (
        <p className="timezone-picker__empty">No city matches “{query}”.</p>
      )}

      <Button
        className="timezone-picker__browse"
        disabled={disabled}
        icon={browsing ? chevronUp : chevronDown}
        iconPosition="right"
        onClick={() => setBrowsing((open) => !open)}
        variant="link"
      >
        Browse all zones
      </Button>
      {browsing && !disabled && (
        <ZoneBrowser currentZone={currentZone} onSelect={handleSelect} />
      )}
    </div>
  )
}
