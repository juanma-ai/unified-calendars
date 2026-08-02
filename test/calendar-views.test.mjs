import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENDA_DAYS,
  buildAgendaSections,
  buildMonthCells,
  buildTrackedDayTotals,
  buildYearHeatmap,
  formatTrackedRangeLabel,
  formatViewLabel,
  getViewDays,
  getViewRange,
  isCalendarView,
  navigateView,
  TRACKED_FULL_DAY_MS
} from '../src/renderer/src/calendarViews.js'

const anchor = new Date(2026, 6, 30, 12, 0) // Thu 30 July 2026

function ymd(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

test('day range covers only the anchor day', () => {
  const { start, end } = getViewRange('day', anchor)
  assert.equal(ymd(start), '2026-07-30')
  assert.equal(ymd(end), '2026-07-30')
  assert.equal(start.getHours(), 0)
  assert.equal(end.getHours(), 23)
})

test('week range runs Monday to Sunday around the anchor', () => {
  const { start, end } = getViewRange('week', anchor)
  assert.equal(ymd(start), '2026-07-27')
  assert.equal(ymd(end), '2026-08-02')
})

test('month range expands to whole weeks', () => {
  const { start, end } = getViewRange('month', anchor)

  // July 2026 starts on a Wednesday and ends on a Friday.
  assert.equal(ymd(start), '2026-06-29')
  assert.equal(ymd(end), '2026-08-02')
})

test('agenda range is a rolling window that opens on the anchor day', () => {
  const { start, end } = getViewRange('agenda', anchor)

  assert.equal(ymd(start), '2026-07-30')
  assert.equal(start.getHours(), 0)
  assert.equal(ymd(end), '2026-08-28')
  assert.equal(end.getHours(), 23)
})

test('year range covers the whole calendar year', () => {
  const { start, end } = getViewRange('year', anchor)
  assert.equal(ymd(start), '2026-01-01')
  assert.equal(ymd(end), '2026-12-31')
})

test('month grid days are whole weeks starting on Monday', () => {
  const days = getViewDays('month', anchor)

  assert.equal(days.length, 35)
  assert.equal(days.length % 7, 0)
  assert.equal(ymd(days[0]), '2026-06-29')
  assert.equal(days[0].getDay(), 1)
  assert.equal(ymd(days.at(-1)), '2026-08-02')
})

test('agenda days start on the anchor, day view is a single day', () => {
  const days = getViewDays('agenda', anchor).map(ymd)

  assert.equal(days.length, AGENDA_DAYS)
  assert.equal(days[0], '2026-07-30')
  assert.equal(days.at(-1), '2026-08-28')
  assert.deepEqual(getViewDays('day', anchor).map(ymd), ['2026-07-30'])
  assert.equal(getViewDays('week', anchor).length, 7)
})

test('labels are formatted per view', () => {
  assert.equal(formatViewLabel('day', anchor), 'Thu, Jul 30, 2026')
  assert.equal(formatViewLabel('week', anchor), 'Jul 27 – Aug 2, 2026')
  assert.equal(formatViewLabel('month', anchor), 'July 2026')
  assert.equal(formatViewLabel('agenda', anchor), 'Jul 30 – Aug 28, 2026')
  assert.equal(formatViewLabel('year', anchor), '2026')
})

test('navigation steps by the active view unit', () => {
  assert.equal(ymd(navigateView('day', anchor, 1)), '2026-07-31')
  assert.equal(ymd(navigateView('day', anchor, -1)), '2026-07-29')
  assert.equal(ymd(navigateView('week', anchor, 1)), '2026-08-06')
  assert.equal(ymd(navigateView('month', anchor, 1)), '2026-08-30')
  assert.equal(ymd(navigateView('agenda', anchor, 1)), '2026-08-29')
  assert.equal(ymd(navigateView('agenda', anchor, -1)), '2026-06-30')
  assert.equal(ymd(navigateView('year', anchor, 1)), '2027-07-30')
})

test('navigating to today ignores the anchor', () => {
  assert.equal(ymd(navigateView('month', anchor, 'today')), ymd(new Date()))
})

test('only known view names are accepted', () => {
  assert.equal(isCalendarView('month'), true)
  assert.equal(isCalendarView('settings'), false)
  assert.equal(isCalendarView(null), false)
})

const events = [
  { id: 'b', title: 'Second', start: '2026-07-30T13:59:00+02:00' },
  { id: 'a', title: 'First', start: '2026-07-30T09:50:00+02:00' },
  { id: 'c', title: 'Third', start: '2026-07-30T17:00:00+02:00' },
  { id: 'd', title: 'Other day', start: '2026-07-31T09:00:00+02:00' }
]

test('month cells bucket events by start day, sorted, with an overflow count', () => {
  const days = [new Date(2026, 6, 30), new Date(2026, 6, 31), new Date(2026, 7, 1)]
  const cells = buildMonthCells(events, days, 2)

  assert.deepEqual(cells[0].events.map((event) => event.id), ['a', 'b'])
  assert.equal(cells[0].overflowCount, 1)
  assert.deepEqual(cells[1].events.map((event) => event.id), ['d'])
  assert.equal(cells[1].overflowCount, 0)
  assert.deepEqual(cells[2].events, [])
})

test('month cells keep every event when no cap is given', () => {
  const [cell] = buildMonthCells(events, [new Date(2026, 6, 30)])
  assert.equal(cell.events.length, 3)
  assert.equal(cell.overflowCount, 0)
})

test('year heatmap covers 12 months and scales levels to the busiest day', () => {
  const heatmap = buildYearHeatmap(
    [
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `busy-${index}`,
        start: `2026-07-30T0${index}:00:00+02:00`
      })),
      { id: 'quiet', start: '2026-01-15T09:00:00+01:00' },
      { id: 'other-year', start: '2025-07-30T09:00:00+02:00' }
    ],
    anchor
  )

  assert.equal(heatmap.year, 2026)
  assert.equal(heatmap.maxCount, 4)
  assert.equal(heatmap.months.length, 12)
  assert.equal(heatmap.months[6].days.length, 31)

  const busiest = heatmap.months[6].days.find((entry) => ymd(entry.day) === '2026-07-30')
  const quiet = heatmap.months[0].days.find((entry) => ymd(entry.day) === '2026-01-15')
  const empty = heatmap.months[0].days.find((entry) => ymd(entry.day) === '2026-01-16')

  assert.deepEqual([busiest.count, busiest.level], [4, 4])
  assert.deepEqual([quiet.count, quiet.level], [1, 1])
  assert.deepEqual([empty.count, empty.level], [0, 0])
})

