/**
 * The weather the page shows, from Home Assistant's weather entity: its current
 * state (live, through the source) plus hourly and daily forecasts from
 * weather.get_forecasts. Forecasts aren't attributes any more, so they are fetched
 * every 30 minutes and soon after the entity changes (Met.no updates about hourly).
 * `onChange` fires only when what the page gets changes.
 */
export function createWeather({ source, log, onChange }) {
  let forecast = { hourly: [], daily: [] }
  let lastView = ''
  let refreshTimer = null

  const hour = (h) => ({
    time: h.datetime,
    condition: h.condition ?? null,
    temperature: h.temperature ?? null,
    precipitation: h.precipitation ?? null,
    // Met.no has no chance of rain; other providers do.
    probability: h.precipitation_probability ?? null,
  })

  function view() {
    const w = source.weather
    if (!w || w.state === 'unavailable' || w.state === 'unknown') return { available: false }
    const a = w.attributes
    return {
      available: true,
      condition: w.state,
      temperature: a.temperature ?? null,
      unit: a.temperature_unit ?? '°C',
      humidity: a.humidity ?? null,
      wind: a.wind_speed ?? null,
      windUnit: a.wind_speed_unit ?? 'km/h',
      hourly: forecast.hourly.slice(0, 48).map(hour),
      daily: forecast.daily.slice(0, 7).map((d) => ({ ...hour(d), low: d.templow ?? null })),
    }
  }

  function changed() {
    const now = JSON.stringify(view())
    if (now === lastView) return
    lastView = now
    onChange()
  }

  async function refresh() {
    const w = source.weather
    if (!w) {
      forecast = { hourly: [], daily: [] }
      return changed()
    }
    // FORECAST_DAILY = 1, FORECAST_HOURLY = 2.
    const features = w.attributes.supported_features ?? 3
    try {
      const [hourly, daily] = await Promise.all([
        features & 2 ? source.weatherForecast('hourly') : [],
        features & 1 ? source.weatherForecast('daily') : [],
      ])
      forecast = { hourly, daily }
    } catch (err) {
      log(`weather forecast failed: ${err.message}`)
    }
    changed()
  }

  setInterval(refresh, 30 * 60_000)

  return {
    /** What /api/weather returns. */
    get state() {
      return view()
    },
    /** The entity changed: show it now, and fetch the forecast once the burst settles. */
    entityChanged() {
      changed()
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(refresh, 2000)
    },
  }
}
