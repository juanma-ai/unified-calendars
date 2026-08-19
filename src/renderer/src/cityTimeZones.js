// The offset comes straight from date-fns rather than from calendarTimeZones.js, which
// already imports this module — one-way dependency, no cycle.
import { tzOffset } from '@date-fns/tz'

export const CITY_TIME_ZONES = [
  { city: 'Lisbon', zone: 'Europe/Lisbon', aliases: ['Lisboa'] },
  { city: 'London', zone: 'Europe/London', aliases: [] },
  { city: 'Paris', zone: 'Europe/Paris', aliases: [] },
  { city: 'Berlin', zone: 'Europe/Berlin', aliases: [] },
  { city: 'Madrid', zone: 'Europe/Madrid', aliases: [] },
  { city: 'Rome', zone: 'Europe/Rome', aliases: [] },
  { city: 'Amsterdam', zone: 'Europe/Amsterdam', aliases: [] },
  { city: 'Zurich', zone: 'Europe/Zurich', aliases: [] },
  { city: 'Stockholm', zone: 'Europe/Stockholm', aliases: [] },
  { city: 'Helsinki', zone: 'Europe/Helsinki', aliases: [] },
  { city: 'Vienna', zone: 'Europe/Vienna', aliases: [] },
  { city: 'Warsaw', zone: 'Europe/Warsaw', aliases: [] },
  { city: 'Istanbul', zone: 'Europe/Istanbul', aliases: [] },
  { city: 'Moscow', zone: 'Europe/Moscow', aliases: [] },
  { city: 'Dubai', zone: 'Asia/Dubai', aliases: [] },
  { city: 'Tel Aviv', zone: 'Asia/Jerusalem', aliases: [] },
  { city: 'New Delhi', zone: 'Asia/Kolkata', aliases: ['Delhi'] },
  { city: 'Mumbai', zone: 'Asia/Kolkata', aliases: [] },
  { city: 'Kolkata', zone: 'Asia/Kolkata', aliases: [] },
  { city: 'Kathmandu', zone: 'Asia/Kathmandu', aliases: [] },
  { city: 'Bangkok', zone: 'Asia/Bangkok', aliases: [] },
  { city: 'Singapore', zone: 'Asia/Singapore', aliases: [] },
  { city: 'Hong Kong', zone: 'Asia/Hong_Kong', aliases: [] },
  { city: 'Shanghai', zone: 'Asia/Shanghai', aliases: [] },
  { city: 'Tokyo', zone: 'Asia/Tokyo', aliases: [] },
  { city: 'Seoul', zone: 'Asia/Seoul', aliases: [] },
  { city: 'Sydney', zone: 'Australia/Sydney', aliases: [] },
  { city: 'Melbourne', zone: 'Australia/Melbourne', aliases: [] },
  { city: 'Auckland', zone: 'Pacific/Auckland', aliases: [] },
  { city: 'New York', zone: 'America/New_York', aliases: ['NYC'] },
  { city: 'Boston', zone: 'America/New_York', aliases: [] },
  { city: 'Miami', zone: 'America/New_York', aliases: [] },
  { city: 'Toronto', zone: 'America/Toronto', aliases: [] },
  { city: 'Chicago', zone: 'America/Chicago', aliases: [] },
  { city: 'Houston', zone: 'America/Chicago', aliases: [] },
  { city: 'Denver', zone: 'America/Denver', aliases: [] },
  { city: 'Phoenix', zone: 'America/Phoenix', aliases: [] },
  { city: 'Los Angeles', zone: 'America/Los_Angeles', aliases: ['LA', 'LAX', 'SF'] },
  { city: 'San Francisco', zone: 'America/Los_Angeles', aliases: ['SF'] },
  { city: 'Seattle', zone: 'America/Los_Angeles', aliases: [] },
  { city: 'Vancouver', zone: 'America/Vancouver', aliases: [] },
  { city: 'Buenos Aires', zone: 'America/Argentina/Buenos_Aires', aliases: [] },
  { city: 'São Paulo', zone: 'America/Sao_Paulo', aliases: ['Sao Paulo'] },
  { city: 'Rio de Janeiro', zone: 'America/Sao_Paulo', aliases: [] },
  { city: 'Mexico City', zone: 'America/Mexico_City', aliases: [] },
  { city: 'Bogotá', zone: 'America/Bogota', aliases: ['Bogota'] }
]

export function getCityForZone(zone) {
  const match = CITY_TIME_ZONES.find((entry) => entry.zone === zone)
  return match?.city ?? null
}

// The full IANA database the runtime already ships — 400-odd zones, against the 46 above
// that were typed by hand. The curated table stays for what it alone knows: aliases people
// actually type (SF, NYC), accented names the ids cannot carry (São Paulo), and which
// cities deserve to rank first.
const ALL_ZONES = Intl.supportedValuesOf('timeZone')

