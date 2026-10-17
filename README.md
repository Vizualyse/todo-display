# ToDo Display

A React + Tailwind todo page that runs as a Home Assistant add-on and is streamed,
as pixels, to an Elecrow CrowPanel 7.0" (ESP32-S3, 800x480) running ESPHome.

```
 Home Assistant add-on (todo_display/)                     CrowPanel (esphome/)
┌─────────────────────────────────────────────┐          ┌──────────────────────────┐
│ React page ──► headless Chromium (800x480)   │          │ tile_stream display      │
│   MutationObserver → "frame dirty"           │  ws(s)   │  JPEGDEC → RGB framebuf  │
│ capture → diff 16px blocks → JPEG tiles  ────┼─────────►│  "ack <ver>" when drawn  │
│ page.mouse.click(x, y)  ◄────────────────────┼──────────┤  GT911 touch "t x y"     │
└─────────────────────────────────────────────┘          └──────────────────────────┘
```

Only changed regions are sent (a tap is typically ~10KB of tiles, not a 40KB frame),
one update is in flight per panel, and changes made meanwhile are coalesced.

## Layout

| Path | What |
|---|---|
| `repository.yaml` | Makes this repo installable as a Home Assistant add-on repository |
| `todo_display/` | The add-on: `config.yaml`, `Dockerfile`, and the app |
| `todo_display/app/src/` | React + Tailwind page (mock todo data for now) |
| `todo_display/app/server/` | Express server, Chromium renderer, tile streamer, `/preview` |
| `esphome/components/tile_stream/` | Custom ESPHome display platform (RGB panel + WebSocket + JPEG) |
| `esphome/crowpanel-todo.yaml` | Device config for the CrowPanel 7.0" |

## Run locally

```sh
cd todo_display/app
npm install
npm run build
DISPLAY_SECRET=dev-secret npm start      # uses Edge/Chrome on Windows, CHROMIUM_PATH elsewhere
```

- `http://localhost:8099/` — the page as a normal web page
- `http://localhost:8099/preview` — a browser stand-in for the panel: same protocol, click to "touch",
  shows touch→pixels latency (tick *outline tiles* to see what each update sends)
- `ORIENTATION=landscape` or `ROTATION=270` to change the panel layout

## Install the add-on

1. Push this repo to GitHub and add it in **Settings → Add-ons → Add-on store → ⋮ → Repositories**
   (or copy `todo_display/` into `/addons/` on the HA host for a local add-on).
2. Install **ToDo Display**, set `display_secret`, start it. It appears in the sidebar via ingress.
3. Port 8099 is exposed for the panel. For `todo.vizualyse.uk`, point your tunnel or reverse proxy at
   `http://<ha-host>:8099` with WebSocket support enabled.

| Option | Default | |
|---|---|---|
| `display_secret` | `change-me` | Required by the panel (`?key=`) and by any non-ingress browser |
| `orientation` | `portrait` | `portrait` or `landscape` |
| `rotation` | `90` | `90` or `270`: which way the panel is mounted in portrait |
| `jpeg_quality` | `80` | Tile quality; lower is smaller and faster to decode |

## Flash the panel

1. Copy `esphome/` into your ESPHome config dir, create `secrets.yaml` from `secrets.example.yaml`.
2. In `crowpanel-todo.yaml` set `display_key` to the add-on's `display_secret`, and `stream_url` to your
   HA IP (fastest) or the `wss://todo.vizualyse.uk/...` line.
3. First flash over USB, OTA after that.

## Auth

The secret is accepted as `?key=`, an `X-Display-Key` header, or the `td_key` cookie set after the
first `?key=` visit. Requests from HA ingress and from the renderer itself (loopback) skip it.
