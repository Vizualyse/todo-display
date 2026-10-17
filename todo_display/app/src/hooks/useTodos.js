import { useEffect, useState } from 'react'

export function useTodos() {
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

  const send = async (method, url, body) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`)
  }
  // Both resolve once the source accepted the change; it arrives through the event stream.
  const add = ({ list, title, due, alarm }) => send('POST', 'api/todos', { list, title, due, alarm })
  /** `due` left out keeps the current one; null clears it. */
  const update = ({ id, ...changes }) => send('PATCH', `api/todos/${encodeURIComponent(id)}`, changes)
  return { todos, lists, toggle, add, update }
}
