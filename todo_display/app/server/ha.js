import WebSocket from 'ws'

/**
 * Home Assistant todo source over the WebSocket API. Subscribes to each todo
 * entity (HA pushes the full item list on subscribe and on every change), ticks
 * and edits items with todo.update_item and adds them with todo.add_item.
 */
/** A date goes to due_date, a local "YYYY-MM-DDTHH:MM" to due_datetime (HA's time zone); null clears. */
function dueField(due) {
  if (due && due.includes('T')) return { due_datetime: `${due.replace('T', ' ')}:00` }
  return { due_date: due }
}

export function createHomeAssistantSource({ url, token, entities, musicPlayer, musicGroup, weatherEntity, log, onChange, onMusic, onWeather }) {
  const lists = new Map() // entity_id -> { name, items }
  const subscriptions = new Map() // subscribe message id -> entity_id
  const pending = new Map() // message id -> { resolve, reject }
  let ws = null
  let nextId = 1
  let retryMs = 1000
  // HTTP base for media art: ws://supervisor/core/websocket -> http://supervisor/core.
  const httpBase = url.replace(/^ws/, 'http').replace(/\/(api\/)?websocket$/, '')
  let players = new Map() // media_player entity_id -> { state, attributes }
  let musicId = null // the panel's player
  let playersSub = null
  let musicRetry = null
  let massEntryId = null
  let weather = new Map() // the weather entity -> { state, attributes }; empty without one
  let weatherSub = null

  function request(msg) {
    return new Promise((resolve, reject) => {
      if (ws?.readyState !== WebSocket.OPEN) return reject(new Error('not connected to Home Assistant'))
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, ...msg }))
    })
  }

  async function subscribeAll() {
    const states = await request({ type: 'get_states' })
    let todoIds = states.map((s) => s.entity_id).filter((id) => id.startsWith('todo.'))
    if (entities.length) todoIds = entities.filter((id) => todoIds.includes(id))
    const attrs = Object.fromEntries(states.map((s) => [s.entity_id, s.attributes ?? {}]))

    lists.clear()
    subscriptions.clear()
    for (const entityId of todoIds) {
      const { friendly_name: name, supported_features: features } = attrs[entityId]
      // SET_DUE_DATE_ON_ITEM (16) | SET_DUE_DATETIME_ON_ITEM (32). The shopping list has neither.
      const dueDates = features === undefined || (features & 48) !== 0
      const dueTimes = features === undefined || (features & 32) !== 0
      lists.set(entityId, { name: name || entityId, dueDates, dueTimes, items: [] })
      const id = nextId++
      subscriptions.set(id, entityId)
      pending.set(id, { resolve() {}, reject: (err) => log(`subscribe ${entityId} failed: ${err.message}`) })
      ws.send(JSON.stringify({ id, type: 'todo/item/subscribe', entity_id: entityId }))
    }
    log(`Home Assistant: watching ${todoIds.length} todo list(s): ${todoIds.join(', ') || 'none found'}`)
    onChange()
    watchMusic(states)
    watchWeather(states)
  }

  /** The `weather_entity` option, or the first weather entity (Met.no's "Forecast Home" by default). */
  function watchWeather(states) {
    const found = weatherEntity ? states.find((s) => s.entity_id === weatherEntity) : states.find((s) => s.entity_id.startsWith('weather.'))
    weather = new Map(found ? [[found.entity_id, { state: found.state, attributes: found.attributes ?? {} }]] : [])
    log(`Home Assistant: weather from ${found?.entity_id ?? `nowhere (${weatherEntity || 'no weather entity'} not found)`}`)
    if (found) {
      weatherSub = nextId++
      pending.set(weatherSub, { resolve() {}, reject: (err) => log(`subscribe weather failed: ${err.message}`) })
      ws.send(JSON.stringify({ id: weatherSub, type: 'subscribe_entities', entity_ids: [found.entity_id] }))
    }
    onWeather()
  }

  /**
   * The panel's Music Assistant player: the `music_player` option, or a media player
   * named after the panel. Until one exists (e.g. before the Music Assistant
   * integration is set up) look again every minute. Every media player is watched,
   * so the speaker group and its members are known too.
   */
  function watchMusic(states) {
    clearTimeout(musicRetry)
    const mediaPlayers = states.filter((s) => s.entity_id.startsWith('media_player.'))
    const found = musicPlayer
      ? mediaPlayers.find((s) => s.entity_id === musicPlayer)
      : mediaPlayers
          .filter((s) => /crowpanel/i.test(`${s.entity_id} ${s.attributes?.friendly_name ?? ''}`))
          // Music Assistant's player carries the metadata; prefer it over the ESPHome one.
          .sort((a, b) => Boolean(b.attributes?.mass_player_type) - Boolean(a.attributes?.mass_player_type))[0]
    if (!found) {
      if (musicId) onMusic()
      musicId = null
      players = new Map()
      musicRetry = setTimeout(() => request({ type: 'get_states' }).then(watchMusic).catch(() => {}), 60_000)
      return
    }
    musicId = found.entity_id
    players = new Map(mediaPlayers.map((s) => [s.entity_id, { state: s.state, attributes: s.attributes ?? {} }]))
    log(`Home Assistant: music player ${musicId}, speaker group ${groupId() ?? 'none found'}`)
    playersSub = nextId++
    pending.set(playersSub, { resolve() {}, reject: (err) => log(`subscribe media players failed: ${err.message}`) })
    ws.send(JSON.stringify({ id: playersSub, type: 'subscribe_entities', entity_ids: [...players.keys()] }))
    onMusic()
  }

  /**
   * The Music Assistant sync group the panel belongs to: `musicGroup()` (the option,
   * or the group last seen with the panel in it, since the panel can be switched
   * out of it), else a group player whose members include the panel's player.
   * Looked up each time, so renaming the group in Music Assistant doesn't matter.
   */
  function groupId() {
    const preferred = musicGroup()
    if (preferred && players.has(preferred)) return preferred
    for (const [id, p] of players) {
      if (p.attributes.mass_player_type === 'group' && p.attributes.group_members?.includes(musicId)) return id
    }
    return null
  }

  const entityFor = (target) => {
    const id = target === 'group' ? groupId() : musicId
    if (!id) throw new Error(target === 'group' ? 'no speaker group' : 'no music player')
    return id
  }

  /**
   * subscribe_entities sends compressed diffs: a = added (full), c = changed (+/-),
   * r = removed. Applies one to `entities`; true if anything changed.
   */
  function applyEntityDiff(entities, event) {
    let touched = false
    for (const [id, added] of Object.entries(event.a ?? {})) {
      entities.set(id, { state: added.s, attributes: added.a ?? {} })
      touched = true
    }
    for (const [id, changed] of Object.entries(event.c ?? {})) {
      const p = entities.get(id)
      if (!p) continue
      const attributes = { ...p.attributes, ...changed['+']?.a }
      for (const key of changed['-']?.a ?? []) delete attributes[key]
      entities.set(id, { state: changed['+']?.s ?? p.state, attributes })
      touched = true
    }
    for (const id of event.r ?? []) {
      const p = entities.get(id)
      if (p) entities.set(id, { ...p, state: 'unavailable' })
      touched = true
    }
    return touched
  }

  /** Music Assistant's config entry, which its services need. */
  async function massEntry() {
    if (!massEntryId) {
      const entries = await request({ type: 'config_entries/get', domain: 'music_assistant' })
      massEntryId = entries.find((e) => e.state === 'loaded')?.entry_id
      if (!massEntryId) throw new Error('Music Assistant integration not loaded')
    }
    return massEntryId
  }

  function connect() {
    ws = new WebSocket(url)
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw)
      switch (msg.type) {
        case 'auth_required':
          ws.send(JSON.stringify({ type: 'auth', access_token: token }))
          break
        case 'auth_ok':
          retryMs = 1000
          subscribeAll().catch((err) => log(`Home Assistant setup failed: ${err.message}`))
          break
        case 'auth_invalid':
          log(`Home Assistant rejected the token: ${msg.message}`)
          break
        case 'result': {
          const call = pending.get(msg.id)
          pending.delete(msg.id)
          if (msg.success) call?.resolve(msg.result)
          else call?.reject(new Error(msg.error?.message || 'request failed'))
          break
        }
        case 'event': {
          if (msg.id === playersSub) {
            if (applyEntityDiff(players, msg.event)) onMusic()
            break
          }
          if (msg.id === weatherSub) {
            if (applyEntityDiff(weather, msg.event)) onWeather()
            break
          }
          const entityId = subscriptions.get(msg.id)
          if (entityId && lists.has(entityId)) {
            lists.get(entityId).items = msg.event.items ?? []
            onChange()
          }
          break
        }
      }
    })
    ws.on('close', () => {
      for (const call of pending.values()) call.reject(new Error('connection closed'))
      pending.clear()
      log(`Home Assistant connection lost, retrying in ${retryMs / 1000}s`)
      setTimeout(connect, retryMs)
      retryMs = Math.min(retryMs * 2, 30_000)
    })
    ws.on('error', (err) => log(`Home Assistant connection error: ${err.message}`))
  }

  connect()

  return {
    get music() {
      return musicId && players.has(musicId) ? { entityId: musicId, ...players.get(musicId) } : null
    },
    /** The panel's speaker group, or null. Its `group_members` are the speakers playing in it now. */
    get musicGroup() {
      const id = musicId && groupId()
      return id ? { entityId: id, ...players.get(id) } : null
    },
    /** Every media player, in Home Assistant's order. */
    get players() {
      return [...players].map(([entityId, p]) => ({ entityId, ...p }))
    },
    /** Any media player's { state, attributes }, or null. */
    player(entityId) {
      return players.get(entityId) ?? null
    },
    /** media_player.<service> on the panel's player, or on its group. */
    async musicCommand(service, data = {}, target = 'panel') {
      await request({
        type: 'call_service',
        domain: 'media_player',
        service,
        target: { entity_id: entityFor(target) },
        service_data: data,
      })
    },
    /** Album art: entity_picture is a path on HA (needs the token) or an absolute URL. */
    async musicArt(target = 'panel') {
      const picture = players.get(target === 'group' ? groupId() : musicId)?.attributes?.entity_picture
      if (!picture) return null
      const absolute = /^https?:/.test(picture)
      const res = await fetch(absolute ? picture : httpBase + picture, absolute ? {} : { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`art: HTTP ${res.status}`)
      return { type: res.headers.get('content-type') || 'image/jpeg', body: Buffer.from(await res.arrayBuffer()) }
    },
    /** Music Assistant track search: raw tracks (uri, name, version, artists, album, image). */
    async musicSearch(query) {
      const result = await request({
        type: 'call_service',
        domain: 'music_assistant',
        service: 'search',
        service_data: { config_entry_id: await massEntry(), name: query, media_type: ['track'], limit: 30 },
        return_response: true,
      })
      return result?.response?.tracks ?? []
    },
    /** Plays a track now on the group (or the panel), keeping the rest of the queue. */
    async musicPlay(uri, target = 'panel') {
      await request({
        type: 'call_service',
        domain: 'music_assistant',
        service: 'play_media',
        target: { entity_id: entityFor(target) },
        service_data: { media_id: uri, media_type: 'track', enqueue: 'play' },
      })
    },
    /**
     * Adds a speaker to the group or takes it out. Music Assistant's sync groups have
     * dynamic members: join on the group adds one, unjoin on the speaker drops it.
     */
    async setSpeaker(entityId, on) {
      await request({
        type: 'call_service',
        domain: 'media_player',
        service: on ? 'join' : 'unjoin',
        target: { entity_id: on ? entityFor('group') : entityId },
        service_data: on ? { group_members: [entityId] } : {},
      })
    },
    /** The weather entity's { entityId, state, attributes }, or null. */
    get weather() {
      const [entry] = weather
      return entry ? { entityId: entry[0], ...entry[1] } : null
    },
    /** weather.get_forecasts: type is 'hourly' or 'daily'. */
    async weatherForecast(type) {
      const entityId = this.weather?.entityId
      if (!entityId) return []
      const result = await request({
        type: 'call_service',
        domain: 'weather',
        service: 'get_forecasts',
        target: { entity_id: entityId },
        service_data: { type },
        return_response: true,
      })
      return result?.response?.[entityId]?.forecast ?? []
    },
    get lists() {
      return [...lists].map(([entityId, list], index) => ({
        id: entityId,
        name: list.name,
        index,
        dueDates: list.dueDates,
        dueTimes: list.dueTimes,
      }))
    },
    get todos() {
      return [...lists].flatMap(([entityId, list], listIndex) =>
        list.items.map((item) => ({
          id: `${entityId}|${item.uid}`,
          title: item.summary,
          list: list.name,
          listIndex,
          due: item.due ?? null,
          done: item.status === 'completed',
        })),
      )
    },
    async setDone(id, done) {
      const sep = id.indexOf('|')
      await request({
        type: 'call_service',
        domain: 'todo',
        service: 'update_item',
        target: { entity_id: id.slice(0, sep) },
        service_data: { item: id.slice(sep + 1), status: done ? 'completed' : 'needs_action' },
      })
    },
    /** title/due undefined = unchanged; due null clears it. */
    async update(id, { title, due }) {
      const sep = id.indexOf('|')
      await request({
        type: 'call_service',
        domain: 'todo',
        service: 'update_item',
        target: { entity_id: id.slice(0, sep) },
        service_data: {
          item: id.slice(sep + 1),
          ...(title !== undefined && { rename: title }),
          ...(due !== undefined && dueField(due)),
        },
      })
    },
    /** due is "YYYY-MM-DD", "YYYY-MM-DDTHH:MM" or null. HA pushes the new item through the subscription. */
    async add(listId, title, due) {
      if (!lists.has(listId)) throw new Error(`unknown list ${listId}`)
      await request({
        type: 'call_service',
        domain: 'todo',
        service: 'add_item',
        target: { entity_id: listId },
        service_data: { item: title, ...(due && dueField(due)) },
      })
    },
  }
}
