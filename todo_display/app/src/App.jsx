import { useEffect, useRef, useState } from 'react'
import { DISPLAY, FORCED_ORIENTATION, ROTATE } from './params.js'

const LIST_DOTS = ['bg-rosegold', 'bg-champagne', 'bg-plum-soft', 'bg-blush-300']

const isDateOnly = (due) => /^\d{4}-\d{2}-\d{2}$/.test(due)
const parseDue = (due) => (isDateOnly(due) ? new Date(`${due}T00:00:00`) : new Date(due))
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const isoDate = (d) => d.toLocaleDateString('en-CA') // YYYY-MM-DD in local time

/** HA due values are "YYYY-MM-DD" or an ISO datetime; show them relative to now. */
function formatDue(due, now) {
  if (!due) return null
  const dateOnly = isDateOnly(due)
  const date = parseDue(due)
  const days = Math.round((midnight(date) - midnight(now)) / 86_400_000)
  const time = dateOnly ? '' : ` ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  const overdue = dateOnly ? days < 0 : date < now
  if (days === 0) return { label: `Today${time}`, overdue }
  if (days === 1) return { label: `Tomorrow${time}`, overdue }
  if (days === -1) return { label: `Yesterday${time}`, overdue }
  if (days > 1 && days < 7) return { label: date.toLocaleDateString('en-GB', { weekday: 'long' }) + time, overdue }
  return { label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), overdue }
}

/** Time until the deadline; a date-only due runs to the end of that day. */
function timeLeft(due, now) {
  if (!due) return null
  const deadline = parseDue(due)
  if (isDateOnly(due)) deadline.setDate(deadline.getDate() + 1)
  const ms = deadline - now
  const overdue = ms <= 0
  // Round towards the deadline, so "0m" never shows while there is time left.
  const mins = overdue ? Math.floor(-ms / 60_000) : Math.ceil(ms / 60_000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const value = d >= 7 ? `${d}d` : d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
  return { value, overdue }
}

const addDays = (d, n) => {
  d.setDate(d.getDate() + n)
  return d
}

const DUE_CHOICES = [
  { id: 'none', label: 'No date', date: () => null },
  { id: 'today', label: 'Today', date: (d) => d },
  { id: 'tomorrow', label: 'Tomorrow', date: (d) => addDays(d, 1) },
  // Today if it is already the weekend, otherwise the coming Saturday.
  { id: 'weekend', label: 'Weekend', date: (d) => addDays(d, d.getDay() === 0 ? 0 : 6 - d.getDay()) },
  { id: 'week', label: 'Next week', date: (d) => addDays(d, 7) },
]

const FILTERS = [
  { id: 'open', label: 'To do', test: (t) => !t.done },
  { id: 'done', label: 'Done', test: (t) => t.done },
  { id: 'all', label: 'All', test: () => true },
]

const TABS = [
  { id: 'list', label: 'My list', title: 'My lovely list' },
  { id: 'add', label: 'Add a todo', title: 'Something new' },
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
  const [lists, setLists] = useState([])
  useEffect(() => {
    const load = () => {
      fetch('api/todos').then((r) => r.json()).then(setTodos).catch(() => {})
      fetch('api/lists').then((r) => r.json()).then(setLists).catch(() => {})
    }
    load()
    const events = new EventSource('api/events')
    events.onmessage = load
    return () => events.close()
  }, [])

  const toggle = (id) => {
    // Optimistic: the DOM changes immediately, so the panel gets its new frame fast.
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
    fetch(`api/todos/${encodeURIComponent(id)}/toggle`, { method: 'POST' })
  }

  /** Resolves once the source accepted it; the new item arrives through the event stream. */
  const add = async ({ list, title, due }) => {
    const res = await fetch('api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list, title, due }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`)
  }
  return { todos, lists, toggle, add }
}

