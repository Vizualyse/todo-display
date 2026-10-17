# Learnings

Everything we found out the hard way while building this. Each entry: what
happened, why, and what to do. Numbers are measurements from the real
CrowPanel 7.0" unless marked otherwise.

## Architecture

- **The ESP32-S3 can't render HTML.** React/Tailwind only runs on the server. The
  panel just draws pixels it is sent. Server-side "SSR" here means rendering to
  pixels, not HTML.
- **Pipeline:** headless Chromium at 800x480 → raw RGBA capture → diff in 16px
  blocks against what *that client* last received → JPEG tiles over a WebSocket →
  panel decodes straight into its framebuffer → `ack <version>`.
- **One update in flight per client.** Changes made meanwhile are coalesced into
  the next diff, so a slow panel never builds a backlog. Don't send faster than acks.
- **Approaches compared** (tap → pixels): server screenshots + polling ~300-600ms;
  full-frame MJPEG ~150-300ms; dirty tiles ~80-150ms; native LVGL <30ms but no
  web styling. H.264 isn't viable on the S3 (no hardware decoder). We chose dirty
  tiles.

## Panel performance (measured)

| Operation | Time |
|---|---|
| Chromium capture (PNG, `optimizeForSpeed`) + decode | ~28ms per frame (~35fps) |
| Full 800x480 JPEG decode + draw on panel | ~200ms |
| Half-screen tile (~21KB) decode + draw | ~100ms |
| Copy + 80px strip (scroll step) | 40-50ms |
| Tiny tile (clock tick) | 1-3ms |
| Server touch → update sent | ~40ms |

- **Decode time scales with pixel area.** Tight tiles matter more than few tiles.
  The tile merger uses bounding boxes of connected dirty regions and only merges
  boxes when little area is wasted.
- **Scrolling must be a copy, not a re-send.** Sending the whole visible list per
  step ran at ~5fps. Now the page reports `{top, rect, dir}` for the
  `[data-scroll]` element with every frame. The streamer sends a copy op (the
  panel memmoves pixels it already has) plus only the revealed strip: 3-6KB per
  step instead of ~21KB.
- **Read scroll state and pixels atomically.** If input runs between
  `__scrollState()` and the screenshot, the copy offset is stale and the diff
  falls back to a huge tile. Input and capture share one queue (`exclusive()` in
  `renderer.js`).
- **Diff against the *predicted* post-copy image.** Then a wrong copy only costs
  bandwidth and never shows wrong pixels. Verify protocol changes with a
  framebuffer-accurate simulated client (we got 0 bad pixels, PSNR 43-46dB).
- **Nagle + Windows delayed ACK = ~200ms stalls.** `esp_websocket_client` has no
  `TCP_NODELAY` option, so tiny `ack` / touch messages waited for the server's
  delayed ACK. Symptom: acks 70-240ms regardless of payload size, and
  `touch→send` of ~200ms. Fix: `lwip_setsockopt(TCP_NODELAY)` on all sockets
  on `WEBSOCKET_EVENT_CONNECTED`.
- **ESPHome's main loop runs ~every 16ms when idle.** Use
  `HighFrequencyLoopRequester` while the user is interacting.
- **Bigger network buffers.** Bigger TCP window (32KB), more Wi-Fi RX buffers and
  aggregation, allocated in PSRAM.
- **Wi-Fi `power_save_mode: none`.** Power save adds 100ms+ to every exchange.
- **Measure, don't guess.** The server logs `send→ack` per update and the panel
  logs `drawn in Xms`. The difference between the two is network plus loop
  scheduling.

## CrowPanel 7.0" hardware (ESP32-S3, N4R8)

- **Chip:** ESP32-S3, 4MB flash, 8MB octal PSRAM. **Wi-Fi is 2.4GHz only**: a
  `*_5G` SSID won't work.
- **Logs:** the USB socket is a **CH340 on UART0**, not the S3's native USB. Without
  `logger: hardware_uart: UART0` you see only the ROM bootloader.
- **Touch I2C is on GPIO19/20, which are also the S3's native USB D-/D+.** The
  USB-Serial-JTAG PHY and its D+ pull-up hang the bus. Symptoms: the bus scan
  "finds" a device at every address, GT911 `Communication failed`, and
  `i2c.master: I2C software timeout`. sdkconfig alone did **not** fix it.
  `esphome/usb_disable.h` (a `constructor(101)` that runs before I2C init) does.
  Source: esphome/devices.esphome.io PR #1494.
- **GPIO38 is the GT911 INT / address strap, not reset.** Don't set `reset_pin` or
  `interrupt_pin` to 38. Poll at `update_interval: 50ms`, `address: 0x5D` (some
  units strap to 0x14).
- **RGB panel:** pins and timings are the defaults in `tile_stream/display.py`
  (PCLK 15MHz, inverted; hsync 48/40/40; vsync 31/13/1). Backlight on GPIO2
  (ledc).
- **We drive the panel ourselves via `esp_lcd`** instead of `rpi_dpi_rgb`.
  ESPHome's fast path flipped from little- to big-endian RGB565 between versions,
  and the touchscreen requires a `display`. So `tile_stream` is its own display
  platform.
- **Bounce buffers (10 lines)** keep the picture stable while Wi-Fi and the JPEG
  decoder compete for PSRAM. They also keep direct framebuffer writes (copy ops)
  cache-coherent. Without bounce buffers the panel must not advertise `hello 2`.
- **RGB565 bands gradients.** Design with flat colours. The old dark radial
  gradient banded visibly.

