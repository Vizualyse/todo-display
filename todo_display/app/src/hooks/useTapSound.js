import { useEffect, useRef, useState } from 'react'
import { DISPLAY } from '../config/params.js'

const post = (body) =>
  fetch('api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/**
 * Tap clicks plus the panel's master volume (0-100), which scales every sound:
 * clicks, alarm chimes and music. Both settings live in the add-on, so they survive
 * restarts; the volume follows the panel when Music Assistant changes it.
 *
 * Clicks are asked for when a tap lands on a button. The listener is in the bubble
 * phase, so the click a drag swallows (useDragScroll) never gets here.
 */
export function useTapSound() {
  const [settings, setSettings] = useState({ muted: false, volume: 0.5 })
  const [dragging, setDragging] = useState(null) // slider value while the finger is down
  const mutedRef = useRef(settings.muted)
  mutedRef.current = settings.muted

  useEffect(() => {
    const load = () => fetch('api/settings').then((r) => r.json()).then(setSettings).catch(() => {})
    load()
    const events = new EventSource('api/events')
    events.addEventListener('settings', load)
    return () => events.close()
  }, [])

  useEffect(() => {
    if (!DISPLAY) return
    const onClick = (e) => {
      // [data-silent] buttons play their own sound (e.g. chime previews).
      const button = e.target.closest?.('button')
      if (!mutedRef.current && button && !button.closest('[data-silent]')) window.__sound?.('click')
    }
    addEventListener('click', onClick)
    return () => removeEventListener('click', onClick)
  }, [])

  const toggleMuted = () => {
    setSettings((s) => ({ ...s, muted: !s.muted }))
    post({ muted: !settings.muted })
  }
  /** While dragging: only the slider moves. */
  const setVolume = (v) => setDragging(v)
  /** On release: the panel takes the volume, then (optionally) clicks so it can be heard. */
  const commitVolume = async (v, { click = true } = {}) => {
    setDragging(null)
    setSettings((s) => ({ ...s, volume: v / 100 }))
    await post({ volume: v / 100 }).catch(() => {})
    if (click && !settings.muted) window.__sound?.('click')
  }
  const volume = dragging ?? Math.round(settings.volume * 100)
  return { muted: settings.muted, toggleMuted, volume, setVolume, commitVolume }
}
