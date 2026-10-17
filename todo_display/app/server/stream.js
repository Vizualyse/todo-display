import sharp from 'sharp'
import { WebSocketServer } from 'ws'
import { HEIGHT, WIDTH } from './renderer.js'

/*
 * Tile stream protocol (all integers little-endian).
 *
 * Server -> panel, one binary message per update:
 *   u8 'T' | u8 flags (bit0 = full frame) | u16 tile count | u32 frame version
 *   per op:   u16 x | u16 y | u16 w | u16 h | u32 length, then either
 *     length != 0xFFFFFFFF: that many bytes of baseline JPEG, drawn at x,y
 *     length == 0xFFFFFFFF: u16 src_x | u16 src_y; copy the w*h pixels the panel
 *                           already shows at src to x,y (used for scrolling)
 *   Ops apply in order; a copy always comes first.
 *
 * Server -> panel, text messages (only to panels that advertised "sound"):
 *   "s <name> [volume]"  play a sound, e.g. "s click 70" when a tap hits a
 *                 button; the volume (0-100) only goes to panels with "volume".
 *                 Panels with "master" get 100: their own volume scales it.
 *   "v <0-100>"   set the panel's master volume (panels with "master")
 *
 * Panel -> server, text messages:
 *   "hello [n] [feature...]"  (re)connected, send a full frame; n >= 2 means it
 *                 supports copy ops; feature "sound" means it can play sounds,
 *                 "volume" that it takes a volume with them, "master" that it
 *                 has a master volume (and reports it with "v")
 *   "v <0-100>"   the panel's master volume changed (also sent after hello)
 *   "ack <ver>"   finished drawing that update, ready for the next one
 *   "d <x> <y>"   finger down at native panel coordinates
 *   "m <x> <y>"   finger moved (drag)
 *   "u"           finger lifted (a down + up without much movement is a tap)
 *   "t <x> <y>"   complete tap, from firmware without drag support
 *
 * One update is in flight per client. Changes that happen meanwhile are coalesced
 * into the next diff, so a slow panel never builds a backlog.
 */

const BLOCK = 16 // JPEG MCU-aligned, so tiles decode without edge padding
const COLS = WIDTH / BLOCK
const ROWS = HEIGHT / BLOCK
const GAP_FILL = 1 // blocks this close count as one region
const MAX_TILES = 8
const ACK_TIMEOUT_MS = 3000
const POINTER_KINDS = { d: 'down', m: 'move', t: 'tap' }
const COPY_MARKER = 0xffffffff

/**
 * If the list scrolled between two frames, describe that as an on-screen copy of
 * pixels the panel already has: the overlap of the list's rect and its shifted self.
 */
function scrollCopy(prev, next) {
  const a = prev.scroll
  const b = next.scroll
  if (!a || !b || a.dir.join() !== b.dir.join()) return null
  if (a.rect.x !== b.rect.x || a.rect.y !== b.rect.y || a.rect.w !== b.rect.w || a.rect.h !== b.rect.h) return null
  const delta = b.top - a.top
  if (!delta || !Number.isInteger(delta)) return null
  const sx = b.dir[0] * delta
  const sy = b.dir[1] * delta
  const x0 = Math.max(b.rect.x, 0)
  const y0 = Math.max(b.rect.y, 0)
  const x1 = Math.min(b.rect.x + b.rect.w, WIDTH)
  const y1 = Math.min(b.rect.y + b.rect.h, HEIGHT)
  const dx0 = Math.max(x0, x0 + sx)
  const dy0 = Math.max(y0, y0 + sy)
  const dx1 = Math.min(x1, x1 + sx)
  const dy1 = Math.min(y1, y1 + sy)
  if (dx1 <= dx0 || dy1 <= dy0) return null
  return { x: dx0, y: dy0, w: dx1 - dx0, h: dy1 - dy0, srcX: dx0 - sx, srcY: dy0 - sy }
}

/** What the panel will show after the copy, so only the remaining differences become tiles. */
function applyCopy(raw, copy) {
  const out = Buffer.from(raw)
  const src = new Uint32Array(raw.buffer, raw.byteOffset, raw.length / 4)
  const dst = new Uint32Array(out.buffer, out.byteOffset, out.length / 4)
  for (let row = 0; row < copy.h; row++) {
    const from = (copy.srcY + row) * WIDTH + copy.srcX
    dst.set(src.subarray(from, from + copy.w), (copy.y + row) * WIDTH + copy.x)
  }
  return out
}

