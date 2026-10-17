import WebSocket from 'ws'

/**
 * Home Assistant todo source over the WebSocket API. Subscribes to each todo
 * entity (HA pushes the full item list on subscribe and on every change) and
 * ticks items with the todo.update_item service.
 */
export function createHomeAssistantSource({ url, token, entities, log, onChange }) {
  const lists = new Map() // entity_id -> { name, items }
  const subscriptions = new Map() // subscribe message id -> entity_id
  const pending = new Map() // message id -> { resolve, reject }
  let ws = null
  let nextId = 1
  let retryMs = 1000

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
    const names = Object.fromEntries(states.map((s) => [s.entity_id, s.attributes?.friendly_name]))

    lists.clear()
    subscriptions.clear()
    for (const entityId of todoIds) {
      lists.set(entityId, { name: names[entityId] || entityId, items: [] })
      const id = nextId++
      subscriptions.set(id, entityId)
      pending.set(id, { resolve() {}, reject: (err) => log(`subscribe ${entityId} failed: ${err.message}`) })
      ws.send(JSON.stringify({ id, type: 'todo/item/subscribe', entity_id: entityId }))
    }
    log(`Home Assistant: watching ${todoIds.length} todo list(s): ${todoIds.join(', ') || 'none found'}`)
    onChange()
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
  }
}
