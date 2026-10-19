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
import { createWeather } from './weather.js'

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
    // Empty finds the Music Assistant group the panel's player belongs to.
    musicGroup: opts.music_group || env.MUSIC_GROUP || '',
    // Speakers offered on the music page; empty offers every one that can join the group.
    musicSpeakers: opts.music_speakers ?? (env.MUSIC_SPEAKERS ? env.MUSIC_SPEAKERS.split(',').map((s) => s.trim()) : []),
    // Empty uses the first weather entity.
    weatherEntity: opts.weather_entity || env.WEATHER_ENTITY || '',
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

const settings = createSettings({ file: process.env.SETTINGS_FILE || '/data/settings.json', log })

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

/**
 * Music Assistant only lists the speakers playing in a sync group, so a panel
 * switched out of its group would no longer find it. The group is remembered.
 */
function rememberGroup() {
  const g = source.musicGroup
  if (g) settings.update({ musicGroup: g.entityId })
}
function onMusic() {
  rememberGroup()
  broadcastMusic()
}

const source = config.ha
  ? createHomeAssistantSource({
      ...config.ha,
      entities: config.todoEntities,
      musicPlayer: config.musicPlayer,
      musicGroup: () => config.musicGroup || settings.get().musicGroup,
      weatherEntity: config.weatherEntity,
      log,
      onChange: broadcast,
      onMusic,
      onWeather: () => weather.entityChanged(),
    })
  : createMockSource({ onChange: broadcast, onMusic })
if (!config.ha) log('No Home Assistant connection configured, using mock todos')
rememberGroup()

const weather = createWeather({
  source,
  log,
  onChange: () => {
    for (const res of subscribers) res.write('event: weather\ndata: changed\n\n')
  },
})
weather.entityChanged()

/** Now playing on one player; `art` changes with the picture, so it doubles as a cache key. */
function playerState({ state, attributes: a }) {
  const picture = a.entity_picture ?? ''
  return {
    playing: state === 'playing',
    title: a.media_title ?? null,
    artist: a.media_artist ?? null,
    album: a.media_album_name ?? null,
    uri: a.media_content_id ?? null,
    volume: typeof a.volume_level === 'number' ? a.volume_level : null,
    art: picture ? crypto.createHash('sha1').update(picture).digest('hex').slice(0, 12) : null,
  }
}

