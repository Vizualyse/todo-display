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

export function createHomeAssistantSource({ url, token, entities, musicPlayer, log, onChange, onMusic }) {
  const lists = new Map() // entity_id -> { name, items }
  const subscriptions = new Map() // subscribe message id -> entity_id
  const pending = new Map() // message id -> { resolve, reject }
  let ws = null
  let nextId = 1
  let retryMs = 1000
  // HTTP base for media art: ws://supervisor/core/websocket -> http://supervisor/core.
  const httpBase = url.replace(/^ws/, 'http').replace(/\/(api\/)?websocket$/, '')
  let music = null // { entityId, state, attributes }
  let musicSub = null
  let musicRetry = null

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
  }

  /**
   * The panel's Music Assistant player: the `music_player` option, or a media player
   * named after the panel. Until one exists (e.g. before the Music Assistant
   * integration is set up) look again every minute.
   */
  function watchMusic(states) {
    clearTimeout(musicRetry)
    const players = states.filter((s) => s.entity_id.startsWith('media_player.'))
    const found = musicPlayer
      ? players.find((s) => s.entity_id === musicPlayer)
      : players
          .filter((s) => /crowpanel/i.test(`${s.entity_id} ${s.attributes?.friendly_name ?? ''}`))
          // Music Assistant's player carries the metadata; prefer it over the ESPHome one.
          .sort((a, b) => Boolean(b.attributes?.mass_player_type) - Boolean(a.attributes?.mass_player_type))[0]
    if (!found) {
      if (music) onMusic()
      music = null
      musicRetry = setTimeout(() => request({ type: 'get_states' }).then(watchMusic).catch(() => {}), 60_000)
      return
    }
    music = { entityId: found.entity_id, state: found.state, attributes: found.attributes ?? {} }
    log(`Home Assistant: music player ${found.entity_id}`)
    musicSub = nextId++
    pending.set(musicSub, { resolve() {}, reject: (err) => log(`subscribe ${found.entity_id} failed: ${err.message}`) })
    ws.send(JSON.stringify({ id: musicSub, type: 'subscribe_entities', entity_ids: [found.entity_id] }))
    onMusic()
  }

  /** subscribe_entities sends compressed diffs: a = added (full), c = changed (+/-), r = removed. */
  function applyMusicEvent(event) {
    if (!music) return
    const added = event.a?.[music.entityId]
    const changed = event.c?.[music.entityId]
    if (added) music = { ...music, state: added.s, attributes: added.a ?? {} }
    if (changed) {
      const attributes = { ...music.attributes, ...changed['+']?.a }
      for (const key of changed['-']?.a ?? []) delete attributes[key]
      music = { ...music, state: changed['+']?.s ?? music.state, attributes }
    }
    if (event.r?.includes(music.entityId)) music = { ...music, state: 'unavailable' }
    if (added || changed || event.r) onMusic()
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
          if (msg.id === musicSub) {
            applyMusicEvent(msg.event)
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
      return music
    },
    /** media_player.<service> on the music player. */
    async musicCommand(service, data = {}) {
      if (!music) throw new Error('no music player')
      await request({
        type: 'call_service',
        domain: 'media_player',
        service,
        target: { entity_id: music.entityId },
        service_data: data,
      })
    },
    /** Album art: entity_picture is a path on HA (needs the token) or an absolute URL. */
    async musicArt() {
      const picture = music?.attributes?.entity_picture
      if (!picture) return null
      const absolute = /^https?:/.test(picture)
      const res = await fetch(absolute ? picture : httpBase + picture, absolute ? {} : { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`art: HTTP ${res.status}`)
      return { type: res.headers.get('content-type') || 'image/jpeg', body: Buffer.from(await res.arrayBuffer()) }
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
