import assert from 'node:assert/strict'
import test from 'node:test'

import { addDays, startOfDay } from 'date-fns'

import {
  AGENDA_DAYS,
  buildAgendaSections,
  buildDaySegments,
  buildMonthWeeks,
  buildTrackedDayTotals,
  buildYearHeatmap,
  eventCoversDay,
  formatTrackedRangeLabel,
  getEventDayRange,
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

test('month weeks lane single-day events per day, with a per-day overflow count', () => {
  const days = [new Date(2026, 6, 30), new Date(2026, 6, 31), new Date(2026, 7, 1)]
  const [week] = buildMonthWeeks(events, days, 2)

  assert.deepEqual(
    week.segments.map((segment) => [segment.event.id, segment.startIndex, segment.lane]),
    [['a', 0, 0], ['b', 0, 1], ['d', 1, 0]]
  )
  // 'c' is the third event on the 30th, so it falls behind that day's "+1 more" only.
  assert.deepEqual(week.overflowCounts, [1, 0, 0])
  assert.equal(week.laneCount, 2)
})

test('month weeks keep every event when no cap is given', () => {
  const [week] = buildMonthWeeks(events, [new Date(2026, 6, 30)])

  assert.equal(week.segments.length, 3)
  assert.deepEqual(week.overflowCounts, [0])
})

test('a multi-day event is one bar spanning its days, cut at the week boundary', () => {
  const days = dayList(new Date(2026, 7, 17), 14) // Mon 17 – Sun 30
  const conference = { id: 'conf', start: '2026-08-20', end: '2026-08-26', allDay: true }
  const [first, second] = buildMonthWeeks([conference], days, 3)

  assert.deepEqual(
    { ...first.segments[0], event: undefined },
    { event: undefined, startIndex: 3, endIndex: 6, span: 4, continuesBefore: false, continuesAfter: true, lane: 0 }
  )
  assert.deepEqual(
    { ...second.segments[0], event: undefined },
    { event: undefined, startIndex: 0, endIndex: 1, span: 2, continuesBefore: true, continuesAfter: false, lane: 0 }
  )
})

test('a multi-day event pushed past the cap counts as overflow on every day it covers', () => {
  const days = dayList(new Date(2026, 7, 17), 7)
  const fillers = Array.from({ length: 2 }, (_, index) => ({
    id: `filler-${index}`,
    start: '2026-08-18',
    end: '2026-08-21',
    allDay: true
  }))
  const late = { id: 'late', start: '2026-08-18', end: '2026-08-20', allDay: true }
  const [week] = buildMonthWeeks([...fillers, late], days, 2)

  assert.deepEqual(week.segments.map((segment) => segment.event.id), ['filler-0', 'filler-1'])
  assert.deepEqual(week.overflowCounts, [0, 1, 1, 0, 0, 0, 0])
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

test('month weeks leave tracked sessions to the strip along the bottom of the cell', () => {
  const days = [new Date(2026, 6, 30)]
  const [week] = buildMonthWeeks([...events, ...trackedSessions], days)

  assert.deepEqual(week.segments.map((segment) => segment.event.id), ['a', 'b', 'c'])
  assert.deepEqual(week.overflowCounts, [0])
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

test('year heat stays a scheduled-load reading, with tracked work as project dots', () => {
  const heatmap = buildYearHeatmap(
    [
      { id: 'meeting', start: '2026-07-30T09:00:00+02:00' },
      ...trackedSessions,
      {
        id: 'timetracker:other-month',
        source: 'timetracker',
        calendarId: 'timetracker:admin',
        calendarName: 'admin',
        title: 'admin',
        start: '2026-01-15T09:00:00+01:00',
        end: '2026-01-15T09:30:00+01:00'
      }
    ],
    anchor
  )

  const busiest = heatmap.months[6].days.find((entry) => ymd(entry.day) === '2026-07-30')
  // Three sessions on top of one meeting must not read as a four-event day.
  assert.equal(heatmap.maxCount, 1)
  assert.deepEqual([busiest.count, busiest.level], [1, 4])
  // One dot per project, not per session.
  assert.deepEqual(
    busiest.trackedProjects.map((entry) => entry.project),
    ['certification', 'admin']
  )
  assert.equal(busiest.trackedProjects[0].event.id, 'timetracker:1')

  const untracked = heatmap.months[6].days.find((entry) => ymd(entry.day) === '2026-07-29')
  assert.deepEqual(untracked.trackedProjects, [])

  assert.equal(heatmap.months[6].trackedDays, 1)
  assert.equal(heatmap.months[0].trackedDays, 1)
  assert.equal(heatmap.months[5].trackedDays, 0)
})

const timezoneAnchor = new Date('2026-07-30T12:00:00-07:00')

function localHours(date) {
  return date.getHours()
}

test('day range respects the provided time zone', () => {
  const { start, end } = getViewRange('day', timezoneAnchor, 'America/Los_Angeles')

  assert.equal(localHours(start), 0)
  assert.equal(localHours(end), 23)
  assert.equal(new Date(start.getTime()).toISOString(), '2026-07-30T07:00:00.000Z')
})

test('week range respects the provided time zone and starts on Monday', () => {
  const { start, end } = getViewRange('week', timezoneAnchor, 'America/Los_Angeles')

  assert.equal(start.getDay(), 1)
  assert.equal(localHours(start), 0)
  assert.equal(localHours(end), 23)
})

test('formatViewLabel uses the provided time zone', () => {
  assert.equal(formatViewLabel('day', timezoneAnchor, 'America/Los_Angeles'), 'Thu, Jul 30, 2026')
})

// --- Multi-day events ---------------------------------------------------------------

function dayList(start, count, timeZone) {
  return Array.from({ length: count }, (_, index) => addDays(startOfDay(start), index))
}

test('a Google all-day event ends the day before its exclusive end date', () => {
  const event = { start: '2026-08-20', end: '2026-08-21', allDay: true }
  const { firstDay, lastDay } = getEventDayRange(event, 'Europe/Madrid')

  assert.equal(ymd(firstDay), '2026-08-20')
  assert.equal(ymd(lastDay), '2026-08-20', 'a one-day all-day event must not bleed into the 21st')
})

test('a multi-day all-day event covers every day up to the exclusive end', () => {
  const event = { start: '2026-08-17', end: '2026-08-21', allDay: true }
  const { firstDay, lastDay } = getEventDayRange(event, 'Europe/Madrid')

  assert.equal(ymd(firstDay), '2026-08-17')
  assert.equal(ymd(lastDay), '2026-08-20')
})

test('date-only all-day boundaries do not shift a day in a western zone', () => {
  // Parsed as instants these are UTC midnight, which reads as the previous evening in
  // New York. The 20th has to stay the 20th.
  const event = { start: '2026-08-20', end: '2026-08-21', allDay: true }
  const { firstDay, lastDay } = getEventDayRange(event, 'America/New_York')

  assert.equal(ymd(firstDay), '2026-08-20')
  assert.equal(ymd(lastDay), '2026-08-20')
})

test('an all-day instant with end equal to start covers exactly one day', () => {
  const iso = new Date(2026, 7, 20).toISOString()
  const { firstDay, lastDay } = getEventDayRange({ start: iso, end: iso, allDay: true })

  assert.equal(ymd(firstDay), '2026-08-20')
  assert.equal(ymd(lastDay), '2026-08-20')
})

test('an event with no end covers only its start day', () => {
  const { firstDay, lastDay } = getEventDayRange({ start: new Date(2026, 7, 20, 9).toISOString() })

  assert.equal(ymd(firstDay), '2026-08-20')
  assert.equal(ymd(lastDay), '2026-08-20')
})

test('a timed event ending at midnight does not reach the next day', () => {
  const event = {
    start: new Date(2026, 7, 20, 20, 0).toISOString(),
    end: new Date(2026, 7, 21, 0, 0).toISOString()
  }
  const { firstDay, lastDay } = getEventDayRange(event)

  assert.equal(ymd(lastDay), '2026-08-20')
})

test('a timed event crossing midnight covers both days', () => {
  const event = {
    start: new Date(2026, 7, 20, 22, 0).toISOString(),
    end: new Date(2026, 7, 21, 2, 0).toISOString()
  }
  const { firstDay, lastDay } = getEventDayRange(event)

  assert.equal(ymd(firstDay), '2026-08-20')
  assert.equal(ymd(lastDay), '2026-08-21')
})

test('eventCoversDay reports the middle days of a span, not just the first', () => {
  const event = { start: '2026-08-17', end: '2026-08-21', allDay: true }
  const days = dayList(new Date(2026, 7, 16), 7)

  assert.deepEqual(
    days.map((day) => eventCoversDay(event, day)),
    [false, true, true, true, true, false, false]
  )
})

test('day segments span the days an event covers and pack into lanes', () => {
  const days = dayList(new Date(2026, 7, 17), 7)
  const conference = { id: 'a', start: '2026-08-17', end: '2026-08-21', allDay: true }
  const lunch = { id: 'b', start: '2026-08-18', end: '2026-08-19', allDay: true }
  const { segments, laneCount } = buildDaySegments([lunch, conference], days)

  assert.equal(laneCount, 2)
  const bySegmentId = new Map(segments.map((segment) => [segment.event.id, segment]))

  // Longest first, so the week-long bar sits above the one-day event it passes over.
  assert.deepEqual(
    { ...bySegmentId.get('a'), event: undefined },
    { event: undefined, startIndex: 0, endIndex: 3, span: 4, continuesBefore: false, continuesAfter: false, lane: 0 }
  )
  assert.equal(bySegmentId.get('b').lane, 1)
  assert.equal(bySegmentId.get('b').span, 1)
})

test('day segments clip to the window and flag the edges they run past', () => {
  const days = dayList(new Date(2026, 7, 17), 7) // Mon 17 – Sun 23
  const event = { id: 'a', start: '2026-08-14', end: '2026-08-26', allDay: true }
  const { segments } = buildDaySegments([event], days)

  assert.equal(segments.length, 1)
  assert.deepEqual(
    { ...segments[0], event: undefined },
    { event: undefined, startIndex: 0, endIndex: 6, span: 7, continuesBefore: true, continuesAfter: true, lane: 0 }
  )
})

test('day segments drop events that miss the window entirely', () => {
  const days = dayList(new Date(2026, 7, 17), 7)
  const before = { id: 'a', start: '2026-08-10', end: '2026-08-12', allDay: true }
  const after = { id: 'b', start: '2026-08-30', end: '2026-08-31', allDay: true }

  assert.deepEqual(buildDaySegments([before, after], days), { segments: [], laneCount: 0 })
})

test('lanes are reused once a bar has ended', () => {
  const days = dayList(new Date(2026, 7, 17), 7)
  const first = { id: 'a', start: '2026-08-17', end: '2026-08-19', allDay: true }
  const second = { id: 'b', start: '2026-08-20', end: '2026-08-22', allDay: true }
  const { segments, laneCount } = buildDaySegments([first, second], days)

  assert.equal(laneCount, 1)
  assert.deepEqual(segments.map((segment) => segment.lane), [0, 0])
})

test('a span across a DST change keeps its day count', () => {
  // Clocks go back in Madrid on Sunday 25 October 2026, making that day 25 hours long.
  const event = { start: '2026-10-24', end: '2026-10-27', allDay: true }
  const { firstDay, lastDay } = getEventDayRange(event, 'Europe/Madrid')

  assert.equal(ymd(firstDay), '2026-10-24')
  assert.equal(ymd(lastDay), '2026-10-26')
})

test('agenda sections list a multi-day event on every day it covers', () => {
  const days = dayList(new Date(2026, 7, 17), 7)
  const conference = { id: 'conf', title: 'DevCon', start: '2026-08-18', end: '2026-08-21', allDay: true }
  const sections = buildAgendaSections([conference], days)

  assert.deepEqual(
    sections.map((section) => ymd(section.day)),
    ['2026-08-18', '2026-08-19', '2026-08-20']
  )
})

test('agenda puts an all-day event above the day it shares with timed events', () => {
  const days = dayList(new Date(2026, 7, 18), 1)
  const sections = buildAgendaSections(
    [
      { id: 'standup', start: '2026-08-18T09:00:00+02:00', end: '2026-08-18T09:15:00+02:00' },
      { id: 'conf', start: '2026-08-18', end: '2026-08-19', allDay: true }
    ],
    days
  )

  assert.deepEqual(sections[0].events.map((event) => event.id), ['conf', 'standup'])
})

test('year heat counts a multi-day event on every day it covers', () => {
  const heatmap = buildYearHeatmap(
    [{ id: 'trip', start: '2026-07-28', end: '2026-08-01', allDay: true }],
    anchor
  )

  const july = heatmap.months[6].days
  assert.deepEqual(
    july.filter((entry) => entry.count > 0).map((entry) => ymd(entry.day)),
    ['2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31']
  )
  assert.equal(heatmap.maxCount, 1)
})

test('year heat clips a span that runs out of the year', () => {
  const heatmap = buildYearHeatmap(
    [{ id: 'newyear', start: '2026-12-30', end: '2027-01-03', allDay: true }],
    anchor
  )

  const december = heatmap.months[11].days
  assert.deepEqual(
    december.filter((entry) => entry.count > 0).map((entry) => ymd(entry.day)),
    ['2026-12-30', '2026-12-31']
  )
})
