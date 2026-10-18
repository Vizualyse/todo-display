import { useEffect, useState } from 'react'

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  })

/**
 * The panel's Music Assistant player, through the add-on: now playing, art and
 * controls. `available` is false until Home Assistant has such a player. `group` is
 * the sync group the panel belongs to (null without one), with its own now playing,
 * controls and members that can be switched on and off.
 */
export function useMusic() {
  const [music, setMusic] = useState({ available: false })
  // Speaker switches the user just flipped, shown until Music Assistant confirms them.
  const [flipped, setFlipped] = useState({})
  useEffect(() => {
    const load = () =>
      fetch('api/music')
        .then((r) => r.json())
        .then((m) => {
          setMusic(m)
          setFlipped({})
        })
        .catch(() => {})
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

  const setGroup = (change) => setMusic((m) => ({ ...m, group: m.group && { ...m.group, ...change } }))
  const group = music.group && {
    ...music.group,
    members: music.group.members.map((s) => (s.id in flipped ? { ...s, on: flipped[s.id] } : s)),
    playPause: () => {
      setGroup({ playing: !music.group.playing })
      post('api/music/group/play_pause')
    },
    next: () => post('api/music/group/next'),
    previous: () => post('api/music/group/previous'),
    setVolume: (volume) => {
      setGroup({ volume })
      post('api/music/group/volume', { volume })
    },
    setSpeaker: (id, on) => {
      setFlipped((f) => ({ ...f, [id]: on }))
      // A refused switch reloads, which drops the optimistic state.
      post('api/music/speaker', { id, on }).then((r) => r.ok || setFlipped(({ [id]: _, ...rest }) => rest))
    },
  }

  return { ...music, group, playPause, next, previous, setVolume }
}

/** Track search; throws with the add-on's error message. */
export async function searchTracks(query) {
  const res = await post('api/music/search', { query })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body.tracks
}

/** Plays a track now on the group (or the panel). */
export const playTrack = (uri) => post('api/music/play', { uri })