function dirtyMask(prev, next) {
  const a = new Uint32Array(prev.buffer, prev.byteOffset, prev.length / 4)
  const b = new Uint32Array(next.buffer, next.byteOffset, next.length / 4)
  const mask = new Uint8Array(COLS * ROWS)
  for (let by = 0; by < ROWS; by++) {
    for (let bx = 0; bx < COLS; bx++) {
      scan: for (let y = by * BLOCK; y < (by + 1) * BLOCK; y++) {
        const row = y * WIDTH + bx * BLOCK
        for (let x = 0; x < BLOCK; x++) {
          if (a[row + x] !== b[row + x]) {
            mask[by * COLS + bx] = 1
            break scan
          }
        }
      }
    }
  }
  return mask
}

const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0)
const union = (a, b) => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
})

/**
 * Turn a block mask into a few tight rectangles: the bounding box of each connected
 * dirty region, then merge boxes whose union wastes little area (decode time on the
 * panel scales with pixel area, so tight boxes matter more than few boxes).
 */
export function maskToRects(mask) {
  const seen = new Uint8Array(mask.length)
  let boxes = []
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue
    const box = { x0: COLS, y0: ROWS, x1: 0, y1: 0 }
    const stack = [i]
    seen[i] = 1
    while (stack.length) {
      const j = stack.pop()
      const bx = j % COLS
      const by = (j - bx) / COLS
      box.x0 = Math.min(box.x0, bx)
      box.y0 = Math.min(box.y0, by)
      box.x1 = Math.max(box.x1, bx + 1)
      box.y1 = Math.max(box.y1, by + 1)
      for (let dy = -GAP_FILL; dy <= GAP_FILL; dy++) {
        for (let dx = -GAP_FILL; dx <= GAP_FILL; dx++) {
          const nx = bx + dx
          const ny = by + dy
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
          const k = ny * COLS + nx
          if (mask[k] && !seen[k]) {
            seen[k] = 1
            stack.push(k)
          }
        }
      }
    }
    boxes.push(box)
  }

  // Greedily merge the cheapest pair while it wastes little, or while there are too many.
  for (;;) {
    let best = null
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const u = union(boxes[a], boxes[b])
        const waste = area(u) - area(boxes[a]) - area(boxes[b])
        if (!best || waste < best.waste) best = { a, b, u, waste }
      }
    }
    if (!best || (best.waste > 0 && boxes.length <= MAX_TILES)) break
    boxes = boxes.filter((_, i) => i !== best.a && i !== best.b).concat(best.u)
  }

  return boxes.map((b) => ({
    x: b.x0 * BLOCK,
    y: b.y0 * BLOCK,
    w: (b.x1 - b.x0) * BLOCK,
    h: (b.y1 - b.y0) * BLOCK,
  }))
}

