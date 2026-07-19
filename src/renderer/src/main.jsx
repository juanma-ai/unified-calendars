import { createRoot } from 'react-dom/client'
import { App } from './App.jsx'
import '@wordpress/components/build-style/style.css'
import './styles.css'

createRoot(document.getElementById('app')).render(<App />)
