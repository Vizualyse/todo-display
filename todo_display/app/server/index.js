import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import sharp from 'sharp'
import { createAlarmStore, parseAlarm, startAlarmScheduler } from './alarms.js'
import { createHomeAssistantSource } from './ha.js'
import { createMockSource } from './mock.js'
import { createSettings } from './settings.js'
import { createRenderer, HEIGHT, WIDTH } from './renderer.js'
import { attachTileStream } from './stream.js'

const log = (msg) => console.log(`[todo] ${msg}`)
const serverDir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(serverDir, '..', 'dist')

function loadConfig() {
  let opts = {}
  try {
    // Home Assistant add-on options.
    opts = JSON.parse(fs.readFileSync('/data/options.json', 'utf8'))
  } catch {}
  const env = process.env
  let haToken = env.HA_TOKEN
  if (!haToken && env.HA_TOKEN_FILE) {
    try {
      haToken = fs.readFileSync(env.HA_TOKEN_FILE, 'utf8').trim()
    } catch {}
  }
  const ha = env.SUPERVISOR_TOKEN
    ? // Inside the add-on: the Supervisor proxies Core and supplies the token.
      { url: 'ws://supervisor/core/websocket', token: env.SUPERVISOR_TOKEN }
    : env.HA_URL && haToken
      ? { url: env.HA_URL.replace(/^http/, 'ws').replace(/\/$/, '') + '/api/websocket', token: haToken }
      : null
  return {
    ha,
    todoEntities: opts.todo_entities ?? (env.TODO_ENTITIES ? env.TODO_ENTITIES.split(',').map((s) => s.trim()) : []),
    // Empty finds the panel's Music Assistant player by name.
    musicPlayer: opts.music_player || env.MUSIC_PLAYER || '',
    port: Number(env.PORT || 8099),
    secret: String(opts.display_secret || env.DISPLAY_SECRET || 'dev-secret'),
    orientation: opts.orientation || env.ORIENTATION || 'portrait',
    rotation: Number(opts.rotation || env.ROTATION || 90),
    quality: Number(opts.jpeg_quality || env.JPEG_QUALITY || 80),
    executablePath: env.CHROMIUM_PATH || undefined,
    channel: env.CHROMIUM_PATH ? undefined : env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
  }
}

const config = loadConfig()
if (config.secret === 'change-me' || config.secret === 'dev-secret') {
  log('WARNING: display_secret is still the default, set a real one in the add-on options')
}

// --- Todo source -----------------------------------------------------------

const subscribers = new Set()
const broadcast = () => {
  for (const res of subscribers) res.write('data: changed\n\n')
}
// Only when something the popover shows changed, not on every position tick.
let lastMusic = ''
const broadcastMusic = () => {
  const now = JSON.stringify(musicState())
  if (now === lastMusic) return
  lastMusic = now
  for (const res of subscribers) res.write('event: music\ndata: changed\n\n')
}

const source = config.ha
  ? createHomeAssistantSource({
      ...config.ha,
      entities: config.todoEntities,
      musicPlayer: config.musicPlayer,
      log,
      onChange: broadcast,
      onMusic: () => broadcastMusic(),
    })
  : createMockSource({ onChange: broadcast, onMusic: () => broadcastMusic() })
if (!config.ha) log('No Home Assistant connection configured, using mock todos')

/** What the music popover shows; `art` changes with the picture, so it doubles as a cache key. */
function musicState() {
  const m = source.music
  if (!m) return { available: false }
  const a = m.attributes
  const picture = a.entity_picture ?? ''
  return {
    available: m.state !== 'unavailable',
    playing: m.state === 'playing',
    title: a.media_title ?? null,
    artist: a.media_artist ?? null,
    album: a.media_album_name ?? null,
    volume: typeof a.volume_level === 'number' ? a.volume_level : null,
    art: picture ? crypto.createHash('sha1').update(picture).digest('hex').slice(0, 12) : null,
  }
}

const settings = createSettings({ file: process.env.SETTINGS_FILE || '/data/settings.json', log })
const broadcastSettings = () => {
  for (const res of subscribers) res.write('event: settings\ndata: changed\n\n')
}
let stream = null

const alarms = createAlarmStore({ file: process.env.ALARMS_FILE || '/data/alarms.json', log })
const todosWithAlarms = () => source.todos.map((t) => ({ ...t, alarm: alarms.get(t.id) }))

/**
 * HA's add_item doesn't return the new item's id, so its alarm is attached once an
 * item with that title shows up in the list (it arrives through the subscription).
 */
