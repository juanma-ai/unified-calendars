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

export function searchCities(query) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  const matches = CITY_TIME_ZONES.filter((entry) => {
    const haystack = [entry.city, ...entry.aliases].map((value) => value.toLowerCase())
    return haystack.some((value) => value.includes(normalized))
  })

  matches.sort((a, b) => {
    const aName = a.city.toLowerCase()
    const bName = b.city.toLowerCase()
    const aStartsWith = aName.startsWith(normalized)
    const bStartsWith = bName.startsWith(normalized)
    if (aStartsWith && !bStartsWith) return -1
    if (!aStartsWith && bStartsWith) return 1
    return aName.localeCompare(bName)
  })

  return matches
}
