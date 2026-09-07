import { createRoot } from 'react-dom/client'
import { App } from '../renderer/src/App.jsx'
import { createWebBridge } from '../renderer/src/webBridge.js'
import '@wordpress/components/build-style/style.css'
import '../renderer/src/styles.css'

window.calendarAPI = createWebBridge()
createRoot(document.getElementById('app')).render(<App />)
import './styles.css'
