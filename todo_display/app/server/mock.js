/** In-memory stand-in for Home Assistant, used when no HA connection is configured. */
export function createMockSource({ onChange }) {
  const day = (offset) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d.toLocaleDateString('en-CA') // YYYY-MM-DD, like HA's date-only due
  }
  const lists = ['Home', 'Errands', 'Work']
  let todos = [
    { title: 'Take the bins out', list: 0, due: day(0), done: false },
    { title: 'Book dentist appointment', list: 1, due: day(0), done: false },
    { title: 'Water the plants', list: 0, due: day(-1), done: true },
    { title: 'Review Q4 roadmap', list: 2, due: day(2), done: false },
    { title: 'Pick up parcel from the post office', list: 1, due: day(-1), done: false },
    { title: 'Renew car insurance', list: 1, due: day(5), done: false },
    { title: 'Call Mum', list: 0, due: null, done: true },
    { title: 'Descale the coffee machine', list: 0, due: day(1), done: false },
  ].map((t, i) => ({ id: `mock|${i}`, title: t.title, list: lists[t.list], listIndex: t.list, due: t.due, done: t.done }))

  let nextId = todos.length

  return {
    get lists() {
      return lists.map((name, index) => ({ id: `mock-${index}`, name, index }))
    },
    get todos() {
      return todos
    },
    async setDone(id, done) {
      todos = todos.map((t) => (t.id === id ? { ...t, done } : t))
      onChange()
    },
    async update(id, { title, due }) {
      todos = todos.map((t) =>
        t.id === id ? { ...t, ...(title !== undefined && { title }), ...(due !== undefined && { due }) } : t,
      )
      onChange()
    },
    async add(listId, title, due) {
      const index = lists.findIndex((_, i) => `mock-${i}` === listId)
      if (index < 0) throw new Error(`unknown list ${listId}`)
      todos = [...todos, { id: `mock|${nextId++}`, title, list: lists[index], listIndex: index, due, done: false }]
      onChange()
    },
  }
}
