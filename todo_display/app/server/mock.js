/** In-memory stand-in for Home Assistant, used when no HA connection is configured. */
export function createMockSource({ onChange, onMusic }) {
  // A pretend Music Assistant player in a sync group, so the music popover and page
  // can be tried without HA.
  const nowPlaying = { media_title: 'Golden Hour', media_artist: 'JVKE', media_album_name: 'this is what ____ feels like', media_content_id: 'mock://track/0' }
  let music = { entityId: 'media_player.mock_crowpanel', state: 'paused', attributes: { ...nowPlaying, friendly_name: 'CrowPanel ToDo', volume_level: 0.4 } }
  const speakers = {
    [music.entityId]: 'CrowPanel ToDo',
    'media_player.mock_roku': 'Aurzen Roku',
    'media_player.mock_samsung': 'Samsung 8 Series (50)',
  }
  let group = {
    entityId: 'media_player.mock_sync',
    state: 'paused',
    attributes: { ...nowPlaying, friendly_name: 'Sync Players', volume_level: 0.5, group_members: Object.keys(speakers).slice(0, 2) },
  }
  const setMusic = (state, attributes = {}, target = 'panel') => {
    // Like a sync group: the panel follows the group's track and transport.
    if (target === 'group' || attributes.media_title) group = { ...group, state, attributes: { ...group.attributes, ...attributes } }
    if (target === 'panel' || attributes.media_title) music = { ...music, state, attributes: { ...music.attributes, ...attributes } }
    onMusic?.()
  }
  const catalogue = [
    ['Golden Hour', 'JVKE', 'this is what ____ feels like'],
    ['Perfect', 'Ed Sheeran', '÷ (Deluxe)'],
    ['Thinking Out Loud', 'Ed Sheeran', 'x (Deluxe Edition)'],
    ['Lover', 'Taylor Swift', 'Lover'],
    ['Can\'t Help Falling in Love', 'Elvis Presley', 'Blue Hawaii'],
    ['At Last', 'Etta James', 'At Last!'],
    ['A Thousand Years', 'Christina Perri', 'The Twilight Saga: Breaking Dawn'],
    ['All of Me', 'John Legend', 'Love in the Future'],
    ['Make You Feel My Love', 'Adele', '19'],
    ['La Vie en rose', 'Édith Piaf', 'La Vie en rose'],
    ['Die With A Smile', 'Lady Gaga, Bruno Mars', 'Die With A Smile'],
    ['Until I Found You', 'Stephen Sanchez', 'Easy On My Eyes'],
  ].map(([name, artist, album], i) => ({ uri: `mock://track/${i}`, name, version: '', artists: [{ name: artist }], album: { name: album }, image: null }))
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
    get musicGroup() {
      return group
    },
    get players() {
      return [
        ...Object.entries(speakers).map(([entityId, name]) => ({ entityId, state: 'idle', attributes: { friendly_name: name, mass_player_type: 'player', supported_features: 8320575 } })),
        // Not offered: an Echo can't sync, a browser tab is Music Assistant's web player.
        { entityId: 'media_player.mock_echo', state: 'idle', attributes: { friendly_name: 'Kitchen Echo', mass_player_type: 'player', supported_features: 7796279 } },
        { entityId: 'media_player.mock_web', state: 'idle', attributes: { friendly_name: 'Web (Chrome on Windows)', mass_player_type: 'player', supported_features: 8320575 } },
        group,
      ]
    },
    player(entityId) {
      if (entityId === group.entityId) return group
      return entityId in speakers ? { state: 'idle', attributes: { friendly_name: speakers[entityId] } } : null
    },
    async musicCommand(service, data, target = 'panel') {
      const player = target === 'group' ? group : music
      if (service === 'media_play_pause') setMusic(player.state === 'playing' ? 'paused' : 'playing', {}, target)
      else if (service === 'media_next_track') setMusic('playing', { media_title: 'Next song', media_artist: 'Someone', media_content_id: 'mock://next' }, target)
      else if (service === 'media_previous_track') setMusic('playing', { ...nowPlaying }, target)
      else if (service === 'volume_set') setMusic(player.state, { volume_level: data.volume_level }, target)
    },
    async musicArt() {
      return null
    },
    async musicSearch(query) {
      const q = query.toLowerCase()
      return catalogue.filter((t) => `${t.name} ${t.artists[0].name} ${t.album.name}`.toLowerCase().includes(q))
    },
    async musicPlay(uri) {
      const t = catalogue.find((c) => c.uri === uri)
      if (!t) throw new Error('unknown track')
      setMusic('playing', { media_title: t.name, media_artist: t.artists[0].name, media_album_name: t.album.name, media_content_id: t.uri })
    },
    async setSpeaker(entityId, on) {
      const members = group.attributes.group_members.filter((id) => id !== entityId)
      setMusic(group.state, { group_members: on ? [...members, entityId] : members }, 'group')
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
