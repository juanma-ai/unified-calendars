export function SourceStatusBar({ statuses, onReconnectGoogle }) {
  return (
    <div class="source-status-bar">
      {statuses.map((s) => {
        const label = s.sourceAccountId ? `${s.source} (${s.sourceAccountId})` : s.source
        const notConnected = !s.ok && s.lastError === 'not-connected'
        const canReconnect = s.source === 'google' && notConnected

        let statusText
        if (s.ok) statusText = 'ok'
        else if (notConnected && s.source === 'trello') statusText = 'not connected (set TRELLO_API_KEY/TOKEN in .env)'
        else if (notConnected && s.source === 'reminders') statusText = 'permission denied (allow Reminders access in System Settings)'
        else if (notConnected) statusText = 'not connected'
        else if (s.source === 'reminders' && s.lastError === 'not-built')
          statusText = 'helper not built (run: npm run build:reminders-helper)'
        else statusText = s.lastError ?? 'error'

        return (
          <span key={`${s.source}:${s.sourceAccountId ?? ''}`} class={`source-status ${s.ok ? 'ok' : 'error'}`}>
            {label}: {statusText}
            {canReconnect && (
              <button class="connect-button" onClick={() => onReconnectGoogle(s.sourceAccountId)}>
                Connect
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}
