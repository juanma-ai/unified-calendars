# Unified Calendar

A personal Electron app that merges Google Calendar, Trello cards with due dates,
and Apple Reminders into one weekly view. Its interface uses the WordPress design
system and `@wordpress/components`.

## Using the calendar

- The week starts on Monday and the current day is highlighted.
- Events with a time appear in the scrollable 24-hour grid. All-day events appear
  in the row above it.
- Use the checkboxes in the sidebar to show or hide individual Google calendars,
  Trello boards, and Reminders lists. On first launch, only the primary Google
  calendar and Reminders lists are enabled; secondary Google calendars and Trello
  boards remain disabled until selected.
- Use each calendar's color control in the sidebar to customize its event color.
- Open an event's menu to visit its original Google Calendar event or Trello card.
  Apple Reminders does not provide a compatible source URL.
- The event menu can hide one occurrence or an entire recurring series. Hidden
  events can be restored from the hidden-events dialog.
- Calendar visibility, colors, and hidden events are saved locally.

## Setup

```bash
npm install
```

## Launching with Apple Reminders access

Apple Reminders access requires the packaged, locally signed macOS app. The
generic Electron app used by `npm run dev` does not have a stable macOS privacy
identity, so Reminders may report `permission denied` in development mode.

Build and launch the packaged app from the project directory:

```bash
npm run package:mac
open -n "release/mac-arm64/Unified Calendar.app"
```

On first launch, macOS asks whether **Unified Calendar** may access Reminders.
Click **Allow**. You can review or change this later under **System Settings →
Privacy & Security → Reminders**.

After changing application code or `.env` credentials, run
`npm run package:mac` again and reopen the newly built app. Close older Unified
Calendar windows to avoid confusing a previous build with the current one.

## Connecting each source

### Apple Reminders

Reads directly from your local Reminders app via EventKit. Follow **Launching
with Apple Reminders access** above; launching through `npm run dev` is not
sufficient for reliable Reminders permission handling.

### Google Calendar

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client of type **Desktop app**, and make sure the **Google Calendar API** is enabled for that project.
2. Copy `.env.example` to `.env` and fill in:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
3. To connect more than one Google account, set `GOOGLE_ACCOUNTS` to a comma-separated list of labels, e.g. `GOOGLE_ACCOUNTS=personal,work`. Each label gets its own OAuth flow and stored token.
4. Build and open the packaged app, then click **Connect** next to `google` in the status bar for each account label and complete the consent flow in your browser.

Tokens are stored locally via `electron-store` (in the Electron app's user data directory) — nothing is sent anywhere except Google's API.

### Trello

1. Get an API key at https://trello.com/power-ups/admin.
2. Generate a token by visiting (replace `YOUR_KEY`):
   ```
   https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key=YOUR_KEY
   ```
3. Add both to `.env`:
   ```
   TRELLO_API_KEY=...
   TRELLO_TOKEN=...
   ```
4. By default, cards with due dates are pulled from every open board the token can see. To limit it to specific boards, set `TRELLO_BOARD_IDS` to a comma-separated list of board IDs.
5. No in-app connect step is needed. Rebuild with `npm run package:mac`, reopen the app, and click **Refresh now**.

## Running

```bash
npm run package:mac  # build the helper and packaged app required for Reminders
npm run dev          # development UI with hot reload; Reminders may be denied
npm run start        # preview build; Reminders may be denied
npm run build        # compile Electron assets without packaging
```

## Status bar

Each source shows `ok` or an error hint (not connected, permission denied, helper not built, etc.) in the bar above the calendar grid. A failing source never hides data from the other two — it just stops updating until reconnected.