- **Screen timeout is panel-side, in YAML.** A `mode: restart` script restarted by
  every touch turns the backlight off. Test "asleep" with
  `backlight.remote_values` (the target state), so a tap during the fade-out
  also counts as a wake. Swallow the whole waking gesture (down/move/up), or the
  tap ticks the todo under the finger. The stream keeps running while the screen
  is dark, so the screen is up to date as soon as it wakes.

## ESPHome / ESP-IDF build gotchas

- `esp_crt_bundle.h` isn't on a custom component's include path, and the bundle
  isn't linked unless enabled. Forward-declare `esp_crt_bundle_attach`. Enable
  `CONFIG_MBEDTLS_CERTIFICATE_BUNDLE` only when the URL is `wss://`, and guard
  the code with `#ifdef`.
- `GPIO_NUM_NC` isn't declared there either; use `-1`.
- JPEG decoding: `JPEGDEC 1.8.4` + `espressif/esp-dsp`, the same libraries
  ESPHome's runtime images use. Tiles must be **baseline** JPEG (not progressive).
  We use 4:4:4 for crisp text.
- `.local` hostnames may not resolve from `esp_websocket_client`. Use IPs.
- ESPHome warns that `ota: password` wastes flash. Harmless; switch to OTA
  encryption when convenient.

## Rendering in Chromium

- **Portrait = CSS rotation inside an 800x480 viewport** (`rot-90` / `rot-270`
  classes). The panel always gets native-orientation pixels, and Chromium
  hit-tests through the transform, so raw touch coordinates just work.
- **Drag mapping:** finger movement on screen must be mapped onto the list's own
  axis. Portrait 90: list-y = -screen-x. 270: list-y = +screen-x. Landscape:
  list-y = screen-y. Set `scrollTop` to whole pixels so copies are exact.
- **Display mode disables transitions/animations.** One screenshot after a
  change is then final.
- **`MutationObserver` doesn't fire on scroll.** Listen for `scroll` (capture
  phase) separately.
- **A drag must swallow the click that ends it**, or dragging ticks the item under
  the finger.
- **The panel has no keyboard.** Text entry needs an on-screen keyboard in the page;
  each key press is a tap and a tiny tile update. Keep a physical-keyboard
  `keydown` handler too for the browser/ingress view.
- **Use `minmax(0,1fr)`, not `1fr`, for grid columns holding nowrap content.** A
  `1fr` column grows to its min-content width (nowrap chips, long titles), the
  `overflow-hidden` shell then gets scrolled sideways by clicks, and the whole
  frame shifts. Check both orientations with screenshots after layout changes.
- **Fonts:** self-hosted via `@fontsource` (Playfair Display, Jost, Great Vibes).
  The add-on has no internet dependency at render time.

## Home Assistant

- **Bump `version` in `todo_display/config.yaml` on every change.** HA only
  rebuilds when the version changes. We shipped a fix under an unchanged version
  and HA kept running the old streamer ("the lag came back"). Note it in
  `CHANGELOG.md`.
- **Add-on API access:** `homeassistant_api: true` gives `SUPERVISOR_TOKEN`.
  Connect to `ws://supervisor/core/websocket`. For local dev use `HA_URL` +
  `HA_TOKEN_FILE` (long-lived token in the gitignored `.ha-token`).
- **Todo API:** `todo/item/subscribe` pushes the full `{"items": [...]}` list
  immediately and on every change. Items have `uid`, `summary`, `status`
  (`needs_action` / `completed`) and `due` (`YYYY-MM-DD` or ISO datetime). Tick
  with `todo.update_item` using `item: <uid>`, `status`.
- **Editing:** `todo.update_item` takes `rename` and `due_date` (`null` clears
  it). There is no way to move an item to another list, so the edit form keeps
  the list fixed. Only send `due_date` if the user changed it, or an existing due
  *time* is lost.
- **Ingress requests come from `172.30.32.2`** and skip the display secret.
  Everything else needs `?key=`, `X-Display-Key` or the `td_key` cookie.
- **First add-on build on the HA box takes 10+ minutes** (Chromium, image
  ~1.4GB). The image is `node:22-bookworm-slim` + Debian `chromium`.

## Server robustness

- Attach `socket.on('error')` in the WebSocket upgrade handler. A client resetting
  during a 401 crashed the whole server with `ECONNRESET`.
- Toggle optimistically in the page so the frame updates at once. If HA rejects
  the change, broadcast so pages reload and roll back.

## Tooling (this Windows machine)

- **Compile firmware with the official Docker image, with caches in named volumes**
  (`esphome-build`, `esphome-pio`). A bind-mounted Windows folder made the
  ESP-IDF download crawl (424MB in 13 minutes).
- **Flash natively with `esptool`.** Docker Desktop can't reach COM ports. The
  panel is `COM3`; write `firmware.factory.bin` at `0x0`.
- Serial monitoring: opening the port with RTS toggled **resets the board**. To
  watch without rebooting, open with `dtr=False, rts=False`. Set
  `PYTHONIOENCODING=utf-8` (logs contain Unicode).
- Long multi-file bash heredocs failed to parse here. Use the Write tool for file
  contents.
- Windows Firewall: the Wi-Fi profile is *Public*, so port 8099 needed an inbound
  rule for local testing.

## Secrets and accounts

- **The repo is public.** The display key lives in `esphome/secrets.yaml`
  (`display_key: !secret display_key`), never in `crowpanel-todo.yaml`. Before
  every commit, grep the staged tree for the key. `.ha-token` and `secrets.yaml`
  are gitignored.
- **GitHub account is Vizualyse, explicitly.** It isn't the active `gh` account, so
  use `GH_TOKEN=$(gh auth token --user Vizualyse) gh ...`. The repo's Git
  credentials are pinned with `credential.https://github.com.username Vizualyse`.
