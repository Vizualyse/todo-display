/** In-memory stand-in for Home Assistant, used when no HA connection is configured. */
export function createMockSource({ onChange, onMusic }) {
  // A pretend Music Assistant player, so the music popover can be tried without HA.
  let music = {
    entityId: 'media_player.mock_crowpanel',
    state: 'paused',
    attributes: { media_title: 'Golden Hour', media_artist: 'JVKE', media_album_name: 'this is what ____ feels like', volume_level: 0.4 },
  }
  const setMusic = (state, attributes = {}) => {
    music = { ...music, state, attributes: { ...music.attributes, ...attributes } }
    onMusic?.()
  }
  const day = (offset) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d.toLocaleDateString('en-CA') // YYYY-MM-DD, like HA's date-only due
  }
  // Like HA's shopping list, the last one can't hold due dates.
  const lists = ['Married Life', 'Home', 'Errands', 'Shopping list']
  const dueDates = (index) => index !== 3
  let todos = [
    { title: 'Plan our anniversary dinner', list: 0, due: day(3), done: false },
    { title: 'Book the weekend away', list: 0, due: day(0), done: false },
    { title: 'Frame the wedding photos', list: 0, due: null, done: true },
    { title: 'Take the bins out', list: 1, due: day(0), done: false },
    { title: 'Book dentist appointment', list: 2, due: day(0), done: false },
    { title: 'Water the plants', list: 1, due: day(-1), done: true },
    { title: 'Pick up parcel from the post office', list: 2, due: day(-1), done: false },
    { title: 'Renew car insurance', list: 2, due: day(5), done: false },
    { title: 'Call Mum', list: 1, due: null, done: true },
    { title: 'Descale the coffee machine', list: 1, due: day(1), done: false },
    { title: 'Oat milk', list: 3, due: null, done: false },
    { title: 'Fresh flowers', list: 3, due: null, done: false },
  ].map((t, i) => ({ id: `mock|${i}`, title: t.title, list: lists[t.list], listIndex: t.list, due: t.due, done: t.done }))

  let nextId = todos.length

  return {
    get music() {
      return music
    },
    async musicCommand(service, data) {
      if (service === 'media_play_pause') setMusic(music.state === 'playing' ? 'paused' : 'playing')
      else if (service === 'media_next_track') setMusic('playing', { media_title: 'Next song', media_artist: 'Someone' })
      else if (service === 'media_previous_track') setMusic('playing', { media_title: 'Golden Hour', media_artist: 'JVKE' })
      else if (service === 'volume_set') setMusic(music.state, { volume_level: data.volume_level })
    },
    async musicArt() {
      return null
    },
    get lists() {
      // Like local_todo, the dated lists take times too.
      return lists.map((name, index) => ({ id: `mock-${index}`, name, index, dueDates: dueDates(index), dueTimes: dueDates(index) }))
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
      todos = [...todos, { id: `mock|${nextId++}`, title, list: lists[index], listIndex: index, due: dueDates(index) ? due : null, done: false }]
      onChange()
    },
  }
}
