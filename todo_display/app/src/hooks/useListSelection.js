import { useState } from 'react'

const STORAGE_KEY = 'td-lists'
const DEFAULT_LIST = 'married life'

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

/** Only "Married Life" by default; every list when there is none by that name. */
function defaultSelection(lists) {
  const preferred = lists.filter((l) => l.name.trim().toLowerCase() === DEFAULT_LIST)
  return (preferred.length ? preferred : lists).map((l) => l.id)
}

/** Which todo lists are shown. Remembered per browser, so a page reload keeps it. */
export function useListSelection(lists) {
  const [chosen, setChosen] = useState(load) // list ids, or null for the default
  const selected = new Set(chosen ?? defaultSelection(lists))

  const toggle = (id) => {
    const next = selected.has(id) ? [...selected].filter((s) => s !== id) : [...selected, id]
    setChosen(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }
  /** Todos carry their list's index; lists are addressed by id. */
  const includes = (todo) => selected.has(lists[todo.listIndex]?.id)
  return { selected, toggle, includes }
}
