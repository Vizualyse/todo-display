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
- **Speaker: NS4168 I2S amp, confirmed working.** BCLK GPIO42, LRCLK GPIO18, data
  GPIO17 (`i2s_audio` + `speaker: dac_type: external, channel: mono`). The "Advance"
  7.0" uses GPIO4/5/6 instead; don't copy those. A ~4Ω laptop speaker on the speaker
  socket is fine; its outputs are bridge-tied, so neither wire is ground and
  polarity doesn't matter. `esphome/crowpanel-audio-test.yaml` is a smoke test (tone
  + test screen).
- **Keep the I2S speaker running (`timeout: never`, `spk.start()` on boot) for
  clicks.** `speaker.play()` on a stopped speaker starts it but drops the data while
  the driver comes up, so a click after idle would be silent. Silence costs ~32KB/s
  of I2S DMA, nothing audible. Start it from `on_boot` with `priority: -100`: at the
  default priority the speaker isn't set up yet and `start()` silently does nothing.
- **Tap sounds come from the page, not the touch handler.** The page knows whether a
  tap hit a button; a bubble-phase `click` listener on `window` never sees the click a
  drag swallows. Server sends `s click` only to panels whose `hello` lists `sound`.
- **A native `<input type="range">` works on the panel, rotated too.** Chromium maps
  the mouse through the portrait rotation, so dragging follows the finger. Style it
  with flat colours (a hard-stop fill), not a gradient.
- **Chimes are synthesised on the panel** (`esphome/chimes.h`), 16kHz mono, and
  written to the speaker in one `play()`. That needs `buffer_duration` longer than
  the longest chime (2s for 1.75s); a short buffer silently truncates it.
- **Music is Sendspin, mainline in ESPHome since 2026.3** (`sendspin` hub, a
  `sendspin` media source in a `speaker_source` media player). Music Assistant
  finds the panel over mDNS and connects by itself, even before the device is in
  HA. Its HA media player (with metadata/art) only exists once the Music
  Assistant *integration* is set up in HA.
- **Don't run heavy maths in an ESPHome callback: the task watchdog reboots the panel.**
  `on_sound` runs in the main loop. Synthesising a chime with `sinf`/`expf` per
  sample per partial was fine at 16kHz but at 48kHz (and with code fetched from
  PSRAM) it tripped `Task wdt` on core 1. The symptom looked like "the screen lit up
  but no sound": the reboot turns the backlight on (`ALWAYS_ON`) and the add-on logs a
  new stream connection. The synth now uses rotating phasors and a running decay
  product, with no trig per sample. The API log shows `CRASH DETECTED ON PREVIOUS BOOT`
  with a backtrace on the next connection. Decode it with the toolchain's `addr2line`
  in the `esphome-build` volume.
- **One amp, three sounds: `mixer` speaker** with an effects source (clicks,
  chimes, `timeout: never`) and a music source, all at 48kHz so no `resampler` is
  needed; the chimes are synthesised at 48kHz to match. Don't name the mixer
  `mixer`: an ID can't equal an integration name. Flash use went 54% -> 69%.
- **A mixer source speaker's volume is the amp's volume.** `SourceSpeaker::set_volume`
  forwards to the output speaker, so the music player's volume scales clicks and
  chimes too. We lean into it: that volume is the panel's master volume, the page
  sets it (`v <n>`) and the panel reports every change back (`on_volume`), so the
  page and Music Assistant never disagree. Effects are rendered at full scale.
- **The headers expose no spare GPIO.** I2C (IO20, IO19, 3v3, GND), GPIO_D (IO38, NC,
  3v3, GND), UART0 (IO44 RX, IO43 TX, 3v3, GND), and an 8-pin GPIO_D/I2C combo with
  the same signals. 19/20 are touch, 38 is the GT911 INT, and the CH340's TX drives
  IO44. IO43 is the only one usable, and only with UART0 logging off. Anything else,
  like an I2S mic, means soldering to the microSD slot (GPIO10-13 expected) or the
  amp's I2S lines. `esphome/crowpanel-pin-finder.yaml` blinks one candidate at 1Hz
  (the rest held low) so you can find the pads with a multimeter. A steady high won't
  do: the slot's pull-ups and supply pins read 3.3V too.
