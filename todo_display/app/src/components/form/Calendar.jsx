import { useState } from 'react'
import { isoDate } from '../../lib/dates.js'
import { CloseIcon, NextIcon, PrevIcon } from '../ui/icons.jsx'

/** Month grid for a custom due date, Monday first. Days before today can't be picked. */
export function Calendar({ value, onPick, onClose }) {
  const today = isoDate(new Date())
  const [month, setMonth] = useState(() => {
    const d = value ? new Date(`${value}T00:00:00`) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const lead = (month.getDay() + 6) % 7
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const nav = 'grid size-9 shrink-0 place-items-center rounded-full border border-blush-200 bg-pearl text-rosegold'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={() => shift(-1)} aria-label="Previous month" className={nav}>
          <PrevIcon />
        </button>
        <p className="flex-1 text-center font-serif text-[19px] italic">
          {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </p>
        <button onClick={() => shift(1)} aria-label="Next month" className={nav}>
          <NextIcon />
        </button>
        <button onClick={onClose} aria-label="Back to keyboard" className={nav}>
          <CloseIcon />
        </button>
      </div>
      <div className="grid shrink-0 grid-cols-7 text-center text-[10px] font-medium tracking-[0.2em] text-plum-soft uppercase">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />
          const iso = isoDate(new Date(month.getFullYear(), month.getMonth(), day))
          const selected = iso === value
          return (
            <button
              key={i}
              disabled={iso < today}
              onClick={() => onPick(iso)}
              className={`rounded-lg border text-[15px] tabular-nums disabled:border-transparent disabled:text-blush-300 ${
                selected
                  ? 'border-plum bg-plum text-blush-100'
                  : iso === today
                    ? 'border-rosegold bg-pearl text-rosegold-deep'
                    : 'border-blush-200 bg-pearl text-plum'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
