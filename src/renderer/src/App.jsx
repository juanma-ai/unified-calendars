import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Spinner } from '@wordpress/components'
import { startOfWeek, endOfWeek } from 'date-fns'
import { CalendarGrid } from './components/CalendarGrid.jsx'
import { CalendarSidebar } from './components/CalendarSidebar.jsx'
import { HiddenEventsModal } from './components/HiddenEventsModal.jsx'
import { SettingsScreen } from './components/SettingsScreen.jsx'
import { refreshCalendar } from './refreshCalendar.js'
import { buildCalendars, filterVisibleEvents } from './calendarViewModel.js'

const POLL_INTERVAL_MS = 60 * 1000
const DEFAULT_PREFERENCES = {
  calendarColors: {},
  calendarSidebarVisibility: {},
  calendarVisibility: {},
  hiddenCalendars: [],
  hiddenEvents: []
}
const WEEK_OPTIONS = { weekStartsOn: 1 }

export function App() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), WEEK_OPTIONS))
  const [events, setEvents] = useState([])
  const [availableCalendars, setAvailableCalendars] = useState([])
  const [googleAccounts, setGoogleAccounts] = useState([])
  const [statuses, setStatuses] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [searchQuery, setSearchQuery] = useState('')
  const [hiddenEventsOpen, setHiddenEventsOpen] = useState(false)
  const [view, setView] = useState('calendar')

  const calendars = useMemo(
    () => buildCalendars(events, preferences, availableCalendars),
    [availableCalendars, events, preferences]
  )
  const sidebarCalendars = useMemo(
    () => calendars.filter((calendar) => calendar.sidebarVisible),
    [calendars]
  )
  const calendarCountBySource = useMemo(
    () => calendars.reduce((counts, calendar) => ({
      ...counts,
      [calendar.source]: (counts[calendar.source] ?? 0) + 1
    }), {}),
    [calendars]
  )
  const visibleEvents = useMemo(
    () => filterVisibleEvents(events, preferences, searchQuery),
    [events, preferences, searchQuery]
  )

  const refresh = useCallback(async () => {
    const rangeStart = weekStart.toISOString()
    const rangeEnd = endOfWeek(weekStart, WEEK_OPTIONS).toISOString()

    const result = await refreshCalendar(window.calendarAPI, rangeStart, rangeEnd)
    setEvents(result.events)
    setStatuses(result.statuses)
    setAvailableCalendars(result.calendars)
  }, [weekStart])

  // Paint instantly from whatever was cached on disk from the last run, then
  // kick off a live fetch for the current range in the background.
  useEffect(() => {
    window.calendarAPI.getPreferences().then(setPreferences)
    window.calendarAPI.getGoogleAccounts().then(setGoogleAccounts)
    window.calendarAPI.getCachedEvents().then((cached) => {
      if (cached?.events) setEvents(cached.events)
      if (cached?.calendars) setAvailableCalendars(cached.calendars)
      if (cached?.statuses) setStatuses(cached.statuses)
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    return window.calendarAPI.onOpenSettings?.(() => setView('settings'))
  }, [])

  const handleReconnectGoogle = useCallback(
    (accountLabel) => {
      window.calendarAPI
        .startGoogleOAuth(accountLabel)
        .then(() => window.calendarAPI.getGoogleAccounts())
        .then(setGoogleAccounts)
        .then(refresh)
        .catch((err) => console.error('Google OAuth failed:', err))
    },
    [refresh]
  )

  const handleRefreshNow = useCallback(() => {
    setRefreshing(true)
    const rangeStart = weekStart.toISOString()
    const rangeEnd = endOfWeek(weekStart, WEEK_OPTIONS).toISOString()

    refreshCalendar(window.calendarAPI, rangeStart, rangeEnd, { force: true })
      .then((result) => {
        setEvents(result.events)
        setStatuses(result.statuses)
        setAvailableCalendars(result.calendars)
      })
      .finally(() => setRefreshing(false))
  }, [weekStart])

  const handleCalendarColor = useCallback((calendarId, color) => {
    window.calendarAPI.setCalendarColor(calendarId, color).then(setPreferences)
  }, [])

  const handleCalendarSidebarVisibility = useCallback((calendarId, visible) => {
    window.calendarAPI.setCalendarSidebarVisibility(calendarId, visible).then(setPreferences)
  }, [])

  const handleCalendarVisibility = useCallback((calendarId, visible) => {
    window.calendarAPI.setCalendarVisibility(calendarId, visible).then(setPreferences)
  }, [])

  const handleHideEvent = useCallback((event, scope) => {
    window.calendarAPI
      .hideEvent({
        scope,
        eventId: event.id,
        seriesId: event.seriesId,
        title: event.title,
        calendarName: event.calendarName,
        start: event.start
      })
      .then(setPreferences)
  }, [])

  const handleRestoreHiddenEvent = useCallback((key) => {
    window.calendarAPI.restoreHiddenEvent(key).then(setPreferences)
  }, [])

  const handleConnectGoogle = useCallback(() => {
    return window.calendarAPI
      .connectGoogleAccount()
      .then(() => window.calendarAPI.getGoogleAccounts())
      .then(setGoogleAccounts)
      .then(refresh)
  }, [refresh])

  const handleDisconnectGoogle = useCallback((accountId) => {
    return window.calendarAPI
      .disconnectGoogleAccount(accountId)
      .then(setGoogleAccounts)
      .then(refresh)
  }, [refresh])

  if (view === 'settings') {
    return (
      <>
        <SettingsScreen
          calendars={calendars}
          googleAccounts={googleAccounts}
          hiddenEventCount={preferences.hiddenEvents.length}
          onBack={() => setView('calendar')}
          onConnectGoogle={handleConnectGoogle}
          onDisconnectGoogle={handleDisconnectGoogle}
          onOpenHiddenEvents={() => setHiddenEventsOpen(true)}
          onReconnectGoogle={handleReconnectGoogle}
          onVisibilityChange={handleCalendarSidebarVisibility}
          statuses={statuses}
        />
        <HiddenEventsModal
          hiddenEvents={preferences.hiddenEvents}
          isOpen={hiddenEventsOpen}
          onClose={() => setHiddenEventsOpen(false)}
          onRestore={handleRestoreHiddenEvent}
        />
      </>
    )
  }

  return (
    <div className="app">
      <CalendarSidebar
        calendars={sidebarCalendars}
        calendarCountBySource={calendarCountBySource}
        hiddenEventCount={preferences.hiddenEvents.length}
        onColorChange={handleCalendarColor}
        onOpenHiddenEvents={() => setHiddenEventsOpen(true)}
        onOpenSettings={() => setView('settings')}
        onReconnectGoogle={handleReconnectGoogle}
        onVisibilityChange={handleCalendarVisibility}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statuses={statuses}
      />
      <main className="calendar-main">
        <div className="calendar-main__refresh">
          <Button variant="primary" onClick={handleRefreshNow} disabled={refreshing}>
            {refreshing && <Spinner />}
            {refreshing ? 'Refreshing' : 'Refresh now'}
          </Button>
        </div>
        <CalendarGrid
          weekStart={weekStart}
          events={visibleEvents}
          onHideEvent={handleHideEvent}
          onNavigateWeek={setWeekStart}
          preferences={preferences}
        />
      </main>
      <HiddenEventsModal
        hiddenEvents={preferences.hiddenEvents}
        isOpen={hiddenEventsOpen}
        onClose={() => setHiddenEventsOpen(false)}
        onRestore={handleRestoreHiddenEvent}
      />
    </div>
  )
}
