import { useEffect, useState } from 'react'

/**
 * The panel's voice assistant (its Assist satellite in Home Assistant): `state` is
 * idle, listening, processing or responding. `available` is false without one.
 * `talk` starts listening, or stops the request that's running.
 */
export function useVoice() {
  const [voice, setVoice] = useState({ available: false })
  useEffect(() => {
    fetch('api/voice')
      .then((r) => r.json())
      .then(setVoice)
      .catch(() => {})
    const events = new EventSource('api/events')
    // The event carries the state, so listening lights up without another request.
    events.addEventListener('voice', (e) => setVoice(JSON.parse(e.data)))
    return () => events.close()
  }, [])

  // Optimistic, so the button lights (or goes out) in the very next frame.
  const talk = () => {
    setVoice((v) => ({ ...v, state: v.state === 'idle' ? 'listening' : 'idle' }))
    fetch('api/voice/talk', { method: 'POST' })
  }
  return { ...voice, talk }
}
