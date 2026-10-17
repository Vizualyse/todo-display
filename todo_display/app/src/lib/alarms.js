// Kept in step with server/alarms.js and the chimes in esphome/chimes.h.
export const ALARM_OFFSETS = [
  { minutes: 60, label: '1 hour', short: '1h' },
  { minutes: 30, label: '30 min', short: '30m' },
  { minutes: 5, label: '5 min', short: '5m' },
]

export const CHIMES = [
  { id: 'bell', label: 'Bell' },
  { id: 'dingdong', label: 'Ding-dong' },
  { id: 'chirp', label: 'Chirp' },
  { id: 'harp', label: 'Harp' },
]

export const DEFAULT_ALARM = { offsets: [], chime: 'bell' }

/** Alarms play at full volume; tap-sound mute doesn't silence them. */
export const ALARM_VOLUME = 100

/** "1h · 5m", or null when no offset is on. */
export function alarmSummary(alarm) {
  const on = ALARM_OFFSETS.filter((o) => alarm?.offsets?.includes(o.minutes))
  return on.length ? on.map((o) => o.short).join(' · ') : null
}
