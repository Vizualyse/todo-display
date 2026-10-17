import { useEffect, useRef, useState } from 'react'
import { shortDate } from '../../lib/dates.js'
import { DEFAULT_ALARM, alarmSummary } from '../../lib/alarms.js'
import { DUE_CHOICES, dueValue, initialDue } from '../../lib/todos.js'
import { Chip } from '../ui/Chip.jsx'
import { BellIcon, ClockIcon } from '../ui/icons.jsx'
import { Label } from '../ui/Label.jsx'
import { ListDot } from '../ui/ListDot.jsx'
import { AlarmPicker } from './AlarmPicker.jsx'
import { Calendar } from './Calendar.jsx'
import { Keyboard } from './Keyboard.jsx'
import { TextField } from './TextField.jsx'
import { TimePicker } from './TimePicker.jsx'

/**
 * Add or edit a todo (edit when `todo` is given). The panel has touch only, so the form
 * brings its own keyboard; a physical keyboard works too when the page is opened in a
 * browser. "Custom" swaps the keyboard for a calendar, the time and alarm chips for
 * their pickers. Lists that can't hold due dates (HA's shopping list) get no date
 * choice; lists that only hold dates get no time, and without a time no alarm.
 */
export function TodoForm({ todo, lists, defaultListId, dueDates: todoDueDates, dueTimes: todoDueTimes, onSubmit, onDone, compact }) {
  const editing = Boolean(todo)
  const start = initialDue(todo?.due)
  const [text, setText] = useState(todo?.title ?? '')
  const [listId, setListId] = useState(null)
  const [dueId, setDueId] = useState(start.id)
  const [customDate, setCustomDate] = useState(start.custom)
  const [time, setTime] = useState(start.time) // "HH:MM" or null
  const [alarm, setAlarm] = useState(todo?.alarm ?? DEFAULT_ALARM)
  // An untouched due is not sent, so editing keeps a due time HA already has.
  const [dueTouched, setDueTouched] = useState(false)
  const [panel, setPanel] = useState('keyboard') // 'keyboard' | 'calendar' | 'time' | 'alarm'
  const [status, setStatus] = useState(null) // { busy } | { error }

  const list = editing
    ? null
    : (lists.find((l) => l.id === listId) ?? lists.find((l) => l.id === defaultListId) ?? lists[0])
  const dueDates = editing ? todoDueDates !== false : list?.dueDates !== false
  const dueTimes = dueDates && (editing ? todoDueTimes !== false : list?.dueTimes !== false)
  const hasDate = dueDates && dueId !== 'none'
  const dueAt = hasDate && dueTimes ? time : null
  const picking = dueDates ? panel : 'keyboard'
  const title = text.trim()
  const canSubmit = Boolean(title && (editing || list) && !status?.busy)

  const chooseDue = (id) => {
    if (id === 'custom') return setPanel('calendar')
    setDueId(id)
    setDueTouched(true)
    setPanel('keyboard')
  }
  const pickDate = (date) => {
    setCustomDate(date)
    setDueId('custom')
    setDueTouched(true)
    setPanel('keyboard')
  }
  const pickTime = (t) => {
    setTime(t)
    setDueTouched(true)
    if (!t) setPanel('keyboard')
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
      const due = dueDates ? dueValue(dueId, customDate, dueAt) : null
      // Alarms need a time; without one any stored alarm is cleared.
      const reminder = dueAt ? alarm : null
      if (editing) await onSubmit({ id: todo.id, title, alarm: reminder, ...(dueDates && dueTouched && { due }) })
      else await onSubmit({ list: list.id, title, due, alarm: reminder })
      onDone()
    } catch (err) {
      setStatus({ error: `Couldn't save that: ${err.message}` })
    }
  }
  usePhysicalKeyboard({ type, backspace, submit })

  const showTime = hasDate && dueTimes
  const summary = alarmSummary(alarm)
  // Landscape has no height to spare, so the chips sit beside the title and shrink to icons.
  const timeChips = showTime && (
    <>
      <Chip active={picking === 'time' || Boolean(time)} onClick={() => setPanel(picking === 'time' ? 'keyboard' : 'time')} label="Time">
        <ClockIcon />
        {time ?? (compact ? null : 'Add a time')}
      </Chip>
      {time ? (
        <Chip active={picking === 'alarm' || Boolean(summary)} onClick={() => setPanel(picking === 'alarm' ? 'keyboard' : 'alarm')} label="Alarm">
          <BellIcon />
          {summary ?? (compact ? null : 'No alarm')}
        </Chip>
      ) : (
        !compact && <p className="flex items-center justify-center text-[11px] tracking-[0.14em] text-plum-soft/70 uppercase">Alarms need a time</p>
      )}
    </>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {compact && showTime ? (
        <div className="flex shrink-0 items-center gap-1.5 [&>*:first-child]:flex-1">
          <TextField text={text} focused={picking === 'keyboard'} onClick={() => setPanel('keyboard')} compact={compact} />
          {timeChips}
        </div>
      ) : (
        <TextField text={text} focused={picking === 'keyboard'} onClick={() => setPanel('keyboard')} compact={compact} />
      )}

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
              <Chip key={c.id} narrow active={c.id === 'custom' ? picking === 'calendar' || dueId === 'custom' : picking !== 'calendar' && c.id === dueId} onClick={() => chooseDue(c.id)}>
                {c.id === 'custom' && dueId === 'custom' && customDate ? shortDate(customDate) : c.label}
              </Chip>
            ))}
          </div>
          {showTime && !compact && <div className="grid shrink-0 grid-cols-2 gap-1.5">{timeChips}</div>}
        </>
      )}
      {status?.error && <p className="shrink-0 truncate text-[12px] text-rosegold-deep">{status.error}</p>}

      {/* Fixed height, so swapping keyboard and calendar doesn't move anything else. */}
      <div className={`mt-auto flex shrink-0 flex-col gap-1.5 ${compact ? 'h-[186px]' : 'h-[242px]'}`}>
        {picking === 'calendar' && <Calendar value={dueId === 'custom' ? customDate : null} onPick={pickDate} onClose={() => setPanel('keyboard')} />}
        {picking === 'time' && <TimePicker value={time} onPick={pickTime} onClose={() => setPanel('keyboard')} />}
        {picking === 'alarm' && <AlarmPicker value={alarm} onChange={setAlarm} onClose={() => setPanel('keyboard')} />}
        <Keyboard
          hidden={picking !== 'keyboard'}
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