function attachAlarmToNew(listId, title, before, alarm) {
  const listIndex = source.lists.find((l) => l.id === listId)?.index
  const started = Date.now()
  const timer = setInterval(() => {
    const todo = source.todos.find((t) => t.listIndex === listIndex && t.title === title && !before.has(t.id))
    if (todo) {
      alarms.set(todo.id, alarm)
      broadcast()
    }
    if (todo || Date.now() - started > 15_000) clearInterval(timer)
  }, 250)
}

// A date, or a local date and time (sent to HA as due_datetime).
const DUE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

// --- Auth ------------------------------------------------------------------

// Loopback is the headless renderer; 172.30.32.2 is the Supervisor's ingress proxy.
const TRUSTED = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', '172.30.32.2', '::ffff:172.30.32.2'])

function keyMatches(candidate) {
  if (!candidate) return false
  const a = Buffer.from(String(candidate))
  const b = Buffer.from(config.secret)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function readCookie(req, name) {
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

function isAuthorized(req) {
  if (TRUSTED.has(req.socket.remoteAddress)) return true
  const key = new URL(req.url, 'http://x').searchParams.get('key')
  return keyMatches(key) || keyMatches(req.headers['x-display-key']) || keyMatches(readCookie(req, 'td_key'))
}

function auth(req, res, next) {
  if (!isAuthorized(req)) return res.status(401).type('text').send('unauthorized')
  if (keyMatches(req.query.key)) {
    // Remember the key so the page's own fetches don't need it in every URL.
    res.setHeader(
      'Set-Cookie',
      `td_key=${encodeURIComponent(req.query.key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
    )
  }
  next()
}

// --- HTTP ------------------------------------------------------------------

const app = express()
app.disable('x-powered-by')
app.use(auth)
app.use(express.json({ limit: '4kb' }))

app.get('/api/todos', (req, res) => res.json(todosWithAlarms()))
app.get('/api/lists', (req, res) => res.json(source.lists))

app.post('/api/todos', async (req, res) => {
  const { list, title, due } = req.body ?? {}
  const summary = typeof title === 'string' ? title.trim() : ''
  if (!summary || summary.length > 255) return res.status(400).json({ error: 'title required' })
  if (due != null && !DUE_RE.test(due)) return res.status(400).json({ error: 'due must be YYYY-MM-DD[THH:MM]' })
  const alarm = parseAlarm(req.body?.alarm ?? null)
  if (alarm === undefined) return res.status(400).json({ error: 'bad alarm' })
  try {
    const before = new Set(source.todos.map((t) => t.id))
    await source.add(String(list), summary, due ?? null)
    if (alarm?.offsets.length && due?.includes('T')) attachAlarmToNew(String(list), summary, before, alarm)
    res.json({ ok: true })
  } catch (err) {
    log(`add failed: ${err.message}`)
    res.status(502).json({ error: err.message })
  }
})

// Body: { title?, due? }. A due of null clears it; leaving it out keeps it.
app.patch('/api/todos/:id', async (req, res) => {
  const todo = source.todos.find((t) => t.id === req.params.id)
  if (!todo) return res.status(404).json({ error: 'no such todo' })
  const { title, due } = req.body ?? {}
  const summary = title === undefined ? undefined : typeof title === 'string' ? title.trim() : ''
  if (summary !== undefined && (!summary || summary.length > 255)) return res.status(400).json({ error: 'title required' })
  if (due != null && !DUE_RE.test(due)) return res.status(400).json({ error: 'due must be YYYY-MM-DD[THH:MM]' })
  const alarm = req.body?.alarm === undefined ? undefined : parseAlarm(req.body.alarm)
  if (req.body?.alarm !== undefined && alarm === undefined) return res.status(400).json({ error: 'bad alarm' })
  try {
    await source.update(todo.id, { title: summary, due })
    if (alarm !== undefined) {
      alarms.set(todo.id, alarm)
      broadcast()
    }
    res.json({ ok: true })
  } catch (err) {
    log(`update failed: ${err.message}`)
    res.status(502).json({ error: err.message })
  }
})

app.post('/api/todos/:id/toggle', async (req, res) => {
  const todo = source.todos.find((t) => t.id === req.params.id)
  if (!todo) return res.status(404).json({ error: 'no such todo' })
  try {
    await source.setDone(todo.id, !todo.done)
    res.json({ ok: true })
  } catch (err) {
    log(`toggle failed: ${err.message}`)
    // Tell pages to reload so the optimistic tick is rolled back.
    broadcast()
    res.status(502).json({ error: err.message })
  }
})

app.get('/api/settings', (req, res) => res.json(settings.get()))

// Body: { muted?, volume? (0-1) }. The volume goes to the panel, which reports back.
app.post('/api/settings', (req, res) => {
  const { muted, volume } = req.body ?? {}
  if (muted !== undefined && typeof muted !== 'boolean') return res.status(400).json({ error: 'muted must be true/false' })
  if (volume !== undefined && !(volume >= 0 && volume <= 1)) return res.status(400).json({ error: 'volume must be 0-1' })
  const changes = { ...(muted !== undefined && { muted }), ...(volume !== undefined && { volume }) }
  if (settings.update(changes)) broadcastSettings()
  if (volume !== undefined) stream?.setVolume(volume)
  res.json(settings.get())
})

const MUSIC_COMMANDS = { play_pause: 'media_play_pause', next: 'media_next_track', previous: 'media_previous_track' }

app.get('/api/music', (req, res) => res.json(musicState()))

app.get('/api/music/art', async (req, res) => {
  try {
    const art = await source.musicArt()
    if (!art) return res.status(404).end()
    // The URL carries the art key, so a new picture is a new URL.
    res.set('Cache-Control', 'max-age=86400').type(art.type).send(art.body)
  } catch (err) {
    log(`music art failed: ${err.message}`)
    res.status(502).end()
  }
})

app.post('/api/music/volume', async (req, res) => {
  const volume = Number(req.body?.volume)
  if (!(volume >= 0 && volume <= 1)) return res.status(400).json({ error: 'volume must be 0-1' })
  try {
    await source.musicCommand('volume_set', { volume_level: volume })
    res.json({ ok: true })
  } catch (err) {
    log(`music volume failed: ${err.message}`)
    res.status(502).json({ error: err.message })
  }
})

app.post('/api/music/:command', async (req, res) => {
  const service = MUSIC_COMMANDS[req.params.command]
  if (!service) return res.status(404).json({ error: 'unknown command' })
  try {
    await source.musicCommand(service)
    res.json({ ok: true })
  } catch (err) {
    log(`music ${req.params.command} failed: ${err.message}`)
    broadcastMusic()
    res.status(502).json({ error: err.message })
  }
})

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders()
  res.write(': connected\n\n')
  subscribers.add(res)
  req.on('close', () => subscribers.delete(res))
})
setInterval(() => {
  for (const res of subscribers) res.write(': ping\n\n')
}, 25_000)

let renderer = null

// Current panel frame as a single JPEG, handy for debugging.
app.get('/frame.jpg', async (req, res) => {
  const frame = renderer?.frame
  if (!frame) return res.status(503).type('text').send('renderer starting')
  const jpeg = await sharp(frame.raw, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .removeAlpha()
    .jpeg({ quality: config.quality, chromaSubsampling: '4:4:4' })
    .toBuffer()
  res.set('Cache-Control', 'no-store').type('image/jpeg').send(jpeg)
})

// Browser stand-in for the panel: speaks the same tile protocol over the same socket.
app.get('/preview', (req, res) => res.sendFile(path.join(serverDir, 'preview.html')))

app.use(express.static(distDir))

const server = app.listen(config.port, async () => {
  log(`listening on :${config.port} (${config.orientation}${config.orientation === 'portrait' ? `, rotated ${config.rotation}°` : ''})`)
  const displayUrl =
    `http://127.0.0.1:${config.port}/?display=1&orientation=${config.orientation}` +
    `&rotate=${config.rotation === 270 ? 270 : 90}`
  try {
    renderer = await createRenderer({
      url: displayUrl,
      executablePath: config.executablePath,
      channel: config.channel,
      log,
    })
    stream = attachTileStream({
      server,
      renderer,
      isAuthorized,
      quality: config.quality,
      log,
      getVolume: () => settings.get().volume,
      // The panel's own volume wins: it may have been changed from Music Assistant.
      onPanelVolume: (volume) => settings.update({ volume }) && broadcastSettings(),
    })
    startAlarmScheduler({ store: alarms, getTodos: () => source.todos, play: renderer.playSound, log })
    log('renderer ready')
  } catch (err) {
    log(`renderer failed to start: ${err.message}`)
    process.exit(1)
  }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await renderer?.close().catch(() => {})
    process.exit(0)
  })
}