test('year heatmap stays at level 0 when there are no events', () => {
  const heatmap = buildYearHeatmap([], anchor)

  assert.equal(heatmap.maxCount, 0)
  assert.ok(heatmap.months.every((month) => month.days.every((entry) => entry.level === 0)))
})

test('agenda sections drop empty days and stay chronological', () => {
  const days = [new Date(2026, 6, 29), new Date(2026, 6, 30), new Date(2026, 6, 31)]
  const sections = buildAgendaSections(events, days)

  assert.deepEqual(sections.map((section) => ymd(section.day)), ['2026-07-30', '2026-07-31'])
  assert.deepEqual(sections[0].events.map((event) => event.id), ['a', 'b', 'c'])
})

test('agenda sections omit tracked sessions, which record past work', () => {
  const days = getViewDays('agenda', new Date('2026-07-22T09:00:00'))
  const sections = buildAgendaSections(
    [
      {
        id: 'timetracker:5',
        source: 'timetracker',
        title: 'certification',
        start: '2026-07-22T08:00:00',
        end: '2026-07-22T08:45:00'
      },
      {
        id: 'google:standup',
        source: 'google',
        title: 'Standup',
        start: '2026-07-22T11:10:00',
        end: '2026-07-22T11:30:00'
      }
    ],
    days
  )

  assert.deepEqual(
    sections.flatMap((section) => section.events.map((event) => event.title)),
    ['Standup']
  )
})

