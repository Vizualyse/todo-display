import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { DISPLAY } from './config/params.js'
import { installDisplayBridge } from './display/bridge.js'

if (DISPLAY) installDisplayBridge()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
