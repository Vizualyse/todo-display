import { ListIcon, PlusIcon } from '../ui/icons.jsx'
import { TABS } from './tabs.js'

export function TabMenu({ value, onChange, onClose }) {
  return (
    <>
      {/* Flat tint, no blur or shadow: the panel is RGB565. A tap outside closes the menu. */}
      <button aria-label="Close menu" onClick={onClose} className="absolute inset-0 z-10 bg-plum/10" />
      <div role="menu" className="absolute top-[82px] right-7 z-20 w-60 rounded-[22px] border border-blush-200 bg-pearl p-2">
        <span aria-hidden className="absolute -top-[7px] right-[15px] size-3 rotate-45 border-t border-l border-blush-200 bg-pearl" />
        <p className="px-3 pt-1.5 pb-2 text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase">Show</p>
        {TABS.map((t) => {
          const active = t.id === value
          return (
            <button
              key={t.id}
              role="menuitem"
              onClick={() => onChange(t.id)}
              className={`flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-serif text-[19px] ${
                active ? 'bg-plum text-blush-100' : 'text-plum'
              }`}
            >
              <span className={`grid size-7 place-items-center rounded-full ${active ? 'bg-rosegold text-pearl' : 'bg-blush-100 text-rosegold'}`}>
                {t.id === 'list' ? <ListIcon /> : <PlusIcon />}
              </span>
              {t.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
