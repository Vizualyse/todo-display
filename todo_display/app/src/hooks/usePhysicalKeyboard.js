import { useEffect, useRef } from 'react'

/**
 * Typing on a real keyboard, for the browser/ingress view (the panel has its own
 * on-screen keyboard). The handlers are read fresh on every key press.
 */
export function usePhysicalKeyboard(handlers) {
  const keys = useRef(null)
  keys.current = handlers
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') keys.current.submit()
      else if (e.key === 'Backspace') keys.current.backspace()
      else if (e.key.length === 1) keys.current.type(e.key)
      else return
      e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
}
