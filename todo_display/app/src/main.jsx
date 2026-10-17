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
  // Scrolling repaints without touching the DOM, so watch it separately.
  addEventListener('scroll', dirty, true)

  // Read by the renderer with every frame so the panel can shift pixels it already
  // has instead of re-decoding the whole list. `dir` maps +1px of scrollTop to the
  // on-screen movement of the content after the portrait rotation.
  const dir = FORCED_ORIENTATION === 'landscape' ? [0, -1] : ROTATE === 90 ? [1, 0] : [-1, 0]
  window.__scrollState = () => {
    const el = document.querySelector('[data-scroll]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      top: el.scrollTop,
      dir,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    }
  }
  document.fonts.ready.then(dirty)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
