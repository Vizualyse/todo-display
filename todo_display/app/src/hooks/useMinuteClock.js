import { useEffect, useState } from 'react'

/** The current time, updated on every minute boundary. */
export function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60_000 - (Date.now() % 60_000))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return now
}
