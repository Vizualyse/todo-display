import { useEffect, useState } from 'react'
import { TodoForm } from './components/form/TodoForm.jsx'
import { Flourish } from './components/layout/Flourish.jsx'
import { Header } from './components/layout/Header.jsx'
import { Shell } from './components/layout/Shell.jsx'
import { Filters } from './components/list/Filters.jsx'
import { ListFilter } from './components/list/ListFilter.jsx'
import { Summary } from './components/list/Summary.jsx'
import { TodoList } from './components/list/TodoList.jsx'
import { MenuButton } from './components/menu/MenuButton.jsx'
import { MusicButton, MusicMenu } from './components/menu/MusicMenu.jsx'
import { TabMenu } from './components/menu/TabMenu.jsx'
import { tabTitle } from './components/menu/tabs.js'
import { MusicPage } from './components/music/MusicPage.jsx'
import { useListSelection } from './hooks/useListSelection.js'
import { useMinuteClock } from './hooks/useMinuteClock.js'
import { useMusic } from './hooks/useMusic.js'
import { useOrientation } from './hooks/useOrientation.js'
import { useTapSound } from './hooks/useTapSound.js'
import { useTodos } from './hooks/useTodos.js'
import { FILTERS, byUpcoming } from './lib/todos.js'

export default function App() {
  const orientation = useOrientation()
  const now = useMinuteClock()
  const { todos: allTodos, lists, toggle, add, update } = useTodos()
  const shown = useListSelection(lists)
  // Everything below, counts and summary included, only sees the lists that are ticked.
  const todos = allTodos.filter(shown.includes)
  const [filter, setFilter] = useState('open')
  const [tab, setTab] = useState('list') // 'list' | 'add' | 'edit' | 'music'
  const [editingId, setEditingId] = useState(null)
  const [popover, setPopover] = useState(null) // null | 'menu' | 'music'
  const menuOpen = popover === 'menu'
  const setMenuOpen = (open) => setPopover(open ? 'menu' : null)
  const sound = useTapSound()
  const music = useMusic()

  // Back to the list if the todo being edited disappears (e.g. removed in HA).
  const editing = tab === 'edit' ? todos.find((t) => t.id === editingId) : null
  useEffect(() => {
    if (tab === 'edit' && !editing) setTab('list')
  }, [tab, editing])
  // Likewise if the music player goes away.
  useEffect(() => {
    if (tab === 'music' && !music.available) setTab('list')
  }, [tab, music.available])
  const edit = (id) => {
    setEditingId(id)
    setTab('edit')
  }

  const showList = (f) => {
    setFilter(f)
    setTab('list')
  }
  const visible = todos.filter(FILTERS.find((f) => f.id === filter).test).sort(byUpcoming)
  const compact = orientation === 'landscape'
  const header = <Header now={now} clearMenu={!compact} wide={music.available} />
  const summary = <Summary todos={todos} />
  const filters = (
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">
        <Filters value={tab === 'list' ? filter : null} onChange={showList} todos={todos} compact={compact} />
      </div>
      <ListFilter lists={lists} selected={shown.selected} onToggle={shown.toggle} up={compact} />
    </div>
  )
  const list = <TodoList todos={visible} onToggle={toggle} onEdit={edit} now={now} />
  const form = editing ? (
    <TodoForm key={editing.id} todo={editing} dueDates={lists[editing.listIndex]?.dueDates} dueTimes={lists[editing.listIndex]?.dueTimes} onSubmit={update} onDone={() => setTab('list')} compact={compact} />
  ) : (
    <TodoForm key="add" lists={lists} defaultListId={lists.find((l) => shown.selected.has(l.id))?.id} onSubmit={add} onDone={() => showList('open')} compact={compact} />
  )
  const menu = (
    <>
      {/* The music button only appears once Home Assistant has the panel's player. */}
      {music.available && (
        <MusicButton open={popover === 'music'} playing={music.playing} onClick={() => setPopover(popover === 'music' ? null : 'music')} />
      )}
      {popover === 'music' && music.available && (
        <MusicMenu
          music={music}
          sound={sound}
          onClose={() => setPopover(null)}
          onOpenPage={() => {
            setTab('music')
            setPopover(null)
          }}
        />
      )}
      <MenuButton open={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
      {menuOpen && (
        <TabMenu
          value={tab}
          onChange={(id) => {
            setTab(id)
            setMenuOpen(false)
          }}
          onClose={() => setMenuOpen(false)}
          sound={sound}
          music={music.available}
        />
      )}
    </>
  )

  // The music page has the whole screen, with the menu buttons where they always are.
  if (tab === 'music') {
    return (
      <Shell className={compact ? 'grid grid-cols-[280px_minmax(0,1fr)] gap-7' : 'flex flex-col gap-4'}>
        <MusicPage music={music} compact={compact} onBack={() => showList(filter)} />
        {menu}
      </Shell>
    )
  }

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
          <h2 className={`flex h-11 shrink-0 items-center ${music.available ? 'pr-28' : 'pr-14'} font-serif text-[26px] leading-none font-medium italic`}>
            {tabTitle(tab)}
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
