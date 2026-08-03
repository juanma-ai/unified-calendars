import { createRoot } from 'react-dom/client'
import { App } from './App.jsx'
import { NoteWindow } from './components/NoteWindow.jsx'
import '@wordpress/components/build-style/style.css'
import './styles.css'

// Opened in a plain browser tab (the dev server, for UI review) there is no preload, so
// `window.calendarAPI` is missing and the first effect in App.jsx would throw before
// anything rendered. Loaded dynamically so the fixtures stay out of the production bundle.
if (import.meta.env.DEV && !window.calendarAPI) {
  const { installDevBrowserMock } = await import('./devBrowserMock.js')
  installDevBrowserMock()
}

const container = document.getElementById('app')

// A blank window says nothing about a broken preload; this at least names the problem.
// The note composer is a second BrowserWindow sharing this bundle rather than a second
// Vite entry: one query parameter is cheaper than a build-config change.
const isNoteWindow = new URLSearchParams(window.location.search).get('window') === 'note'

if (window.calendarAPI) {
  createRoot(container).render(isNoteWindow ? <NoteWindow /> : <App />)
} else {
  container.textContent =
    'The calendarAPI bridge is unavailable, so the calendar cannot load. The preload script failed to run.'
}
