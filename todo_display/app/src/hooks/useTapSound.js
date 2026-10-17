import { useEffect, useRef, useState } from 'react'
import { DISPLAY } from '../config/params.js'

const STORAGE_KEY = 'td-muted'
const VOLUME_KEY = 'td-volume'
const DEFAULT_VOLUME = 70

function load() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function loadVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return localStorage.getItem(VOLUME_KEY) != null && v >= 0 && v <= 100 ? v : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

const save = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

/**
 * Asks the panel to click when a tap lands on a button. Listens in the bubble phase,
 * so the click a drag swallows (useDragScroll) never gets here. Remembered per
 * browser, like the list selection.
 */
export function useTapSound() {
  const [muted, setMuted] = useState(load)
  const [volume, setVolumeState] = useState(loadVolume) // 0-100
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  useEffect(() => {
    if (!DISPLAY) return
    const onClick = (e) => {
      // [data-silent] buttons play their own sound (e.g. chime previews).
      const button = e.target.closest?.('button')
      if (!mutedRef.current && button && !button.closest('[data-silent]')) window.__sound?.('click', volumeRef.current)
    }
    addEventListener('click', onClick)
    return () => removeEventListener('click', onClick)
  }, [])

  const toggleMuted = () => {
    setMuted(!muted)
    save(STORAGE_KEY, muted ? '0' : '1')
  }
  const setVolume = (v) => {
    setVolumeState(v)
    save(VOLUME_KEY, String(v))
  }
  /** One click at the chosen volume, so the slider can be judged by ear. */
  const preview = (v = volume) => {
    if (!muted) window.__sound?.('click', v)
  }
  return { muted, toggleMuted, volume, setVolume, preview }
}
