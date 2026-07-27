# Project rules

- Do not use a bare command-line helper's embedded `CFBundleIdentifier` with `tccutil`; because it isn't registered with LaunchServices, reset the Reminders service globally or package the helper as an app bundle first.
- For macOS TCC-protected APIs, an embedded plist in a bare executable is not a substitute for a LaunchServices-recognizable `.app` bundle; test the bundle identity and usage-description keys before testing permissions.
- For TCC-sensitive helpers launched by Electron, test with Electron as the responsible parent process; a Node/Terminal adapter test can pass while the identical direct child launch is denied under Electron.
- When renderer state depends on a main-process refresh, await the refresh before requesting derived status; parallel IPC calls can display stale status even when the underlying integration succeeds.
- For the calendar UI redesign, use `@wordpress/components` for standard controls, menus, popovers, dialogs, notices, and color selection wherever an equivalent exists; create custom components only for calendar-specific layout and event rendering.
- The calendar sidebar must keep its header and source statuses fixed while the calendar list scrolls independently, and the weekly calendar must use an hourly time grid with a separate all-day row.
- Keep account connections and persistent source configuration in a dedicated Settings screen; reserve the calendar sidebar for quick visibility filtering, colors, search, and hidden-event access.
- Calendar selection is two-level: Settings decides which of the account's calendars (e.g. the many calendars available in a Google account) are listed in the sidebar at all, and the sidebar then offers a quick hide/show toggle per listed calendar to control its events in the grid. Neither level replaces the other.
- The calendar sidebar must expose a clearly labeled text Settings action and must not rely on clipped footer text or icon-only controls for critical account-connection guidance.
- Quick hide/show actions in the calendar sidebar must never remove a calendar from the sidebar; hidden calendars selected in Settings must remain listed with muted text.
- Calendar sidebar row overflow actions must use the standard three-dots menu affordance without custom square-button styling.
- Calendar sidebar row overflow menus must reveal the three-dots trigger on row hover or focus, but only open the options menu after trigger click or keyboard activation.
- Calendar sidebar row overflow triggers must match Gutenberg List View's options button pattern: `moreVertical` icon, `Options` label, small button size, and `block-editor-list-view-block__menu` on the toggle button.
- Trello cards not assigned to the current user should be visually de-emphasized enough to be obvious at calendar-grid density; a 30% lighter background is too subtle, so use a stronger distinction such as 60% lightening.
- Menu-bar/tray agenda features must expose a visible macOS status-bar title, not only a tiny icon or tooltip, so `npm start` and packaged builds are easy to discover.
- When a menu-bar/tray agenda is expected to follow native Mac menu behavior, use Electron's native `Menu`/`MenuItem` instead of a custom floating `BrowserWindow` popover unless custom rendering is explicitly more important than native dismissal, typography, spacing, and menu interaction.
