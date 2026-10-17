import fs from 'node:fs'
import path from 'node:path'

// Kept in step with src/lib/alarms.js and the chimes in esphome/chimes.h.
export const ALARM_OFFSETS = [60, 30, 5]
export const CHIMES = ['bell', 'dingdong', 'chirp', 'harp']
const ALARM_VOLUME = 100
const TICK_MS = 15_000
// A reminder still rings if the add-on was busy or restarting when it fell due.
const GRACE_MS = 90_000

/** { offsets: number[], chime } from a request body, null to clear, undefined if invalid. */
export function parseAlarm(value) {
  if (value === null) return null
  if (typeof value !== 'object' || !Array.isArray(value.offsets) || !CHIMES.includes(value.chime)) return undefined
  if (!value.offsets.every((m) => ALARM_OFFSETS.includes(m))) return undefined
  return { offsets: [...new Set(value.offsets)].sort((a, b) => b - a), chime: value.chime }
}

/**
 * Reminders per todo id, kept in the add-on's /data (Home Assistant has nowhere to
 * store them on the item). Without a writable file they live in memory only.
 */
export function createAlarmStore({ file, log }) {
  let alarms = {}
  try {
    alarms = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}

  const save = () => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(alarms))
    } catch (err) {
      log(`couldn't save alarms: ${err.message}`)
    }
  }

  return {
    get: (id) => alarms[id] ?? null,
    set(id, alarm) {
      if (alarm?.offsets.length) alarms[id] = alarm
      else delete alarms[id]
      save()
    },
  }
}

/** Rings each enabled reminder once, as a chime on every panel that can play sounds. */
export function startAlarmScheduler({ store, getTodos, play, log }) {
  const rung = new Set()
  const tick = () => {
    const now = Date.now()
    for (const todo of getTodos()) {
      const alarm = store.get(todo.id)
      // Date-only dues have no time to count back from.
      if (!alarm || todo.done || !todo.due || /^\d{4}-\d{2}-\d{2}$/.test(todo.due)) continue
      const due = new Date(todo.due).getTime()
      for (const minutes of alarm.offsets) {
        const at = due - minutes * 60_000
        const key = `${todo.id}|${todo.due}|${minutes}`
        if (now < at || now > at + GRACE_MS || rung.has(key)) continue
        rung.add(key)
        log(`alarm: "${todo.title}" in ${minutes} min, ${alarm.chime}`)
        play(alarm.chime, ALARM_VOLUME)
      }
    }
  }
  tick()
  return setInterval(tick, TICK_MS)
}
