import { CloseIcon } from '../ui/icons.jsx'

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

/**
 * Hour and minute grids for a due time ("HH:MM"). Picking an hour keeps the minutes
 * (":00" the first time); "All day" clears the time.
 */
export function TimePicker({ value, onPick, onClose }) {
  const [hour, minute] = value ? value.split(':') : [null, null]
  const cell = (active) =>
    `rounded-lg border text-[15px] tabular-nums ${active ? 'border-plum bg-plum text-blush-100' : 'border-blush-200 bg-pearl text-plum'}`

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-2">
        <p className="flex-1 pl-1 font-serif text-[19px] italic">{value ? `At ${value}` : 'Pick a time'}</p>
        <button
          onClick={() => onPick(null)}
          className={`h-9 rounded-full border px-3.5 text-[11px] font-medium tracking-[0.14em] uppercase ${
            value ? 'border-blush-200 bg-pearl text-plum-soft' : 'border-plum bg-plum text-blush-100'
          }`}
        >
          All day
        </button>
        <button
          onClick={onClose}
          aria-label="Back to keyboard"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-blush-200 bg-pearl text-rosegold"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="grid min-h-0 flex-[2] auto-rows-fr grid-cols-6 gap-1">
          {HOURS.map((h) => (
            <button key={h} onClick={() => onPick(`${h}:${minute ?? '00'}`)} className={cell(h === hour)}>
              {h}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-3 gap-1">
          {MINUTES.map((m) => (
            <button key={m} onClick={() => onPick(`${hour ?? '09'}:${m}`)} className={cell(m === minute)}>
              :{m}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