async function encodeUpdate(frame, rects, full, quality, copy) {
  const jpegs = await Promise.all(
    rects.map((r) =>
      sharp(frame.raw, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
        .extract({ left: r.x, top: r.y, width: r.w, height: r.h })
        .removeAlpha()
        .jpeg({ quality, chromaSubsampling: '4:4:4', progressive: false })
        .toBuffer(),
    ),
  )
  const header = Buffer.alloc(8)
  header.write('T', 0, 'ascii')
  header.writeUInt8(full ? 1 : 0, 1)
  header.writeUInt16LE(rects.length + (copy ? 1 : 0), 2)
  header.writeUInt32LE(frame.version, 4)
  const parts = [header]
  if (copy) {
    const op = Buffer.alloc(16)
    op.writeUInt16LE(copy.x, 0)
    op.writeUInt16LE(copy.y, 2)
    op.writeUInt16LE(copy.w, 4)
    op.writeUInt16LE(copy.h, 6)
    op.writeUInt32LE(COPY_MARKER, 8)
    op.writeUInt16LE(copy.srcX, 12)
    op.writeUInt16LE(copy.srcY, 14)
    parts.push(op)
  }
  rects.forEach((r, i) => {
    const tile = Buffer.alloc(12)
    tile.writeUInt16LE(r.x, 0)
    tile.writeUInt16LE(r.y, 2)
    tile.writeUInt16LE(r.w, 4)
    tile.writeUInt16LE(r.h, 6)
    tile.writeUInt32LE(jpegs[i].length, 8)
    parts.push(tile, jpegs[i])
  })
  return Buffer.concat(parts)
}

export function attachTileStream({ server, renderer, isAuthorized, quality, log, getVolume, onPanelVolume }) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })
  const clients = new Set()

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy())
    const { pathname } = new URL(req.url, 'http://x')
    if (!pathname.endsWith('/ws')) return socket.destroy()
    if (!isAuthorized(req)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n')
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws, req) => {
    const client = { ws, sent: null, inflight: false, ackTimer: null, touchAt: 0, name: req.socket.remoteAddress }
    clients.add(client)
    log(`stream client connected (${client.name})`)

    ws.on('message', (data, isBinary) => {
      if (isBinary) return
      const [cmd, a, b, ...rest] = data.toString().trim().split(/\s+/)
      if (cmd === 'hello') {
        client.canCopy = Number(a) >= 2
        client.canSound = [b, ...rest].includes('sound')
        client.canVolume = [b, ...rest].includes('volume')
        client.canMaster = [b, ...rest].includes('master')
        client.sent = null
        settle(client)
      } else if (cmd === 'ack') {
        if (client.sentAt) log(`  v${a} acked after ${(performance.now() - client.sentAt).toFixed(0)}ms (${client.name})`)
        settle(client)
      } else if (cmd === 'v' && client.canMaster) {
        const volume = Number(a)
        if (volume >= 0 && volume <= 100) onPanelVolume?.(volume / 100)
      } else if (cmd === 'u') {
        client.touchAt = performance.now()
        renderer.pointer('up')
      } else if (POINTER_KINDS[cmd]) {
        const x = Number(a)
        const y = Number(b)
        if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
          client.touchAt = performance.now()
          renderer.pointer(POINTER_KINDS[cmd], x, y)
        }
      }
    })
    ws.on('close', () => {
      clearTimeout(client.ackTimer)
      clients.delete(client)
      log(`stream client disconnected (${client.name})`)
    })
  })

  function settle(client) {
    clearTimeout(client.ackTimer)
    client.inflight = false
    pump(client)
  }

  async function pump(client) {
    const frame = renderer.frame
    if (client.inflight || !frame || client.ws.readyState !== client.ws.OPEN) return
    if (client.sent?.version === frame.version) return

    const full = !client.sent
    let copy = null
    let base = client.sent?.raw
    if (!full && client.canCopy) {
      copy = scrollCopy(client.sent, frame)
      if (copy) base = applyCopy(client.sent.raw, copy)
    }
    const rects = full ? [{ x: 0, y: 0, w: WIDTH, h: HEIGHT }] : maskToRects(dirtyMask(base, frame.raw))
    client.sent = frame
    if (!copy && rects.length === 0) return

    client.inflight = true
    client.sentAt = 0
    const started = performance.now()
    const msg = await encodeUpdate(frame, rects, full, quality, copy)
    client.ws.send(msg)
    client.sentAt = performance.now()
    const sinceTouch = client.touchAt ? ` (touch→send ${(performance.now() - client.touchAt).toFixed(0)}ms)` : ''
    client.touchAt = 0
    log(
      `v${frame.version} -> ${client.name}: ${copy ? `copy ${copy.w}x${copy.h} + ` : ''}${rects.length} tile(s), ` +
        `${(msg.length / 1024).toFixed(1)}KB, ` +
        `encoded ${(performance.now() - started).toFixed(0)}ms${sinceTouch}`,
    )
    // If an ack never arrives, resync the client with a full frame.
    client.ackTimer = setTimeout(() => {
      client.sent = null
      settle(client)
    }, ACK_TIMEOUT_MS)
  }

  renderer.onFrame(() => {
    for (const client of clients) pump(client)
  })
  renderer.onSound((name, volume) => {
    for (const client of clients) {
      if (!client.canSound || client.ws.readyState !== client.ws.OPEN) continue
      // Without a master volume the panel scales each sound by the one it's sent.
      const vol = client.canMaster ? 100 : (volume ?? Math.round(getVolume() * 100))
      client.ws.send(client.canVolume ? `s ${name} ${vol}` : `s ${name}`)
    }
  })

  return {
    /** Set every capable panel's master volume (0-1). */
    setVolume(volume) {
      for (const client of clients) {
        if (client.canMaster && client.ws.readyState === client.ws.OPEN) client.ws.send(`v ${Math.round(volume * 100)}`)
      }
    },
  }
}
