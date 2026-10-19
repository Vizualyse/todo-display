import { useEffect, useState } from 'react'

/**
 * The weather from the add-on: Home Assistant's weather entity with its hourly
 * and daily forecasts. `available` is false without a weather entity.
 */
export function useWeather() {
  const [weather, setWeather] = useState({ available: false })
  useEffect(() => {
    const load = () =>
      fetch('api/weather')
        .then((r) => r.json())
        .then(setWeather)
        .catch(() => {})
    load()
    const events = new EventSource('api/events')
    events.addEventListener('weather', load)
    return () => events.close()
  }, [])
  return weather
}
