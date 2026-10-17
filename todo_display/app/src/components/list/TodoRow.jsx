import { CheckIcon, Heart } from '../ui/icons.jsx'
import { ListDot } from '../ui/ListDot.jsx'

/** The circle ticks the todo; the rest of the card opens it for editing. */
export function TodoRow({ todo, onToggle, onEdit, due, left }) {
  const overdue = due?.overdue && !todo.done
  return (
    <div className="flex w-full items-center rounded-[22px] border border-blush-200 bg-pearl">
      <button
        onClick={() => onToggle(todo.id)}
        aria-label={todo.done ? 'Mark as not done' : 'Mark as done'}
        className="grid shrink-0 place-items-center self-stretch pr-4 pl-5"
      >
        <span
          className={`grid size-9 place-items-center rounded-full border-[1.5px] ${
            todo.done ? 'border-rosegold bg-rosegold text-pearl' : 'border-blush-300'
          }`}
        >
          {todo.done && <CheckIcon />}
        </span>
      </button>
      <button onClick={() => onEdit(todo.id)} className="flex min-w-0 flex-1 items-center gap-4 py-3.5 pr-5 text-left">
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-serif text-[20px] leading-snug ${
              todo.done ? 'text-plum-soft/60 italic line-through decoration-blush-300' : 'text-plum'
            }`}
          >
            {todo.title}
          </span>
          <span className="mt-1 flex items-center gap-2 text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase">
            <ListDot index={todo.listIndex} />
            {todo.list}
            {due && (
              <>
                <span className="text-blush-300">·</span>
                <span className={overdue ? 'text-rosegold-deep' : undefined}>{due.label}</span>
              </>
            )}
          </span>
        </span>
        {left && !todo.done && (
          <span className="shrink-0 text-right">
            <span className={`block font-serif text-[18px] leading-none italic tabular-nums ${overdue ? 'text-rosegold-deep' : 'text-plum'}`}>
              {left.value}
            </span>
            <span className="mt-1.5 block text-[10px] font-medium tracking-[0.22em] text-plum-soft uppercase">
              {overdue ? 'overdue' : 'left'}
            </span>
          </span>
        )}
        {overdue && <Heart className="size-5 shrink-0 text-rosegold" />}
      </button>
    </div>
  )
}
