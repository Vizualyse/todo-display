import { FILTERS } from '../../lib/todos.js'

/** `compact` tightens the letter spacing for the narrow landscape sidebar. */
export function Filters({ value, onChange, todos, compact }) {
  return (
    <nav className="grid grid-cols-3 gap-1 rounded-full border border-blush-200 bg-pearl p-1">
      {FILTERS.map((f) => {
        const active = f.id === value
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className={`flex h-12 items-center justify-center rounded-full font-medium whitespace-nowrap uppercase ${
              compact ? 'gap-1 text-[12px] tracking-[0.08em]' : 'gap-2 text-[13px] tracking-[0.2em]'
            } ${
              active ? 'bg-plum text-blush-100' : 'text-plum-soft'
            }`}
          >
            {f.label}
            <span className={`font-serif text-[15px] tracking-normal italic ${active ? 'text-blush-300' : 'text-rosegold'}`}>
              {todos.filter(f.test).length}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
