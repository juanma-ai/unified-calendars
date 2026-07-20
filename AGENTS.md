# Project rules

- Do not use a bare command-line helper's embedded `CFBundleIdentifier` with `tccutil`; because it isn't registered with LaunchServices, reset the Reminders service globally or package the helper as an app bundle first.
- For macOS TCC-protected APIs, an embedded plist in a bare executable is not a substitute for a LaunchServices-recognizable `.app` bundle; test the bundle identity and usage-description keys before testing permissions.
- For TCC-sensitive helpers launched by Electron, test with Electron as the responsible parent process; a Node/Terminal adapter test can pass while the identical direct child launch is denied under Electron.
- When renderer state depends on a main-process refresh, await the refresh before requesting derived status; parallel IPC calls can display stale status even when the underlying integration succeeds.
- For the calendar UI redesign, use `@wordpress/components` for standard controls, menus, popovers, dialogs, notices, and color selection wherever an equivalent exists; create custom components only for calendar-specific layout and event rendering.
- The calendar sidebar must keep its header and source statuses fixed while the calendar list scrolls independently, and the weekly calendar must use an hourly time grid with a separate all-day row.
- Keep account connections and persistent source configuration in a dedicated Settings screen; reserve the calendar sidebar for quick visibility filtering, colors, search, and hidden-event access.
- The calendar sidebar must expose a clearly labeled text Settings action and must not rely on clipped footer text or icon-only controls for critical account-connection guidance.