const AREA_LABELS = {
  Africa: 'Africa',
  America: 'Americas',
  Antarctica: 'Polar',
  Arctic: 'Polar',
  Asia: 'Asia',
  Atlantic: 'Atlantic',
  Australia: 'Australia',
  Europe: 'Europe',
  Indian: 'Indian Ocean',
  Pacific: 'Pacific'
}

// The three regions most people need, then the rest alphabetically.
const AREA_ORDER = ['America', 'Europe', 'Asia']

// `Sao_Paulo` in an id, `São Paulo` on a keyboard: compare with the accents stripped so
// both spellings find each other.
function normalize(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function getZoneArea(zone) {
  return zone.split('/')[0]
}

// `America/New_York` -> `New York`; `America/Argentina/Salta` -> `Salta — Argentina`, since
// the bare last segment loses the only context that tells two Saltas apart.
export function formatZoneCity(zone) {
  const curated = getCityForZone(zone)
  if (curated) return curated

  const segments = zone.split('/').slice(1).map((segment) => segment.replace(/_/g, ' '))
  const city = segments.pop()
  return segments.length ? `${city} — ${segments.join(' ')}` : city
}

export function listZoneAreas() {
  const counts = new Map()
  for (const zone of ALL_ZONES) {
    const area = getZoneArea(zone)
    counts.set(area, (counts.get(area) ?? 0) + 1)
  }

  // Antarctica and Arctic share one label, so they collapse into a single Polar entry.
  const areas = new Map()
  for (const [area, count] of counts) {
    const label = AREA_LABELS[area] ?? area
    const existing = areas.get(label)
    areas.set(label, {
      label,
      value: existing?.value ?? area,
      count: (existing?.count ?? 0) + count
    })
  }

  return [...areas.values()].sort((a, b) => {
    const aRank = AREA_ORDER.indexOf(a.value)
    const bRank = AREA_ORDER.indexOf(b.value)
    if (aRank !== bRank) return (aRank < 0 ? 99 : aRank) - (bRank < 0 ? 99 : bRank)
    return a.label.localeCompare(b.label)
  })
}

// Every zone of an area, bucketed by its offset right now. What matters for the calendar is
// the offset, not the geography — two cities in one bucket are interchangeable — so the
// buckets are the unit of choice, and a well-known city in each one anchors it.
export function listZonesByArea(area, date = new Date()) {
  const label = AREA_LABELS[area] ?? area
  const zones = ALL_ZONES.filter(
    (zone) => (AREA_LABELS[getZoneArea(zone)] ?? getZoneArea(zone)) === label
  )

  const buckets = new Map()
  for (const zone of zones) {
    const offset = tzOffset(zone, date)
    const bucket = buckets.get(offset) ?? { offset, cities: [], reference: null }
    bucket.cities.push({ zone, city: formatZoneCity(zone) })
    if (!bucket.reference && CITY_TIME_ZONES.some((entry) => entry.zone === zone)) {
      bucket.reference = getCityForZone(zone)
    }
    buckets.set(offset, bucket)
  }

  return [...buckets.values()]
    .sort((a, b) => a.offset - b.offset)
    .map((bucket) => ({
      ...bucket,
      cities: bucket.cities.sort((a, b) => a.city.localeCompare(b.city))
    }))
}

export function searchCities(query) {
  const normalized = normalize(query)
  if (!normalized) return []

  const curatedByZone = new Map(CITY_TIME_ZONES.map((entry) => [entry.zone, entry]))
  const seen = new Set()
  const matches = []

  // The curated entries first: they carry the aliases, and several of them share a zone
  // (Boston and New York both mean America/New_York), so they cannot be derived from ids.
  for (const entry of CITY_TIME_ZONES) {
    const haystack = [entry.city, ...entry.aliases].map(normalize)
    if (haystack.some((value) => value.includes(normalized))) {
      matches.push({ ...entry, popular: true })
      seen.add(`${entry.city}-${entry.zone}`)
    }
  }

  for (const zone of ALL_ZONES) {
    if (curatedByZone.has(zone)) continue
    const city = formatZoneCity(zone)
    if (!normalize(`${city} ${zone}`).includes(normalized)) continue
    const key = `${city}-${zone}`
    if (seen.has(key)) continue
    seen.add(key)
    matches.push({ city, zone, aliases: [], popular: false })
  }

  return matches.sort((a, b) => {
    if (a.popular !== b.popular) return a.popular ? -1 : 1
    const aStarts = normalize(a.city).startsWith(normalized)
    const bStarts = normalize(b.city).startsWith(normalized)
    if (aStarts !== bStarts) return aStarts ? -1 : 1
    return a.city.localeCompare(b.city)
  })
}
