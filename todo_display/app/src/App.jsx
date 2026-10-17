import { useEffect, useState } from 'react'
import { FORCED_ORIENTATION } from './params.js'

const LIST_DOTS = {
  Home: 'bg-rosegold',
  Errands: 'bg-champagne',
  Work: 'bg-plum-soft',
}

const FILTERS = [
  { id: 'open', label: 'To do', test: (t) => !t.done },
  { id: 'done', label: 'Done', test: (t) => t.done },
  { id: 'all', label: 'All', test: () => true },
]

function useOrientation() {
  const get = () => FORCED_ORIENTATION || (innerHeight > innerWidth ? 'portrait' : 'landscape')
  const [orientation, setOrientation] = useState(get)
  useEffect(() => {
    if (FORCED_ORIENTATION) return
    const onResize = () => setOrientation(get())
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])
  return orientation
}

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60_000 - (Date.now() % 60_000))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return now
}

function useTodos() {
  const [todos, setTodos] = useState([])
  useEffect(() => {
    const load = () => fetch('api/todos').then((r) => r.json()).then(setTodos).catch(() => {})
    load()
    const events = new EventSource('api/events')
    events.onmessage = load
    return () => events.close()
  }, [])

  const toggle = (id) => {
    // Optimistic: the DOM changes immediately, so the panel gets its new frame fast.
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
    fetch(`api/todos/${id}/toggle`, { method: 'POST' })
  }
  return { todos, toggle }
}

export default function App() {
  const orientation = useOrientation()
  const now = useMinuteClock()
  const { todos, toggle } = useTodos()
  const [filter, setFilter] = useState('open')

  const visible = todos.filter(FILTERS.find((f) => f.id === filter).test)
  const header = <Header now={now} />
  const summary = <Summary todos={todos} />
  const filters = <Filters value={filter} onChange={setFilter} todos={todos} />
  const list = <TodoList todos={visible} onToggle={toggle} />

  if (orientation === 'landscape') {
    return (
      <Shell className="grid grid-cols-[280px_1fr] gap-7">
        <aside className="flex min-h-0 flex-col gap-5">
          {header}
          <Flourish />
          {summary}
          <div className="mt-auto">{filters}</div>
        </aside>
        {list}
      </Shell>
    )
  }

  return (
    <Shell className="flex flex-col gap-5">
      {header}
      <Flourish />
      {summary}
      {filters}
      {list}
    </Shell>
  )
}

function Shell({ className, children }) {
  return (
    <div className={`h-full overflow-hidden bg-blush-50 px-7 py-6 font-sans text-plum antialiased select-none ${className}`}>
      {children}
    </div>
  )
}

function Header({ now }) {
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning, darling' : hour < 18 ? 'Good afternoon, darling' : 'Good evening, darling'
  return (
    <header>
      <p className="font-script text-[34px] leading-none text-rosegold">{greeting}</p>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-[38px] leading-none font-semibold tracking-tight">
            {now.toLocaleDateString('en-GB', { weekday: 'long' })}
          </h1>
          <p className="mt-2 text-[13px] font-medium tracking-[0.28em] text-plum-soft uppercase">
            {now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <p className="font-serif text-[32px] leading-none text-rosegold-deep italic tabular-nums">
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </header>
  )
}

function Flourish() {
  return (
    <div className="flex items-center gap-3 text-rosegold" aria-hidden>
      <span className="h-px flex-1 bg-blush-300" />
      <svg viewBox="0 0 12 12" className="size-2.5 fill-current">
        <path d="M6 0L7.6 4.4 12 6 7.6 7.6 6 12 4.4 7.6 0 6 4.4 4.4z" />
      </svg>
      <span className="h-px flex-1 bg-blush-300" />
    </div>
  )
}

function Summary({ todos }) {
  const done = todos.filter((t) => t.done).length
  const total = todos.length
  const left = total - done
  return (
    <section className="flex items-center gap-5 rounded-[28px] bg-blush-100 px-6 py-5">
      <ProgressRing value={total ? done / total : 0} />
      <div>
        <p className="font-serif text-[26px] leading-tight font-medium">
          {left === 0 ? (
            <>
              All done, <span className="italic">gorgeous</span>
            </>
          ) : (
            <>
              <span className="italic">{left}</span> lovely thing{left === 1 ? '' : 's'} to do
            </>
          )}
        </p>
        <p className="mt-1 text-[12px] font-medium tracking-[0.24em] text-plum-soft uppercase">
          {done} of {total} complete
        </p>
      </div>
    </section>
  )
}

function ProgressRing({ value, size = 66, stroke = 5 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-blush-200" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          className="stroke-rosegold"
        />
      </svg>
      <Heart className="absolute inset-0 m-auto size-5 text-rosegold" />
    </div>
  )
}

function Filters({ value, onChange, todos }) {
  return (
    <nav className="grid grid-cols-3 gap-1 rounded-full border border-blush-200 bg-pearl p-1">
      {FILTERS.map((f) => {
        const active = f.id === value
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            className={`flex h-12 items-center justify-center gap-2 rounded-full text-[13px] font-medium tracking-[0.2em] uppercase ${
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

function TodoList({ todos, onToggle }) {
  if (todos.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center rounded-[28px] border border-dashed border-blush-300">
        <p className="font-script text-4xl text-rosegold">Nothing here, sweetheart</p>
      </div>
    )
  }
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden [mask-image:linear-gradient(to_bottom,black_92%,transparent)]">
      {todos.map((t) => (
        <li key={t.id}>
          <TodoRow todo={t} onToggle={onToggle} />
        </li>
      ))}
    </ul>
  )
}

function TodoRow({ todo, onToggle }) {
  return (
    <button
      onClick={() => onToggle(todo.id)}
      className="flex w-full items-center gap-4 rounded-[22px] border border-blush-200 bg-pearl px-5 py-3.5 text-left"
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] ${
          todo.done ? 'border-rosegold bg-rosegold text-pearl' : 'border-blush-300'
        }`}
      >
        {todo.done && (
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-serif text-[20px] leading-snug ${
            todo.done ? 'text-plum-soft/60 italic line-through decoration-blush-300' : 'text-plum'
          }`}
        >
          {todo.title}
        </span>
        <span className="mt-1 flex items-center gap-2 text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase">
          <span className={`size-1.5 rounded-full ${LIST_DOTS[todo.list]}`} />
          {todo.list}
          <span className="text-blush-300">·</span>
          {todo.due}
        </span>
      </span>
      {todo.priority && !todo.done && <Heart className="size-5 shrink-0 text-rosegold" />}
    </button>
  )
}

function Heart({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={`fill-current ${className}`} aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.2 3 4.5 6.6 4.5c2.2 0 3.6 1.2 4.4 2.5.8-1.3 2.2-2.5 4.4-2.5 3.6 0 5.7 3.7 4.2 7.1C19.5 16.4 12 21 12 21z" />
    </svg>
  )
}
