import { useEffect, useRef, useState } from 'react'
import { DISPLAY } from '../config/params.js'

const STORAGE_KEY = 'td-muted'

function load() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Asks the panel to click when a tap lands on a button. Listens in the bubble phase,
 * so the click a drag swallows (useDragScroll) never gets here. Remembered per
 * browser, like the list selection.
 */
export function useTapSound() {
  const [muted, setMuted] = useState(load)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  useEffect(() => {
    if (!DISPLAY) return
    const onClick = (e) => {
      if (!mutedRef.current && e.target.closest?.('button')) window.__sound?.('click')
    }
    addEventListener('click', onClick)
    return () => removeEventListener('click', onClick)
  }, [])

  const toggleMuted = () => {
    setMuted(!muted)
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '0' : '1')
    } catch {}
  }
  return { muted, toggleMuted }
}
