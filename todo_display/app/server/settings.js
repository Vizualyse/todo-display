import fs from 'node:fs'
import path from 'node:path'

const DEFAULTS = { muted: false, volume: 0.5 }

/**
 * Display settings that must outlive an add-on restart, in /data (the headless
 * page's localStorage starts empty every time). `volume` mirrors the panel's own
 * master volume; it is only used as-is for firmware that can't report one.
 */
export function createSettings({ file, log }) {
  let settings = { ...DEFAULTS }
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch {}

  return {
    get: () => settings,
    /** Returns true if anything changed. */
    update(changes) {
      const next = { ...settings, ...changes }
      if (JSON.stringify(next) === JSON.stringify(settings)) return false
      settings = next
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, JSON.stringify(settings))
      } catch (err) {
        log(`couldn't save settings: ${err.message}`)
      }
      return true
    },
  }
}
