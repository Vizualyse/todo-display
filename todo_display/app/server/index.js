import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import sharp from 'sharp'
import { createHomeAssistantSource } from './ha.js'
import { createMockSource } from './mock.js'
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

const source = config.ha
  ? createHomeAssistantSource({ ...config.ha, entities: config.todoEntities, log, onChange: broadcast })
  : createMockSource({ onChange: broadcast })
if (!config.ha) log('No Home Assistant connection configured, using mock todos')

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

app.get('/api/todos', (req, res) => res.json(source.todos))
app.get('/api/lists', (req, res) => res.json(source.lists))

app.post('/api/todos', async (req, res) => {
  const { list, title, due } = req.body ?? {}
  const summary = typeof title === 'string' ? title.trim() : ''
  if (!summary || summary.length > 255) return res.status(400).json({ error: 'title required' })
  if (due != null && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return res.status(400).json({ error: 'due must be YYYY-MM-DD' })
  try {
    await source.add(String(list), summary, due ?? null)
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
  if (due != null && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return res.status(400).json({ error: 'due must be YYYY-MM-DD' })
  try {
    await source.update(todo.id, { title: summary, due })
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
    attachTileStream({ server, renderer, isAuthorized, quality: config.quality, log })
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
