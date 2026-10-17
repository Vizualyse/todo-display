import { chromium } from 'playwright-core'
import sharp from 'sharp'

export const WIDTH = 800
export const HEIGHT = 480

/**
 * Keeps one headless page open on the display URL and captures raw RGBA pixels
 * whenever the page reports a painted DOM change. Subscribers get every new frame.
 */
export async function createRenderer({ url, executablePath, channel, log }) {
  const browser = await chromium.launch({
    executablePath,
    channel,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  })
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
  const cdp = await page.context().newCDPSession(page)

  let frame = null // { raw: Buffer (RGBA), version, capturedAt }
  let capturing = false
  let again = false
  let queue = Promise.resolve()
  const listeners = new Set()
  const soundListeners = new Set()

  /** Run fn after everything queued before it; input and captures never interleave. */
  function exclusive(fn) {
    const run = queue.then(fn)
    queue = run.catch(() => {})
    return run
  }

  async function capture() {
    if (capturing) {
      again = true
      return
    }
    capturing = true
    try {
      do {
        again = false
        const started = performance.now()
        // Scroll state is read with the pixels so the streamer can turn scrolling into a
        // copy. Both happen inside the input queue so no drag step lands in between.
        const [scroll, { data }] = await exclusive(() =>
          Promise.all([
            page.evaluate(() => window.__scrollState?.() ?? null),
            cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true }),
          ]),
        )
        const raw = await sharp(Buffer.from(data, 'base64')).ensureAlpha().raw().toBuffer()
        if (!frame || !raw.equals(frame.raw)) {
          frame = { raw, scroll, version: (frame?.version ?? 0) + 1, capturedAt: performance.now() }
          log(`frame v${frame.version} captured in ${(performance.now() - started).toFixed(0)}ms`)
          for (const fn of listeners) fn(frame)
        }
      } while (again)
    } catch (err) {
      log(`capture failed: ${err.message}`)
    } finally {
      capturing = false
    }
  }

  await page.exposeFunction('__frameDirty', () => void capture())
  // The page asks the panel to play a sound (e.g. a click when a tap hits a button)
  // at a volume of 0-100.
  function playSound(name, volume) {
    if (typeof name !== 'string' || !/^[a-z]{1,15}$/.test(name)) return
    const vol = Math.min(100, Math.max(0, Math.round(Number(volume ?? 70)) || 0))
    for (const fn of soundListeners) fn(name, vol)
  }
  await page.exposeFunction('__sound', playSound)
  page.on('crash', () => {
    log('page crashed, reloading')
    page.reload().catch(() => {})
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await capture()
  // Safety net for changes the MutationObserver can't see (e.g. canvas).
  const safety = setInterval(capture, 60_000)

  return {
    get frame() {
      return frame
    },
    onFrame(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    /** Also used by the server itself, e.g. for alarm chimes. */
    playSound,
    onSound(fn) {
      soundListeners.add(fn)
      return () => soundListeners.delete(fn)
    },
    /**
     * Replay panel touches as real mouse input, strictly in arrival order. The
     * resulting frames arrive via onFrame. kind: 'tap' | 'down' | 'move' | 'up'.
     */
    pointer(kind, x, y) {
      exclusive(() => {
        if (kind === 'tap') return page.mouse.click(x, y)
        if (kind === 'down') return page.mouse.move(x, y).then(() => page.mouse.down())
        if (kind === 'move') return page.mouse.move(x, y)
        if (kind === 'up') return page.mouse.up()
      }).catch((err) => log(`input ${kind} failed: ${err.message}`))
    },
    async close() {
      clearInterval(safety)
      await browser.close()
    },
  }
}
