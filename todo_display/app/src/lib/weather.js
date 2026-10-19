// Weather from the add-on (/api/weather): the brolly line, hours and days to show.

export const CONDITIONS = {
  'clear-night': 'Clear',
  cloudy: 'Cloudy',
  exceptional: 'Unusual weather',
  fog: 'Fog',
  hail: 'Hail',
  lightning: 'Thunder',
  'lightning-rainy': 'Thunderstorms',
  partlycloudy: 'Partly cloudy',
  pouring: 'Heavy rain',
  rainy: 'Rain',
  snowy: 'Snow',
  'snowy-rainy': 'Sleet',
  sunny: 'Sunny',
  windy: 'Windy',
  'windy-variant': 'Windy',
}

const WET = new Set(['rainy', 'pouring', 'lightning-rainy', 'hail', 'snowy', 'snowy-rainy'])
const SNOW = new Set(['snowy', 'snowy-rainy'])

/**
 * A wet hour: a 50% chance where the provider gives one, else 0.1mm or more
 * (Met.no only gives amounts), else a wet condition.
 */
export function isWet(h) {
  if (h.probability != null) return h.probability >= 50
  if (h.precipitation != null) return h.precipitation >= 0.1
  return WET.has(h.condition)
}

/** "3pm", "11am", "noon", "midnight". */
export function formatHour(d) {
  const h = d.getHours()
  if (h === 0) return 'midnight'
  if (h === 12) return 'noon'
  return `${h % 12}${h < 12 ? 'am' : 'pm'}`
}

function formatRange(a, b) {
  const [from, to] = [formatHour(a), formatHour(b)]
  // "3–6pm", but "11am–2pm" and "10pm–midnight".
  const suffix = (s) => s.match(/[ap]m$/)?.[0]
  return suffix(from) && suffix(from) === suffix(to) ? `${from.slice(0, -2)}–${to}` : `${from}–${to}`
}

const at = (now, days, hour) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour)
const startOfHour = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours())
const sameDay = (a, b) => a.toDateString() === b.toDateString()

/**
 * Whether a brolly is needed: for the rest of today, or from 8pm for tomorrow
 * (6am-10pm). `text` is the chip ("Brolly needed at 3pm", "Brolly needed tomorrow
 * 7am", "No brolly today");
 * `detail` says when and how much ("Light rain 3–6pm · 1.9mm"), null when dry.
 */
export function brolly(weather, now) {
  const tomorrow = now.getHours() >= 20
  const day = tomorrow ? 'tomorrow' : 'today'
  const start = tomorrow ? at(now, 1, 6) : startOfHour(now)
  const end = tomorrow ? at(now, 1, 22) : at(now, 1, 0)
  const hours = (weather.hourly ?? [])
    .map((h) => ({ ...h, date: new Date(h.time) }))
    .filter((h) => h.date >= start && h.date < end)
  const dry = { wet: false, text: `No brolly ${day}`, detail: null }

  // Providers without hourly forecasts: the day's forecast is all there is.
  if (!hours.length) {
    const target = tomorrow ? at(now, 1, 12) : now
    const daily = (weather.daily ?? []).find((d) => sameDay(new Date(d.time), target))
    if (!daily || !isWet(daily)) return dry
    return { wet: true, text: `Brolly needed ${day}`, detail: CONDITIONS[daily.condition] ?? 'Rain' }
  }

  // The current hour is often not in the forecast yet (it starts at the next hour).
  const rainingNow = !tomorrow && (WET.has(weather.condition) || (isWet(hours[0]) && hours[0].date <= now))
  const first = hours.findIndex(isWet)
  if (!rainingNow && first < 0) return dry

  const from = rainingNow ? null : hours[first].date
  const text = tomorrow ? `Brolly needed tomorrow ${formatHour(from)}` : from ? `Brolly needed at ${formatHour(from)}` : 'Brolly needed now'

  // The first spell: until the first dry hour after it starts.
  const spellStart = rainingNow ? 0 : first
  let spellEnd = hours.findIndex((h, i) => i >= spellStart && !isWet(h) && h.date > now)
  if (spellEnd < 0) spellEnd = hours.length
  const spell = hours.slice(spellStart, spellEnd)
  const mm = spell.reduce((sum, h) => sum + (h.precipitation ?? 0), 0)
  const snow = spell.some((h) => SNOW.has(h.condition)) || (rainingNow && SNOW.has(weather.condition))
  const heavy = spell.some((h) => h.condition === 'pouring') || mm >= 5
  const noun = snow ? 'Snow' : heavy ? 'Heavy rain' : mm > 0 && mm < 1 ? 'Light rain' : 'Rain'
  const until = spellEnd < hours.length ? hours[spellEnd].date : null
  const when = rainingNow
    ? until ? `until ${formatHour(until)}` : now.getHours() < 12 ? 'all day' : 'until late'
    : until ? formatRange(from, until) : `from ${formatHour(from)}`
  const more = hours.slice(spellEnd).some(isWet) ? ', more later' : ''
  const amount = mm >= 0.1 ? ` · ${mm.toFixed(1)}mm` : ''
  return { wet: true, text, detail: `${noun} ${when}${more}${amount}` }
}

/** The next `count` forecast hours, from the current one. */
export function upcomingHours(weather, now, count = 8) {
  const start = startOfHour(now)
  return (weather.hourly ?? []).filter((h) => new Date(h.time) >= start).slice(0, count)
}

/** Today's high and low, if the daily forecast has today. */
export function todayRange(weather, now) {
  const today = (weather.daily ?? []).find((d) => sameDay(new Date(d.time), now))
  return today ? { high: today.temperature, low: today.low } : null
}

/** Forecast days from today on, labelled "Today", "Tue", ... */
export function upcomingDays(weather, now, count = 4) {
  const midnight = at(now, 0, 0)
  return (weather.daily ?? [])
    .filter((d) => new Date(d.time) >= midnight)
    .slice(0, count)
    .map((d) => {
      const date = new Date(d.time)
      return { ...d, label: sameDay(date, now) ? 'Today' : date.toLocaleDateString('en-GB', { weekday: 'short' }) }
    })
}

export const degrees = (t) => (t == null ? '–' : `${Math.round(t)}°`)
