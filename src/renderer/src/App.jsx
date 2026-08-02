import { useCallback, useEffect, useMemo, useState } from 'react'
import { Notice } from '@wordpress/components'
import { AgendaView } from './components/AgendaView.jsx'
import { AppHeader } from './components/AppHeader.jsx'
import { CalendarGrid } from './components/CalendarGrid.jsx'
import { CalendarSidebar } from './components/CalendarSidebar.jsx'
import { MonthView } from './components/MonthView.jsx'
import { SettingsScreen } from './components/SettingsScreen.jsx'
import { SourceLegend } from './components/SourceLegend.jsx'
import { YearView } from './components/YearView.jsx'
import { refreshCalendar } from './refreshCalendar.js'
import { buildCalendars, filterVisibleEvents } from './calendarViewModel.js'
import { shouldShowSourceLegend } from './sourceLegend.js'
import { DEFAULT_VIEW, getViewRange, isCalendarView } from './calendarViews.js'

const POLL_INTERVAL_MS = 60 * 1000
const VIEW_STORAGE_KEY = 'calendarView'
const DEFAULT_PREFERENCES = {
  calendarColors: {},
  calendarSidebarVisibility: {},
  calendarVisibility: {},
  hiddenCalendars: [],
  hiddenEvents: []
}
function readStoredView() {
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return isCalendarView(stored) ? stored : DEFAULT_VIEW
}

// Electron wraps handler errors as "Error invoking remote method '…': Error: <message>".
function getIpcErrorMessage(error) {
  const message = error?.message ?? ''
  const match = /Error:\s*(.*)$/.exec(message)
  return (match?.[1] || message || 'Something went wrong').trim()
}

