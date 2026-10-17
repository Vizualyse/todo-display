import { useState } from 'react'
import { CheckIcon, FilterIcon } from '../ui/icons.jsx'
import { ListDot } from '../ui/ListDot.jsx'

/**
 * A round button beside the status filters that picks which todo lists are shown.
 * `up` opens the picker above the button, for when it sits at the bottom of the screen.
 */
export function ListFilter({ lists, selected, onToggle, up }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Lists"
        aria-expanded={open}
        className={`grid size-[58px] place-items-center rounded-full border border-blush-200 ${
          open ? 'bg-rosegold text-pearl' : 'bg-pearl text-rosegold'
        }`}
      >
        <FilterIcon />
      </button>
      {open && (
        <>
          {/* Same flat tint as the heart menu. A tap outside closes the picker. */}
          <button aria-label="Close lists" onClick={() => setOpen(false)} className="fixed inset-0 z-10 bg-plum/10" />
          <div
            role="menu"
            className={`absolute right-0 z-20 w-60 rounded-[22px] border border-blush-200 bg-pearl p-2 ${
              up ? 'bottom-[calc(100%+12px)]' : 'top-[calc(100%+12px)]'
            }`}
          >
            <span
              aria-hidden
              className={`absolute right-[23px] size-3 rotate-45 border-blush-200 bg-pearl ${
                up ? '-bottom-[7px] border-r border-b' : '-top-[7px] border-t border-l'
              }`}
            />
            <p className="px-3 pt-1.5 pb-2 text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase">Lists</p>
            {lists.length === 0 && <p className="px-3 pb-2 text-[13px] text-plum-soft italic">No todo lists found</p>}
            {lists.map((l) => {
              const on = selected.has(l.id)
              return (
                <button
                  key={l.id}
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => onToggle(l.id)}
                  className="flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-serif text-[19px] text-plum"
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-lg border-[1.5px] ${
                      on ? 'border-rosegold bg-rosegold text-pearl' : 'border-blush-300 bg-pearl'
                    }`}
                  >
                    {on && <CheckIcon />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <ListDot index={l.index} />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
