import { useEffect, useRef } from 'react'
import { DISPLAY, FORCED_ORIENTATION, ROTATE } from '../config/params.js'

/**
 * Drag-to-scroll for mouse input, which is what panel touches arrive as. In portrait
 * the page is rotated onto the panel, so the finger's screen movement is mapped onto
 * the list's own axis. A drag swallows the click that would otherwise end it.
 */
export function useDragScroll() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    const rotated = DISPLAY && FORCED_ORIENTATION !== 'landscape'
    const alongList = (dx, dy) => (!rotated ? dy : ROTATE === 90 ? -dx : dx)
    let start = null
    let dragged = false

    const onDown = (e) => {
      if (e.pointerType !== 'mouse') return
      start = { x: e.clientX, y: e.clientY, top: el.scrollTop }
      dragged = false
    }
    const onMove = (e) => {
      if (!start || !(e.buttons & 1)) return
      const delta = alongList(e.clientX - start.x, e.clientY - start.y)
      if (Math.abs(delta) > 12) dragged = true
      // Whole pixels, so the panel can shift what it already shows exactly.
      if (dragged) el.scrollTop = Math.round(start.top - delta)
    }
    const onUp = () => {
      start = null
    }
    const onClick = (e) => {
      if (!dragged) return
      dragged = false
      e.stopPropagation()
      e.preventDefault()
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('click', onClick, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('click', onClick, true)
    }
  }, [])
  return ref
}