export function App() {
  const [calendarView, setCalendarView] = useState(readStoredView)
  // The anchor is any date inside the range; each view snaps it to its own
  // boundaries, so it stays a plain "the calendar is looking at this date".
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [events, setEvents] = useState([])
  const [availableCalendars, setAvailableCalendars] = useState([])
  const [googleAccounts, setGoogleAccounts] = useState([])
  const [statuses, setStatuses] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [searchQuery, setSearchQuery] = useState('')
  const [screen, setScreen] = useState('calendar')
  const [settingsTab, setSettingsTab] = useState('connections')
  const [actionError, setActionError] = useState(null)

  const openSettings = useCallback((tab = 'connections') => {
    setSettingsTab(tab)
    setScreen('settings')
  }, [])

  const handleViewChange = useCallback((nextView) => {
    if (!isCalendarView(nextView)) return
    window.localStorage.setItem(VIEW_STORAGE_KEY, nextView)
    setCalendarView(nextView)
  }, [])

  const openDay = useCallback((day) => {
    setAnchorDate(day)
    handleViewChange('day')
  }, [handleViewChange])

  // One source of truth for the fetch range, so navigation and Refresh now can
  // never ask the main process for different windows of time.
  const range = useMemo(() => {
    const { start, end } = getViewRange(calendarView, anchorDate)
    return { start: start.toISOString(), end: end.toISOString() }
  }, [anchorDate, calendarView])

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
    const result = await refreshCalendar(window.calendarAPI, range.start, range.end)
    setEvents(result.events)
    setStatuses(result.statuses)
    setAvailableCalendars(result.calendars)
  }, [range])

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
    return window.calendarAPI.onOpenSettings?.(() => setScreen('settings'))
  }, [])

  const handleReconnectGoogle = useCallback(
    (accountLabel) => {
      setActionError(null)
      window.calendarAPI
        .startGoogleOAuth(accountLabel)
        .then(() => window.calendarAPI.getGoogleAccounts())
        .then(setGoogleAccounts)
        .then(refresh)
        .catch((err) => {
          console.error('Google OAuth failed:', err)
          setActionError(getIpcErrorMessage(err))
        })
    },
    [refresh]
  )

  const handleRefreshNow = useCallback(() => {
    setRefreshing(true)

    refreshCalendar(window.calendarAPI, range.start, range.end, { force: true })
      .then((result) => {
        setEvents(result.events)
        setStatuses(result.statuses)
        setAvailableCalendars(result.calendars)
      })
      .finally(() => setRefreshing(false))
  }, [range])

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

  // Google accounts connected before the app asked for write access stay read-only
  // until they are reconnected from Settings.
  const editableGoogleAccounts = useMemo(
    () => new Set(googleAccounts.filter((account) => account.canEdit).map((account) => account.id)),
    [googleAccounts]
  )

  const canEditEvent = useCallback(
    (event) => {
      // Events restored from the on-disk cache predate provider ids; a refresh fixes them.
      if (!event.providerEventId) return false
      if (event.source === 'google') return editableGoogleAccounts.has(event.sourceAccountId)
      return event.source === 'trello' || event.source === 'reminders'
    },
    [editableGoogleAccounts]
  )

  const handleEventTimeChange = useCallback(
    async (event, times) => {
      const previous = { start: event.start, end: event.end }
      const applyTimes = (values) =>
        setEvents((current) =>
          current.map((item) => (item.id === event.id ? { ...item, ...values } : item))
        )

      applyTimes({ start: times.start, end: times.end })
      setActionError(null)

      try {
        await window.calendarAPI.updateEventTime({ event, start: times.start, end: times.end })
        await refresh()
      } catch (error) {
        applyTimes(previous)
        setActionError(getIpcErrorMessage(error))
      }
    },
    [refresh]
  )

  const handleRestoreHiddenEvent = useCallback((key) => {
    window.calendarAPI.restoreHiddenEvent(key).then(setPreferences)
  }, [])

  const handleConnectGoogle = useCallback(() => {
    setActionError(null)
    return window.calendarAPI
      .connectGoogleAccount()
      .then(() => window.calendarAPI.getGoogleAccounts())
      .then(setGoogleAccounts)
      .then(refresh)
      .catch((err) => {
        console.error('Google OAuth failed:', err)
        setActionError(getIpcErrorMessage(err))
      })
  }, [refresh])

  const handleDisconnectGoogle = useCallback((accountId) => {
    return window.calendarAPI
      .disconnectGoogleAccount(accountId)
      .then(setGoogleAccounts)
      .then(refresh)
  }, [refresh])

  if (screen === 'settings') {
    return (
      <div className="app-shell">
        {actionError && (
          <Notice status="error" onRemove={() => setActionError(null)}>
            {actionError}
          </Notice>
        )}
        <SettingsScreen
          calendars={calendars}
          googleAccounts={googleAccounts}
          hiddenEvents={preferences.hiddenEvents}
          initialTab={settingsTab}
          onBack={() => setScreen('calendar')}
          onConnectGoogle={handleConnectGoogle}
          onDisconnectGoogle={handleDisconnectGoogle}
          onReconnectGoogle={handleReconnectGoogle}
          onRestoreHiddenEvent={handleRestoreHiddenEvent}
          onVisibilityChange={handleCalendarSidebarVisibility}
          statuses={statuses}
        />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppHeader
        anchorDate={anchorDate}
        calendarView={calendarView}
        onNavigate={setAnchorDate}
        onOpenSettings={openSettings}
        onRefresh={handleRefreshNow}
        onViewChange={handleViewChange}
        refreshing={refreshing}
      />
      <div className="app">
        <CalendarSidebar
          calendars={sidebarCalendars}
          calendarCountBySource={calendarCountBySource}
          hiddenEventCount={preferences.hiddenEvents.length}
          onColorChange={handleCalendarColor}
          onOpenSettings={openSettings}
          onVisibilityChange={handleCalendarVisibility}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          statuses={statuses}
        />
        <main className="calendar-main">
          {actionError && (
            <Notice status="error" onRemove={() => setActionError(null)}>
              {actionError}
            </Notice>
          )}
          {calendarView === 'month' && (
            <MonthView
              anchorDate={anchorDate}
              events={visibleEvents}
              onHideEvent={handleHideEvent}
              onOpenDay={openDay}
              preferences={preferences}
            />
          )}
          {calendarView === 'agenda' && (
            <AgendaView
              anchorDate={anchorDate}
              events={visibleEvents}
              onHideEvent={handleHideEvent}
              preferences={preferences}
            />
          )}
          {calendarView === 'year' && (
            <YearView anchorDate={anchorDate} events={visibleEvents} onOpenDay={openDay} />
          )}
          {/* Only the day/week time grid draws tracked lane bars, so only it needs the key. */}
          {(calendarView === 'day' || calendarView === 'week') &&
            shouldShowSourceLegend(preferences, statuses) && <SourceLegend />}
          {(calendarView === 'day' || calendarView === 'week') && (
            <CalendarGrid
              anchorDate={anchorDate}
              calendarView={calendarView}
              canEditEvent={canEditEvent}
              events={visibleEvents}
              onEventTimeChange={handleEventTimeChange}
              onHideEvent={handleHideEvent}
              preferences={preferences}
            />
          )}
        </main>
      </div>
    </div>
  )
}
