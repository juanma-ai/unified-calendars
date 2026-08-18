import { format } from 'date-fns'
import { config } from '../config.js'
import { mapWallosPayment } from './calendarEventMappers.js'

function shiftDate(dateStr, cycle, frequency, direction) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const step = direction * frequency

  if (cycle === 1) {
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + step)
    return formatDateISO(dt)
  }

  if (cycle === 2) {
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + step * 7)
    return formatDateISO(dt)
  }

  if (cycle === 3) {
    const totalMonths = (y * 12) + (m - 1) + step
    const targetYear = Math.floor(totalMonths / 12)
    const targetMonth = (totalMonths % 12) + 1
    const clampedDay = clampDay(targetYear, targetMonth, d)
    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
  }

  if (cycle === 4) {
    const targetYear = y + step
    const clampedDay = clampDay(targetYear, m, d)
    return `${targetYear}-${String(m).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
  }

  return null
}

function clampDay(year, month, day) {
  const lastDay = new Date(year, month, 0).getDate()
  return Math.min(day, lastDay)
}

function formatDateISO(dt) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getOccurrencesInRange(subscription, rangeStart, rangeEnd) {
  const nextPayment = subscription.next_payment?.trim()
  if (!nextPayment) return []

  const cycle = Number(subscription.cycle)
  const frequency = Math.max(1, Number(subscription.frequency))
  const autoRenew = Number(subscription.auto_renew) === 1

  const rangeStartStr = format(new Date(rangeStart), 'yyyy-MM-dd')
  const rangeEndStr = format(new Date(rangeEnd), 'yyyy-MM-dd')

  if (!autoRenew) {
    return (nextPayment >= rangeStartStr && nextPayment <= rangeEndStr)
      ? [nextPayment]
      : []
  }

  let current = nextPayment
  let safety = 0

  while (current > rangeStartStr) {
    const prev = shiftDate(current, cycle, frequency, -1)
    if (!prev || prev >= current) break
    current = prev
    if (++safety > 10000) return []
  }

  safety = 0
  while (current < rangeStartStr) {
    const next = shiftDate(current, cycle, frequency, 1)
    if (!next || next <= current) break
    current = next
    if (++safety > 10000) return []
  }

  const occurrences = []
  safety = 0
  while (current <= rangeEndStr) {
    if (current >= rangeStartStr) {
      occurrences.push(current)
    }
    const next = shiftDate(current, cycle, frequency, 1)
    if (!next || next <= current) break
    current = next
    if (++safety > 10000) break
  }

  return occurrences
}

export async function fetchWallosEvents(rangeStart, rangeEnd) {
  if (!config.wallos?.apiKey || !config.wallos?.baseUrl) {
    return { events: [], statuses: [{ source: 'wallos', ok: false, lastError: 'not-connected' }] }
  }

  try {
    const baseUrl = config.wallos.baseUrl.replace(/\/+$/, '')
    const url = `${baseUrl}/api/subscriptions/get_subscriptions.php?api_key=${encodeURIComponent(config.wallos.apiKey)}&state=0`
    const res = await fetch(url)

    if (!res.ok) throw new Error(`Wallos API request failed: ${res.status}`)

    const body = await res.json()
    if (!body.success) throw new Error(body.title ?? 'Wallos API error')

    const subscriptions = body.subscriptions ?? []
    const events = []
    const methodsById = new Map()

    for (const sub of subscriptions) {
      const methodId = sub.payment_method_id
      const methodName = sub.payment_method_name ?? 'Unknown'

      if (!methodsById.has(methodId)) {
        methodsById.set(methodId, {
          id: methodId,
          name: methodName
        })
      }

      const occurrences = getOccurrencesInRange(sub, rangeStart, rangeEnd)
      for (const date of occurrences) {
        events.push(mapWallosPayment(sub, date))
      }
    }

    const PAYMENT_COLORS = ['#1d4ed8', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#2563eb']
    const calendars = [...methodsById.values()].map((method, index) => ({
      source: 'wallos',
      calendarId: `wallos:${method.id}`,
      providerCalendarId: String(method.id),
      calendarName: method.name,
      url: baseUrl,
      calendarDefaultColor: PAYMENT_COLORS[index % PAYMENT_COLORS.length],
      calendarDefaultVisible: true
    }))

    return {
      events,
      calendars,
      statuses: [{ source: 'wallos', ok: true, lastSyncedAt: new Date().toISOString() }]
    }
  } catch (err) {
    return { events: [], statuses: [{ source: 'wallos', ok: false, lastError: err.message }] }
  }
}
