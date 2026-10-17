import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { DISPLAY, FORCED_ORIENTATION, ROTATE } from './params.js'

if (DISPLAY) {
  document.documentElement.classList.add(
    'display',
    FORCED_ORIENTATION === 'landscape' ? 'landscape' : `rot-${ROTATE}`,
  )

  // Tell the renderer to take a new frame once a DOM change has been painted.
  let queued = false
  const dirty = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => requestAnimationFrame(() => {
      queued = false
      window.__frameDirty?.()
    }))
  }
  new MutationObserver(dirty).observe(document.body, {
    subtree: true, childList: true, attributes: true, characterData: true,
  })
  document.fonts.ready.then(dirty)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