const GROUPING = 524288 // MediaPlayerEntityFeature.GROUPING
// Music Assistant's own web player, one per browser that opened its UI.
const isBrowserPlayer = (p) => /^Web \(/.test(p.attributes.friendly_name ?? '')

/**
 * The speakers offered for a group: the option's, or the panel, the group's
 * members and every other Music Assistant player that can join a group (so a TV
 * that isn't playing can be added), in Home Assistant's order so the switches
 * don't move when flipped.
 */
function groupSpeakers(g) {
  if (config.musicSpeakers.length) return config.musicSpeakers
  const members = g.attributes.group_members ?? []
  const joinable = source.players
    .filter((p) => members.includes(p.entityId) || (p.attributes.mass_player_type === 'player' && p.attributes.supported_features & GROUPING && !isBrowserPlayer(p)))
    .map((p) => p.entityId)
  return [...new Set([source.music?.entityId, ...joinable, ...members])].filter(Boolean)
}

/** What the music popover (the panel's player) and the music page (its group) show. */
function musicState() {
  const m = source.music
  if (!m) return { available: false }
  const g = source.musicGroup
  return {
    available: m.state !== 'unavailable',
    ...playerState(m),
    group: g && {
      name: g.attributes.friendly_name ?? g.entityId,
      ...playerState(g),
      members: groupSpeakers(g).map((id) => {
        const p = source.player(id)
        return {
          id,
          name: p?.attributes.friendly_name ?? id,
          on: (g.attributes.group_members ?? []).includes(id),
          available: Boolean(p) && p.state !== 'unavailable',
        }
      }),
    },
  }
}

/**
 * Track art from the latest searches, by uri. Only these URLs are fetched, so the
 * thumbnail route can't be pointed anywhere else. Thumbnails are shrunk to what the
 * page shows, so the panel decodes a few KB per row.
 */
const searchArt = new Map() // uri -> image URL
const thumbs = new Map() // uri -> jpeg
const remember = (map, key, value, max) => {
  if (map.size >= max) map.delete(map.keys().next().value)
  map.set(key, value)
}
const trackView = (t) => {
  const image = t.image || t.album?.image || null
  if (image && /^https?:\/\//.test(image)) remember(searchArt, t.uri, image, 500)
  return {
    uri: t.uri,
    title: t.version ? `${t.name} (${t.version})` : t.name,
    artist: (t.artists ?? []).map((a) => a.name).join(', ') || null,
    album: t.album?.name ?? null,
    art: searchArt.has(t.uri),
  }
}

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

const pageSettings = () => {
  const { muted, volume } = settings.get()
  return { muted, volume }
}
app.get('/api/settings', (req, res) => res.json(pageSettings()))

// Body: { muted?, volume? (0-1) }. The volume goes to the panel, which reports back.
app.post('/api/settings', (req, res) => {
  const { muted, volume } = req.body ?? {}
  if (muted !== undefined && typeof muted !== 'boolean') return res.status(400).json({ error: 'muted must be true/false' })
  if (volume !== undefined && !(volume >= 0 && volume <= 1)) return res.status(400).json({ error: 'volume must be 0-1' })
  const changes = { ...(muted !== undefined && { muted }), ...(volume !== undefined && { volume }) }
  if (settings.update(changes)) broadcastSettings()
  if (volume !== undefined) stream?.setVolume(volume)
  res.json(pageSettings())
})

const MUSIC_COMMANDS = { play_pause: 'media_play_pause', next: 'media_next_track', previous: 'media_previous_track' }
// The popover controls the panel's player; the music page controls its group.
const TARGETS = { '/api/music': 'panel', '/api/music/group': 'group' }

app.get('/api/music', (req, res) => res.json(musicState()))
app.get('/api/weather', (req, res) => res.json(weather.state))

for (const [base, target] of Object.entries(TARGETS)) {
  app.get(`${base}/art`, async (req, res) => {
    try {
      const art = await source.musicArt(target)
      if (!art) return res.status(404).end()
      // The URL carries the art key, so a new picture is a new URL.
      res.set('Cache-Control', 'max-age=86400').type(art.type).send(art.body)
    } catch (err) {
      log(`music art failed: ${err.message}`)
      res.status(502).end()
    }
  })

  app.post(`${base}/volume`, async (req, res) => {
    const volume = Number(req.body?.volume)
    if (!(volume >= 0 && volume <= 1)) return res.status(400).json({ error: 'volume must be 0-1' })
    try {
      await source.musicCommand('volume_set', { volume_level: volume }, target)
      res.json({ ok: true })
    } catch (err) {
      log(`music volume failed: ${err.message}`)
      res.status(502).json({ error: err.message })
    }
  })

  app.post(`${base}/:command`, async (req, res, next) => {
    // Not a transport command: search, play and speaker are routes of their own.
    if (!Object.hasOwn(MUSIC_COMMANDS, req.params.command)) return next()
    try {
      await source.musicCommand(MUSIC_COMMANDS[req.params.command], {}, target)
      res.json({ ok: true })
    } catch (err) {
      log(`music ${req.params.command} failed: ${err.message}`)
      broadcastMusic()
      res.status(502).json({ error: err.message })
    }
  })
}

// Body: { query }. Tracks only.
app.post('/api/music/search', async (req, res) => {
  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : ''
  if (!query || query.length > 100) return res.status(400).json({ error: 'query required' })
  try {
    const tracks = await source.musicSearch(query)
    res.json({ tracks: tracks.filter((t) => t?.uri && t.name).map(trackView) })
  } catch (err) {
    log(`music search failed: ${err.message}`)
    res.status(502).json({ error: err.message })
  }
})

app.get('/api/music/thumb', async (req, res) => {
  const uri = String(req.query.uri ?? '')
  try {
    let jpeg = thumbs.get(uri)
    if (!jpeg) {
      const url = searchArt.get(uri)
      if (!url) return res.status(404).end()
      const got = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!got.ok) throw new Error(`HTTP ${got.status}`)
      jpeg = await sharp(Buffer.from(await got.arrayBuffer()))
        .resize(96, 96, { fit: 'cover' })
        .flatten({ background: '#f6e4e0' })
        .jpeg({ quality: 80 })
        .toBuffer()
      remember(thumbs, uri, jpeg, 300)
    }
    res.set('Cache-Control', 'max-age=86400').type('image/jpeg').send(jpeg)
  } catch (err) {
    log(`music thumb failed: ${err.message}`)
    res.status(502).end()
  }
})

// Body: { uri }. Plays the track now on the group, or on the panel without one.
app.post('/api/music/play', async (req, res) => {
  const uri = typeof req.body?.uri === 'string' ? req.body.uri : ''
  if (!uri || uri.length > 500) return res.status(400).json({ error: 'uri required' })
  try {
    await source.musicPlay(uri, source.musicGroup ? 'group' : 'panel')
    res.json({ ok: true })
  } catch (err) {
    log(`music play failed: ${err.message}`)
    res.status(502).json({ error: err.message })
  }
})

// Body: { id, on }. Only the group's own speakers can be switched.
app.post('/api/music/speaker', async (req, res) => {
  const { id, on } = req.body ?? {}
  if (typeof on !== 'boolean') return res.status(400).json({ error: 'on must be true/false' })
  const group = source.musicGroup
  if (!group || !groupSpeakers(group).includes(id)) return res.status(404).json({ error: 'not in the group' })
  try {
    await source.setSpeaker(id, on)
    res.json({ ok: true })
  } catch (err) {
    log(`speaker ${id} failed: ${err.message}`)
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