const trackedSessions = [
  {
    id: 'timetracker:1',
    source: 'timetracker',
    calendarId: 'timetracker:certification',
    calendarName: 'certification',
    title: 'certification',
    start: '2026-07-30T10:05:00+02:00',
    end: '2026-07-30T11:52:00+02:00'
  },
  {
    id: 'timetracker:2',
    source: 'timetracker',
    calendarId: 'timetracker:admin',
    calendarName: 'admin',
    title: 'admin',
    start: '2026-07-30T14:00:00+02:00',
    end: '2026-07-30T14:30:00+02:00'
  },
  {
    id: 'timetracker:3',
    source: 'timetracker',
    calendarId: 'timetracker:certification',
    calendarName: 'certification',
    title: 'certification',
    start: '2026-07-30T16:00:00+02:00',
    end: '2026-07-30T17:00:00+02:00'
  }
]

test('month cells leave tracked sessions to the strip along the bottom of the cell', () => {
  const days = [new Date(2026, 6, 30)]
  const [cell] = buildMonthCells([...events, ...trackedSessions], days)

  assert.deepEqual(cell.events.map((event) => event.id), ['a', 'b', 'c'])
  assert.equal(cell.overflowCount, 0)
})

test('tracked day totals merge a day into one segment per project, longest first', () => {
  const days = [new Date(2026, 6, 30), new Date(2026, 6, 31)]
  const [busy, quiet] = buildTrackedDayTotals([...events, ...trackedSessions], days)

  assert.deepEqual(
    busy.projects.map((entry) => [entry.project, entry.ms / TRACKED_FULL_DAY_MS]),
    [
      ['certification', (107 + 60) / 600],
      ['admin', 30 / 600]
    ]
  )
  // The segment carries an event of its own project, so the caller can colour it.
  assert.equal(busy.projects[0].event.calendarId, 'timetracker:certification')
  assert.equal(busy.totalMs, (107 + 60 + 30) * 60 * 1000)

  assert.deepEqual(quiet.projects, [])
  assert.equal(quiet.totalMs, 0)
})

test('tracked day totals grow a running session up to now', () => {
  const now = new Date('2026-07-30T12:00:00+02:00').getTime()
  const [day] = buildTrackedDayTotals(
    [
      {
        id: 'timetracker:open',
        source: 'timetracker',
        calendarId: 'timetracker:certification',
        calendarName: 'certification',
        title: 'certification',
        start: '2026-07-30T10:00:00+02:00',
        end: '2026-07-30T10:30:00+02:00',
        isRunning: true
      }
    ],
    [new Date(2026, 6, 30)],
    now
  )

  assert.equal(day.totalMs, 2 * 60 * 60 * 1000)
})

test('formatTrackedRangeLabel names the range the totals cover', () => {
  assert.equal(formatTrackedRangeLabel('day', anchor, anchor), 'Tracked today')
  assert.equal(formatTrackedRangeLabel('week', anchor, anchor), 'Tracked this week')
  assert.equal(formatTrackedRangeLabel('month', anchor, anchor), 'Tracked in July')
  assert.equal(formatTrackedRangeLabel('year', anchor, anchor), 'Tracked in 2026')
  assert.equal(formatTrackedRangeLabel('agenda', anchor, anchor), 'Tracked in range')
})

test('formatTrackedRangeLabel only says "today" when the day view is on today', () => {
  const yesterday = new Date(2026, 6, 29, 12, 0)

  assert.equal(formatTrackedRangeLabel('day', yesterday, anchor), 'Tracked on Wed, Jul 29')
})
