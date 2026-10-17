import { useEffect, useState } from 'react'

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  })

/**
 * The panel's Music Assistant player, through the add-on: now playing, art and
 * controls. `available` is false until Home Assistant has such a player.
 */
export function useMusic() {
  const [music, setMusic] = useState({ available: false })
  useEffect(() => {
    const load = () => fetch('api/music').then((r) => r.json()).then(setMusic).catch(() => {})
    load()
    const events = new EventSource('api/events')
    events.addEventListener('music', load)
    return () => events.close()
  }, [])

  // Optimistic, so the button flips in the very next frame.
  const playPause = () => {
    setMusic((m) => ({ ...m, playing: !m.playing }))
    post('api/music/play_pause')
  }
  const next = () => post('api/music/next')
  const previous = () => post('api/music/previous')
  const setVolume = (volume) => {
    setMusic((m) => ({ ...m, volume }))
    post('api/music/volume', { volume })
  }
  return { ...music, playPause, next, previous, setVolume }
}