- **I2S mic on the microSD pads works.** INMP441: SD GPIO10, WS GPIO11, SCK GPIO12,
  L/R to GND, on its own `i2s_audio` bus (`bits_per_sample: 32bit`, `channel: left`).
  Measured with `sound_level`: quiet room ~-70 dBFS RMS, speech -50..-40 with peaks
  ~-12. Our unit has a solder bridge GPIO12-GPIO13; harmless while GPIO13 stays an
  undriven input, but never use the SD card or drive 13 with it there.
  `esphome/crowpanel-mic-test.yaml` checks GPIO10-13 for bridges/shorts at boot
  (`on_boot` priority 800, before I2S claims them) and shows live levels.
- **Voice assistant: on-device "Okay Nabu" + HA Assist.** `micro_wake_word` and
  `voice_assistant` on the mic (`gain_factor: 4`); replies play through the music
  player's `announcement_pipeline` (`audio_http` source, FLAC 48kHz mono, a third
  mixer source `announce_spk`; it must be a different speaker from the media
  pipeline's). Detection probability 0.97-0.99 at normal speaking distance, and a
  full-frame draw stayed ~212ms. Flash went 69% -> 85.5%. HA's pipeline needs an STT
  engine: without one every request ends in `validation-error - the pipeline does
  not support speech-to-text` right after the wake word.
- **The voice assistant can't be told to skip its own playback.** Its media player
  is fixed at build time; nulling it at runtime (`set_media_player(nullptr)`) leaves
  it in `STREAMING_RESPONSE` forever after `tts-end` (`local_output_` stays true and
  nothing starts the playback timeout), so `on_end`'s wait never finishes. "Reply on
  Alexa" instead lets the panel play the reply with `announce_spk` ducked 50dB (the
  mixer's maximum; 51 is clamped) and sends `on_tts_end`'s URL to
  `music_assistant.play_announcement` on the Echo. HA must allow the device to
  perform actions. Ducking only that source leaves chimes and music alone.
- **Voice timers need a handler on the panel.** HA only offers timers to a satellite
  that defines an `on_timer_*` trigger; `on_timer_finished` runs `timer_ring` (bell
  every 2.5s, ~30s, a tap silences it and is swallowed).
- **The LLM's built-in list tool can't set dates.** `HassListAddItem` takes only the
  item and list name, so "tomorrow" is dropped. The `script.add_todo` script (exposed
  to Assist, so the LLM sees it as a tool) posts to the add-on's `/api/todos` through
  a `rest_command` in HA's `configuration.yaml` (`X-Display-Key`), which also sets the
  panel alarm. No MCP needed. Script results are templated values: a JSON string in a
  variable is parsed back into a dict, so build the JSON in the `rest_command` payload.
  Ollama (qwen3:8b) put "to-do list" items on the shopping list until the instructions
  named the lists; the to-do list (Married Life) also has aliases "To-do list", "Todo".
- **Backlight (GPIO2) is off unless a config drives it.** A test firmware without the
  `ledc` backlight light looks blank even though the framebuffer is drawn.
- **RGB565 bands gradients.** Design with flat colours. The old dark radial
  gradient banded visibly.

- **Screen timeout is panel-side, in YAML.** A `mode: restart` script restarted by
  every touch turns the backlight off. Test "asleep" with
  `backlight.remote_values` (the target state), so a tap during the fade-out
  also counts as a wake. Swallow the whole waking gesture (down/move/up), or the
  tap ticks the todo under the finger. The stream keeps running while the screen
  is dark, so the screen is up to date as soon as it wakes.
- **The backlight is an HA light, so area-wide light actions hit it.** The panel
  sits in the Bedroom area, and the bedroom Bilresa remote's `light.toggle` /
  `light.turn_on` on `area_id: bedroom` switched the screen on (and off) with the
  room lights. A turn-on from HA doesn't start `screen_idle`, so the screen stayed
  lit for 30-50 minutes until someone touched it. Found by checking the backlight's
  logbook context (`automation_triggered`) in HA. The light's `on_turn_on` now
  starts `screen_idle`, so any turn-on times out.

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
- **`MutationObserver` doesn't fire on scroll** or when an `<img>` finishes
  loading. Listen for `scroll` and `load` (capture phase) separately, or album art
  shows up a frame late or never.
- **No native `<select>` on the panel.** Its popup is drawn outside the page and
  never shows up in the screenshot. Draw dropdowns in the page.
- **Landscape has no spare height in the add form.** Every extra row pushes the
  keyboard area off-screen; put extra chips beside the title instead. Screenshot
  every picker state in all three orientations after form changes.
- **A drag must swallow the click that ends it**, or dragging ticks the item under
  the finger.
