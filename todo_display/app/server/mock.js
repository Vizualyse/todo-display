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

  return {
    get todos() {
      return todos
    },
    async setDone(id, done) {
      todos = todos.map((t) => (t.id === id ? { ...t, done } : t))
      onChange()
    },
  }
}
