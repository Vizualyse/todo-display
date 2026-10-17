import { useEffect, useRef, useState } from 'react'
import { shortDate } from '../../lib/dates.js'
import { DUE_CHOICES, dueValue, initialDue } from '../../lib/todos.js'
import { Chip } from '../ui/Chip.jsx'
import { Label } from '../ui/Label.jsx'
import { ListDot } from '../ui/ListDot.jsx'
import { Calendar } from './Calendar.jsx'
import { Keyboard } from './Keyboard.jsx'
import { TextField } from './TextField.jsx'

/**
 * Add or edit a todo (edit when `todo` is given). The panel has touch only, so the form
 * brings its own keyboard; a physical keyboard works too when the page is opened in a
 * browser. "Custom" swaps the keyboard for a calendar. Lists that can't hold due dates
 * (HA's shopping list) get no date choice.
 */
export function TodoForm({ todo, lists, defaultListId, dueDates: todoDueDates, onSubmit, onDone, compact }) {
  const editing = Boolean(todo)
  const start = initialDue(todo?.due)
  const [text, setText] = useState(todo?.title ?? '')
  const [listId, setListId] = useState(null)
  const [dueId, setDueId] = useState(start.id)
  const [customDate, setCustomDate] = useState(start.custom)
  // An untouched due is not sent, so editing keeps a due time HA already has.
  const [dueTouched, setDueTouched] = useState(false)
  const [picking, setPicking] = useState(false)
  const [status, setStatus] = useState(null) // { busy } | { error }

  const list = editing
    ? null
    : (lists.find((l) => l.id === listId) ?? lists.find((l) => l.id === defaultListId) ?? lists[0])
  const dueDates = editing ? todoDueDates !== false : list?.dueDates !== false
  const title = text.trim()
  const canSubmit = Boolean(title && (editing || list) && !status?.busy)

  const chooseDue = (id) => {
    if (id === 'custom') return setPicking(true)
    setDueId(id)
    setDueTouched(true)
    setPicking(false)
  }
  const pickDate = (date) => {
    setCustomDate(date)
    setDueId('custom')
    setDueTouched(true)
    setPicking(false)
  }

  const type = (s) => {
    setStatus(null)
    setText((t) => (t + s).slice(0, 255))
  }
  const backspace = () => setText((t) => t.slice(0, -1))
  const submit = async () => {
    if (!canSubmit) return
    setStatus({ busy: true })
    try {
      const due = dueDates ? dueValue(dueId, customDate) : null
      if (editing) await onSubmit({ id: todo.id, title, ...(dueDates && dueTouched && { due }) })
      else await onSubmit({ list: list.id, title, due })
      onDone()
    } catch (err) {
      setStatus({ error: `Couldn't save that: ${err.message}` })
    }
  }
  usePhysicalKeyboard({ type, backspace, submit })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <TextField text={text} focused={!(picking && dueDates)} onClick={() => setPicking(false)} compact={compact} />

      {!compact && <Label>{editing ? 'List' : 'Which list'}</Label>}
      <div className={`flex shrink-0 gap-2 overflow-hidden ${compact || editing ? '' : 'flex-wrap'}`}>
        {editing ? (
          <>
            {/* HA can't move an item between lists, so the list is fixed while editing. */}
            <Chip active>
              <ListDot index={todo.listIndex} />
              {todo.list}
            </Chip>
            <span className="flex-1" />
            <Chip onClick={onDone}>Cancel</Chip>
          </>
        ) : (
          <>
            {lists.length === 0 && <p className="py-2.5 text-[13px] text-plum-soft italic">No todo lists found</p>}
            {lists.map((l) => (
              <Chip key={l.id} active={l.id === list?.id} onClick={() => setListId(l.id)}>
                <ListDot index={l.index} />
                {l.name}
              </Chip>
            ))}
          </>
        )}
      </div>
      {dueDates && (
        <>
          {!compact && <Label>When</Label>}
          <div className="grid shrink-0 grid-cols-5 gap-1.5">
            {DUE_CHOICES.map((c) => (
              <Chip key={c.id} narrow active={c.id === 'custom' ? picking || dueId === 'custom' : !picking && c.id === dueId} onClick={() => chooseDue(c.id)}>
                {c.id === 'custom' && dueId === 'custom' && customDate ? shortDate(customDate) : c.label}
              </Chip>
            ))}
          </div>
        </>
      )}
      {status?.error && <p className="shrink-0 truncate text-[12px] text-rosegold-deep">{status.error}</p>}

      {/* Fixed height, so swapping keyboard and calendar doesn't move anything else. */}
      <div className={`mt-auto flex shrink-0 flex-col gap-1.5 ${compact ? 'h-[186px]' : 'h-[242px]'}`}>
        {picking && dueDates && <Calendar value={dueId === 'custom' ? customDate : null} onPick={pickDate} onClose={() => setPicking(false)} />}
        <Keyboard
          hidden={picking && dueDates}
          text={text}
          onType={type}
          onBackspace={backspace}
          onSubmit={submit}
          canSubmit={canSubmit}
          submitLabel={editing ? (status?.busy ? 'Saving' : 'Save') : status?.busy ? 'Adding' : 'Add'}
          compact={compact}
        />
      </div>
    </div>
  )
}

/** For the browser/ingress view; the handlers are read fresh on every key press. */
function usePhysicalKeyboard(handlers) {
  const keys = useRef(null)
  keys.current = handlers
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
}
