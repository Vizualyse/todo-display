# Changelog

Bump `version` in `config.yaml` with every change: Home Assistant only rebuilds
the add-on when the version changes.

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