export default function App() {
  const orientation = useOrientation()
  const now = useMinuteClock()
  const { todos, lists, toggle, add } = useTodos()
  const [filter, setFilter] = useState('open')
  const [tab, setTab] = useState('list')
  const [menuOpen, setMenuOpen] = useState(false)

  const showList = (f) => {
    setFilter(f)
    setTab('list')
  }
  const visible = todos.filter(FILTERS.find((f) => f.id === filter).test)
  const header = <Header now={now} clearMenu={orientation !== 'landscape'} />
  const summary = <Summary todos={todos} />
  const filters = <Filters value={tab === 'list' ? filter : null} onChange={showList} todos={todos} />
  const list = <TodoList todos={visible} onToggle={toggle} now={now} />
  const form = <AddForm lists={lists} onAdd={add} onAdded={() => showList('open')} compact={orientation === 'landscape'} />
  const menu = (
    <>
      <MenuButton open={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
      {menuOpen && (
        <TabMenu
          value={tab}
          onChange={(id) => {
            setTab(id)
            setMenuOpen(false)
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  )

  if (orientation === 'landscape') {
    return (
      <Shell className="grid grid-cols-[280px_minmax(0,1fr)] gap-7">
        <aside className="flex min-h-0 flex-col gap-5">
          {header}
          <Flourish />
          {summary}
          <div className="mt-auto">{filters}</div>
        </aside>
        <main className="flex min-h-0 flex-col gap-4">
          {/* Leaves room for the menu button in the top right corner. */}
          <h2 className="flex h-11 shrink-0 items-center pr-14 font-serif text-[26px] leading-none font-medium italic">
            {TABS.find((t) => t.id === tab).title}
          </h2>
          {tab === 'list' ? list : form}
        </main>
        {menu}
      </Shell>
    )
  }

  return (
    <Shell className="flex flex-col gap-5">
      {header}
      <Flourish />
      {tab === 'list' ? (
        <>
          {summary}
          {filters}
          {list}
        </>
      ) : (
        form
      )}
      {menu}
    </Shell>
  )
}

function Shell({ className, children }) {
  return (
    <div className={`relative h-full overflow-hidden bg-blush-50 px-7 py-6 font-sans text-plum antialiased select-none ${className}`}>
      {children}
    </div>
  )
}

/** A heart in a circle, pinned to the top right corner. Opens the tab menu. */
function MenuButton({ open, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Menu"
      aria-expanded={open}
      className={`absolute top-6 right-7 z-20 grid size-11 place-items-center rounded-full border-[1.5px] border-rosegold ${
        open ? 'bg-rosegold text-pearl' : 'bg-pearl text-rosegold'
      }`}
    >
      <Heart className="size-5" />
    </button>
  )
}

function TabMenu({ value, onChange, onClose }) {
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

function Header({ now, clearMenu }) {
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning, darling' : hour < 18 ? 'Good afternoon, darling' : 'Good evening, darling'
  return (
    <header>
      {/* In portrait the menu button sits at the end of this line. */}
      <p className={`font-script ${clearMenu ? 'pr-14' : ''} text-[34px] leading-none text-rosegold`}>{greeting}</p>
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
        <p className="mt-1 text-[12px] font-medium tracking-[0.2em] whitespace-nowrap text-plum-soft uppercase">
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

/**
 * Drag-to-scroll for mouse input, which is what panel touches arrive as. In portrait
 * the page is rotated onto the panel, so the finger's screen movement is mapped onto
 * the list's own axis. A drag swallows the click that would otherwise end it.
 */
function useDragScroll() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    const rotated = DISPLAY && FORCED_ORIENTATION !== 'landscape'
    const alongList = (dx, dy) => (!rotated ? dy : ROTATE === 90 ? -dx : dx)
    let start = null
    let dragged = false

    const onDown = (e) => {
      if (e.pointerType !== 'mouse') return
      start = { x: e.clientX, y: e.clientY, top: el.scrollTop }
      dragged = false
    }
    const onMove = (e) => {
      if (!start || !(e.buttons & 1)) return
      const delta = alongList(e.clientX - start.x, e.clientY - start.y)
      if (Math.abs(delta) > 12) dragged = true
      // Whole pixels, so the panel can shift what it already shows exactly.
      if (dragged) el.scrollTop = Math.round(start.top - delta)
    }
    const onUp = () => {
      start = null
    }
    const onClick = (e) => {
      if (!dragged) return
      dragged = false
      e.stopPropagation()
      e.preventDefault()
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('click', onClick, true)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('click', onClick, true)
    }
  }, [])
  return ref
}

function TodoList({ todos, onToggle, now }) {
  if (todos.length === 0) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center rounded-[28px] border border-dashed border-blush-300">
        <p className="font-script text-4xl text-rosegold">Nothing here, sweetheart</p>
      </div>
    )
  }
  return <ScrollingList todos={todos} onToggle={onToggle} now={now} />
}

function ScrollingList({ todos, onToggle, now }) {
  const ref = useDragScroll()
  return (
    <ul
      ref={ref}
      data-scroll
      className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pb-8 [mask-image:linear-gradient(to_bottom,black_92%,transparent)] [scrollbar-width:none]"
    >
      {todos.map((t) => (
        <li key={t.id}>
          <TodoRow todo={t} onToggle={onToggle} due={formatDue(t.due, now)} left={timeLeft(t.due, now)} />
        </li>
      ))}
    </ul>
  )
}

function TodoRow({ todo, onToggle, due, left }) {
  const overdue = due?.overdue && !todo.done
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
          <span className={`size-1.5 rounded-full ${LIST_DOTS[todo.listIndex % LIST_DOTS.length]}`} />
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
  )
}

const KEY_ROWS = {
  letters: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  symbols: ['1234567890', "-/:;()&@'", '.,?!"£'],
}

/**
 * New todo form. The panel has touch only, so it brings its own keyboard; a physical
 * keyboard works too when the page is opened in a browser.
 */
function AddForm({ lists, onAdd, onAdded, compact }) {
  const [text, setText] = useState('')
  const [listId, setListId] = useState(null)
  const [dueId, setDueId] = useState('none')
  const [shift, setShift] = useState(false)
  const [symbols, setSymbols] = useState(false)
  const [status, setStatus] = useState(null) // { busy } | { error }

  const list = lists.find((l) => l.id === listId) ?? lists[0]
  const title = text.trim()
  const canAdd = Boolean(title && list && !status?.busy)
  // Capitalise the first letter of the todo and of each sentence.
  const caps = shift || !text.trim() || /[.!?]\s$/.test(text)

  const type = (s) => {
    setStatus(null)
    setText((t) => (t + s).slice(0, 255))
  }
  const backspace = () => setText((t) => t.slice(0, -1))
  const submit = async () => {
    if (!canAdd) return
    setStatus({ busy: true })
    try {
      const date = DUE_CHOICES.find((c) => c.id === dueId).date(new Date())
      await onAdd({ list: list.id, title, due: date && isoDate(date) })
      setText('')
      setDueId('none')
      setStatus(null)
      onAdded()
    } catch (err) {
      setStatus({ error: `Couldn't add that: ${err.message}` })
    }
  }

  const keys = useRef(null)
  keys.current = { type, backspace, submit }
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') keys.current.submit()
      else if (e.key === 'Backspace') keys.current.backspace()
      else if (e.key.length === 1) keys.current.type(e.key)
      else return
      e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const press = (ch) => {
    type(caps ? ch.toUpperCase() : ch)
    setShift(false)
  }
  const keyHeight = compact ? 'h-[42px]' : 'h-14'
  const rows = KEY_ROWS[symbols ? 'symbols' : 'letters']

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* row-reverse: once the text is wider than the field, its start is clipped, not the caret. */}
      <div
        className={`flex shrink-0 flex-row-reverse items-center overflow-hidden rounded-[22px] border-[1.5px] border-rosegold bg-pearl px-5 ${
          compact ? 'h-[52px]' : 'h-16'
        }`}
      >
        <span className="flex-1" />
        {!text && <span className="ml-1.5 shrink-0 font-serif text-[21px] text-plum-soft/50 italic">What needs doing?</span>}
        <span className="h-7 w-0.5 shrink-0 bg-rosegold" />
        <span className="shrink-0 font-serif text-[21px] whitespace-pre text-plum">{text}</span>
      </div>

      {!compact && <Label>Which list</Label>}
      <div className={`flex shrink-0 gap-2 overflow-hidden ${compact ? '' : 'flex-wrap'}`}>
        {lists.length === 0 && <p className="py-2.5 text-[13px] text-plum-soft italic">No todo lists found</p>}
        {lists.map((l) => (
          <Chip key={l.id} active={l.id === list?.id} onClick={() => setListId(l.id)}>
            <span className={`size-1.5 rounded-full ${LIST_DOTS[l.index % LIST_DOTS.length]}`} />
            {l.name}
          </Chip>
        ))}
      </div>
      {!compact && <Label>When</Label>}
      <div className="grid shrink-0 grid-cols-5 gap-1.5">
        {DUE_CHOICES.map((c) => (
          <Chip key={c.id} narrow active={c.id === dueId} onClick={() => setDueId(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>
      {status?.error && <p className="shrink-0 truncate text-[12px] text-rosegold-deep">{status.error}</p>}

      <div className="mt-auto flex shrink-0 flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={i} className={`flex gap-1.5 ${keyHeight}`}>
            {i === 1 && <span className="flex-[0.5]" />}
            {i === 2 &&
              (symbols ? (
                <span className="flex-[1.5]" />
              ) : (
                <Key wide active={shift} onPress={() => setShift(!shift)} label="Shift">
                  <ShiftIcon />
                </Key>
              ))}
            {[...row].map((ch) => (
              <Key key={ch} onPress={() => press(ch)}>
                {caps && !symbols ? ch.toUpperCase() : ch}
              </Key>
            ))}
            {i === 1 && <span className="flex-[0.5]" />}
            {i === 2 && (
              <Key wide onPress={backspace} label="Delete">
                <BackspaceIcon />
              </Key>
            )}
          </div>
        ))}
        <div className={`flex gap-1.5 ${keyHeight}`}>
          <Key wide onPress={() => setSymbols(!symbols)}>
            <span className="text-[13px] font-medium tracking-[0.12em]">{symbols ? 'ABC' : '123'}</span>
          </Key>
          <Key grow="flex-[5]" onPress={() => type(' ')} label="Space">
            <span className="text-[12px] font-medium tracking-[0.22em] text-plum-soft uppercase">space</span>
          </Key>
          <button
            onClick={submit}
            disabled={!canAdd}
            className="flex flex-[2.5] items-center justify-center gap-2 rounded-xl bg-plum text-[13px] font-medium tracking-[0.2em] text-blush-100 uppercase disabled:opacity-40"
          >
            {status?.busy ? 'Adding' : 'Add'}
            <Heart className="size-3.5 text-blush-300" />
          </button>
        </div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <p className="-mb-1 text-[11px] font-medium tracking-[0.22em] text-plum-soft uppercase">{children}</p>
}

function Chip({ active, narrow, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border font-medium whitespace-nowrap uppercase ${
        narrow ? 'px-1 text-[11px] tracking-[0.08em]' : 'px-3.5 text-[12px] tracking-[0.14em]'
      } ${
        active ? 'border-plum bg-plum text-blush-100' : 'border-blush-200 bg-pearl text-plum-soft'
      }`}
    >
      {children}
    </button>
  )
}

function Key({ onPress, wide, grow, active, label, children }) {
  return (
    <button
      onClick={onPress}
      aria-label={label}
      className={`flex basis-0 items-center justify-center rounded-xl border text-[19px] ${grow ?? (wide ? 'flex-[1.5]' : 'flex-1')} ${
        active ? 'border-rosegold bg-rosegold text-pearl' : 'border-blush-200 bg-pearl text-plum'
      }`}
    >
      {children}
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

function Icon({ d, className = 'size-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

const ListIcon = () => <Icon d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />
const ShiftIcon = () => <Icon className="size-5" d="M12 4l7 8h-4v7H9v-7H5z" />
const BackspaceIcon = () => <Icon className="size-5" d="M21 5H9l-6 7 6 7h12zM16 9.5l-5 5M11 9.5l5 5" />
