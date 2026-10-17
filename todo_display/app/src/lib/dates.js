export const isDateOnly = (due) => /^\d{4}-\d{2}-\d{2}$/.test(due)
export const parseDue = (due) => (isDateOnly(due) ? new Date(`${due}T00:00:00`) : new Date(due))
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const isoDate = (d) => d.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
export const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const addDays = (d, n) => {
  d.setDate(d.getDate() + n)
  return d
}

/** HA due values are "YYYY-MM-DD" or an ISO datetime; show them relative to now. */
export function formatDue(due, now) {
  if (!due) return null
  const dateOnly = isDateOnly(due)
  const date = parseDue(due)
  const days = Math.round((midnight(date) - midnight(now)) / 86_400_000)
  const time = dateOnly ? '' : ` ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  const overdue = dateOnly ? days < 0 : date < now
  if (days === 0) return { label: `Today${time}`, overdue }
  if (days === 1) return { label: `Tomorrow${time}`, overdue }
  if (days === -1) return { label: `Yesterday${time}`, overdue }
  if (days > 1 && days < 7) return { label: date.toLocaleDateString('en-GB', { weekday: 'long' }) + time, overdue }
  return { label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), overdue }
}

/** A date-only due runs to the end of that day. */
export function deadlineOf(due) {
  const deadline = parseDue(due)
  if (isDateOnly(due)) deadline.setDate(deadline.getDate() + 1)
  return deadline
}

/** Time until the deadline. */
export function timeLeft(due, now) {
  if (!due) return null
  const ms = deadlineOf(due) - now
  const overdue = ms <= 0
  // Round towards the deadline, so "0m" never shows while there is time left.
  const mins = overdue ? Math.floor(-ms / 60_000) : Math.ceil(ms / 60_000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const value = d >= 7 ? `${d}d` : d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
  return { value, overdue }
}
