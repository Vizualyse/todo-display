import { addDays, deadlineOf, dueTime, isDateOnly, isoDate, parseDue } from './dates.js'

export const FILTERS = [
  { id: 'open', label: 'To do', test: (t) => !t.done },
  { id: 'done', label: 'Done', test: (t) => t.done },
  { id: 'all', label: 'All', test: () => true },
]

/**
 * Soonest deadline first (overdue at the top, as the most urgent), then undated
 * items, then done ones. The sort is stable, so ties keep Home Assistant's order.
 */
export function byUpcoming(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1
  if (!a.due || !b.due) return !a.due - !b.due
  return deadlineOf(a.due) - deadlineOf(b.due)
}

export const DUE_CHOICES = [
  { id: 'none', label: 'No date', date: () => null },
  { id: 'today', label: 'Today', date: (d) => d },
  { id: 'tomorrow', label: 'Tomorrow', date: (d) => addDays(d, 1) },
  // Today if it is already the weekend, otherwise the coming Saturday.
  { id: 'weekend', label: 'Weekend', date: (d) => addDays(d, d.getDay() === 0 ? 0 : 6 - d.getDay()) },
  { id: 'custom', label: 'Custom' }, // picked on a calendar
]

/**
 * The form's starting due choice: a quick chip when one matches, otherwise a custom
 * date; plus the time ("HH:MM") when the due has one.
 */
export function initialDue(due) {
  if (!due) return { id: 'none', custom: null, time: null }
  const date = isDateOnly(due) ? due : isoDate(parseDue(due))
  const time = dueTime(due)
  const quick = DUE_CHOICES.find((c) => c.id !== 'none' && c.date && isoDate(c.date(new Date())) === date)
  return quick ? { id: quick.id, custom: null, time } : { id: 'custom', custom: date, time }
}

/** "YYYY-MM-DD", "YYYY-MM-DDTHH:MM" (local time) when a time is set, or null for none. */
export function dueValue(id, customDate, time) {
  const date = id === 'custom' ? customDate : DUE_CHOICES.find((c) => c.id === id).date(new Date())
  if (!date) return null
  const day = typeof date === 'string' ? date : isoDate(date)
  return time ? `${day}T${time}` : day
}
