import { useState } from 'react'
import { ALARM_OFFSETS, ALARM_VOLUME, CHIMES } from '../../lib/alarms.js'
import { BellIcon, ChevronIcon, CloseIcon, PlayIcon } from '../ui/icons.jsx'

const preview = (chime) => window.__sound?.(chime, ALARM_VOLUME)

/**
 * Which reminders ring before a timed todo, and with which chime. The chime list is
 * drawn in the page (no native <select>: its popup isn't part of the screenshot), and
 * picking one plays it on the panel.
 */
export function AlarmPicker({ value, onChange, onClose }) {
  const [open, setOpen] = useState(false)
  const toggle = (minutes) =>
    onChange({
      ...value,
      offsets: value.offsets.includes(minutes) ? value.offsets.filter((m) => m !== minutes) : [...value.offsets, minutes],
    })
  const chime = CHIMES.find((c) => c.id === value.chime) ?? CHIMES[0]
  const pick = (id) => {
    onChange({ ...value, chime: id })
    setOpen(false)
    preview(id)
  }
  const round = 'grid size-9 shrink-0 place-items-center rounded-full border border-blush-200 bg-pearl text-rosegold'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <p className="flex-1 pl-1 font-serif text-[19px] italic">Remind me before</p>
        <button onClick={onClose} aria-label="Back to keyboard" className={round}>
          <CloseIcon />
        </button>
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-1.5">
        {ALARM_OFFSETS.map((o) => {
          const on = value.offsets.includes(o.minutes)
          return (
            <button
              key={o.minutes}
              role="switch"
              aria-checked={on}
              onClick={() => toggle(o.minutes)}
              className={`flex h-11 items-center justify-center gap-2 rounded-2xl border text-[12px] font-medium tracking-[0.14em] uppercase ${
                on ? 'border-plum bg-plum text-blush-100' : 'border-blush-200 bg-pearl text-plum-soft'
              }`}
            >
              <BellIcon />
              {o.label}
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <p className="w-16 pl-1 text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase">Chime</p>
        <button
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-blush-200 bg-pearl px-4 text-left font-serif text-[18px] text-plum"
        >
          <span className="flex-1 truncate">{chime.label}</span>
          <span className="text-rosegold">
            <ChevronIcon />
          </span>
        </button>
        <button data-silent onClick={() => preview(chime.id)} aria-label="Play chime" className={round}>
          <PlayIcon />
        </button>
      </div>
      {open && (
        // Opens upwards over the toggles, so it fits the short landscape area too.
        <div data-silent role="listbox" className="absolute right-11 bottom-[52px] left-[72px] z-10 rounded-2xl border border-blush-200 bg-pearl p-1">
          {CHIMES.map((c) => (
            <button
              key={c.id}
              role="option"
              aria-selected={c.id === chime.id}
              onClick={() => pick(c.id)}
              className={`flex h-8 w-full items-center rounded-xl px-3 text-left font-serif text-[16px] ${
                c.id === chime.id ? 'bg-plum text-blush-100' : 'text-plum'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
