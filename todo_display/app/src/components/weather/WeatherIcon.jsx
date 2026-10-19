import { Icon } from '../ui/icons.jsx'

// Flat line icons, like the rest; never animated (every moving pixel is streamed).
const CLOUD = 'M7.5 18.5h9a4 4 0 0 0 .4-7.98 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7.5 18.5z'
const HIGH_CLOUD = 'M7.5 14.5h9a4 4 0 0 0 .4-7.98 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7.5 14.5z'
const SUN = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'
const MOON = 'M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z'
const DROPS = 'M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5'
const POUR = 'M8.5 17l-1.5 4.5M12.5 17l-1.5 4.5M16.5 17l-1.5 4.5'
const FLAKES = 'M8 18.5h.01M12 20.5h.01M16 18.5h.01M10 22h.01M14 22h.01'
const BOLT = 'M13 15.5l-2.5 3.5h3L11 22.5'
const PARTLY = 'M8 2.5v1.5M2.5 8H4M4.1 4.1l1 1M11.9 4.1l-1 1M4.6 10.8A3.5 3.5 0 1 1 10.9 6.4M10 20.5h7a3.5 3.5 0 0 0 .3-7 4.5 4.5 0 0 0-8.6 1A3 3 0 0 0 10 20.5z'
const FOG = 'M4 8h16M3 12h18M5 16h14M8 20h8'
const WIND = 'M3 8.5h10.5A2.5 2.5 0 1 0 11 6M3 12.5h15a2.5 2.5 0 1 1-2.5 2.5M3 16.5h7'

const PATHS = {
  'clear-night': MOON,
  cloudy: CLOUD,
  exceptional: CLOUD,
  fog: FOG,
  hail: HIGH_CLOUD + FLAKES,
  lightning: HIGH_CLOUD + BOLT,
  'lightning-rainy': HIGH_CLOUD + BOLT + 'M8 17.5l-1 2.5M17 17.5l-1 2.5',
  partlycloudy: PARTLY,
  pouring: HIGH_CLOUD + POUR,
  rainy: HIGH_CLOUD + DROPS,
  snowy: HIGH_CLOUD + FLAKES,
  'snowy-rainy': HIGH_CLOUD + 'M8.5 17.5l-1 2.5M16.5 17.5l-1 2.5M12 20.5h.01',
  sunny: SUN,
  windy: WIND,
  'windy-variant': WIND,
}

export function WeatherIcon({ condition, className = 'size-5' }) {
  return <Icon className={className} d={PATHS[condition] ?? CLOUD} />
}
