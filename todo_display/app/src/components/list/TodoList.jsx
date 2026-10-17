import { useDragScroll } from '../../hooks/useDragScroll.js'
import { formatDue, timeLeft } from '../../lib/dates.js'
import { TodoRow } from './TodoRow.jsx'

export function TodoList({ todos, onToggle, onEdit, now }) {
  if (todos.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center rounded-[28px] border border-dashed border-blush-300">
        <p className="font-script text-4xl text-rosegold">Nothing here, sweetheart</p>
      </div>
    )
  }
  return <ScrollingList todos={todos} onToggle={onToggle} onEdit={onEdit} now={now} />
}

/** `data-scroll` marks the element whose scroll the panel replays as pixel copies. */
function ScrollingList({ todos, onToggle, onEdit, now }) {
  const ref = useDragScroll()
  return (
    <ul
      ref={ref}
      data-scroll
      className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pb-8 [mask-image:linear-gradient(to_bottom,black_92%,transparent)] [scrollbar-width:none]"
    >
      {todos.map((t) => (
        <li key={t.id}>
          <TodoRow todo={t} onToggle={onToggle} onEdit={onEdit} due={formatDue(t.due, now)} left={timeLeft(t.due, now)} />
        </li>
      ))}
    </ul>
  )
}