- **The panel has no keyboard.** Text entry needs an on-screen keyboard in the page;
  each key press is a tap and a tiny tile update. Keep a physical-keyboard
  `keydown` handler too for the browser/ingress view.
- **Use `minmax(0,1fr)`, not `1fr`, for grid columns holding nowrap content.** A
  `1fr` column grows to its min-content width (nowrap chips, long titles), the
  `overflow-hidden` shell then gets scrolled sideways by clicks, and the whole
  frame shifts. Check both orientations with screenshots after layout changes.
- **Verify page refactors by pixel diff.** Screenshot every UI state in all three
  orientations before and after with Playwright, `page.clock.setFixedTime()` so the
  clock doesn't move, and the mock source; compare raw RGBA. A pure refactor must
  give 0 differing bytes. Keep a stateful child mounted and `hidden` (not
  unmounted) when swapping it out, or its state resets.
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
- **Due times:** `todo.add_item` / `update_item` take `due_datetime` as
  `"YYYY-MM-DD HH:MM:SS"` in HA's time zone; items come back with an ISO datetime
  and offset. The page sends `YYYY-MM-DDTHH:MM` local and the server converts.
  Only lists with `SET_DUE_DATETIME_ON_ITEM` (32) take a time (`dueTimes`).
- **HA can't store extra fields on a todo item.** Alarms live in the add-on's
  `/data/alarms.json`, keyed `<entity>|<uid>`. `add_item` doesn't return the uid, so
  a new todo's alarm is attached when an item with its title appears in the list.
- **Not every todo list takes due dates.** The shopping list doesn't. Check the
  entity's `supported_features`: `SET_DUE_DATE_ON_ITEM` (16) or
  `SET_DUE_DATETIME_ON_ITEM` (32). The server exposes it as `dueDates` on
  `/api/lists`, and the form hides the date row when it's false.
- **Music Assistant sync groups have dynamic members.** The group's media player
  (`mass_player_type: group`) lists only the speakers playing in it *now* in
  `group_members`; a speaker taken out stays `idle`, not `off`, and drops off the
  list (idle, the group listed all three). So membership is not power:
  `media_player.join` on the group with `group_members: [x]` adds one, `unjoin` on
  the speaker removes it. HA can't tell you the group's full speaker list (MA's own
  API, ws://<ma>:8095/ws, has `can_group_with` but needs an MA token), so the page
  offers every MA player with the `GROUPING` feature (524288), minus MA's browser
  players ("Web (...)"); Echos lack the feature. The group itself is remembered
  (`/data/settings.json`): a panel switched out of it no longer appears in it.
- **Music Assistant search is a service with a response:** `music_assistant.search`
  needs `config_entry_id` (from `config_entries/get`, domain `music_assistant`) and
  `return_response: true` over the WebSocket. It takes 5-8s here (Spotify + Plex),
  so show a "Searching" state. Track `image` is a Spotify CDN or MA `imageproxy`
  URL (LAN); the add-on fetches and shrinks it, the panel's Chromium never goes
  online. Play with `music_assistant.play_media` (`enqueue: play`). A playing
  track's `media_content_id` can be a provider uri while search returned a
  `library://` one, so match the current track by title and artist too.
- **Weather forecasts aren't attributes any more.** Get them with
  `weather.get_forecasts` (`type: hourly|daily`, `return_response: true`); the
  entity's `supported_features` says which exist (daily 1, hourly 2, twice-daily 4).
  Met.no (*Forecast Home*, `weather.forecast_home`) gives 48 hourly entries from
  the *next* full hour, so the current hour is only in the entity's state. It has
  **no `precipitation_probability`**, only `precipitation` in mm (0.1mm steps), so
  "will it rain" comes from amounts: an hour is wet at >= 0.1mm, or at a 50% chance
  where a provider gives one.
- **Express 5 has no inline regex route params** (`/:command(a|b)` throws at
  startup). Look the param up and call `next()` for anything else.
- **Ingress requests come from `172.30.32.2`** and skip the display secret.
  Everything else needs `?key=`, `X-Display-Key` or the `td_key` cookie.
- **Ingress panels are admin-only by default.** `panel_admin: false` in
  `config.yaml` shows the sidebar panel to non-admins. There are no per-user
  permissions: anyone who sees the panel can edit todos with the add-on's token.
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
  contents. Scripted edits through a heredoc also mangle escapes: a `\n` in a JS
  string reached the file as a real newline, and `\\.` in YAML didn't match. Use
  the Edit tool for anything with backslashes.
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
