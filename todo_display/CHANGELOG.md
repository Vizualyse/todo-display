# Changelog

Bump `version` in `config.yaml` with every change: Home Assistant only rebuilds
the add-on when the version changes.

## 0.4.0

- Heart menu button in the top right corner opens a popover to switch tabs.
- New "Add a todo" tab: on-screen keyboard (the panel is touch only), list
  picker and quick due dates (today, tomorrow, weekend, next week). Adds through
  Home Assistant's `todo.add_item`.
- Each open todo with a due date shows the time left (or how long it's overdue).
  Date-only due dates count down to the end of that day.
- API: `GET /api/lists`, `POST /api/todos` (`{list, title, due}`).

## 0.3.0

- Smooth drag-scrolling: scrolls are sent as a copy of pixels the panel already
  shows plus the newly revealed strip (3-6KB per step instead of ~22KB).
  Needs panel firmware with copy support (sends `hello 2`).
- Log each update's send→ack round trip, to tell panel from network latency.

## 0.2.0

- Todos come from Home Assistant (all todo lists, or `todo_entities`).
- Drag support: touches stream as down/move/up.

## 0.1.0

- First version: React page rendered by headless Chromium and streamed to the
  CrowPanel as JPEG tiles.
