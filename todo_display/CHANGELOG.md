# Changelog

Bump `version` in `config.yaml` with every change: Home Assistant only rebuilds
the add-on when the version changes.

## 0.10.1

- Music page: every Music Assistant speaker that can join a group gets a switch,
  so a TV or projector that isn't playing can be added. Before, only speakers
  the add-on had seen in the group were offered. Music Assistant's browser
  players ("Web (...)") and speakers that can't group (Echo) are left out;
  `music_speakers` still sets the list explicitly.
- The page is titled *Music* instead of the group's name.

## 0.10.0

- Music page: *Search & speakers* in the music popover (or *Music* in the heart
  menu) opens a full-screen page for the Music Assistant sync group the panel is
  in (e.g. *Sync Players*): its now playing, previous / play-pause / next and the
  group's volume, a switch per speaker to add it to the group or take it out
  (`media_player.join` / `unjoin`), and a track search with the on-screen
  keyboard. Results scroll and show album art; tapping one plays it on the group
  straight away (Music Assistant `search` / `play_media`, `enqueue: play`).
- Music Assistant only lists the speakers playing in a group, so the add-on
  remembers the group and every speaker it has seen in it (in
  `/data/settings.json`); a speaker switched out keeps its switch. New options
  `music_group` and `music_speakers` set them explicitly.
- Search thumbnails are fetched and shrunk to 96px by the add-on; only art URLs
  from the latest searches are fetched.

## 0.9.0

- One volume for everything: the heart menu's slider (and the one in the music
  popover) is the panel's master volume, applied at the amp, so it scales tap
  clicks, alarm chimes and music together. It follows the panel when Music
  Assistant or Spotify changes the volume.
- Louder clicks and chimes: full scale with a soft-clipped boost.
- Tap-sound mute and the volume are kept in `/data/settings.json`, so they
  survive add-on restarts (they used to reset).
- Protocol: panels advertising `master` get `v <0-100>` to set their volume and
  report changes with `v <0-100>`; sounds go to them at 100. Older firmware
  keeps getting the volume with each sound.

## 0.8.0

- Music: a note button left of the heart opens *Now playing* for the panel's
  Music Assistant player: album art, title, artist, previous / play-pause /
  next and a volume slider. Spotify plays on it through Music Assistant's
  Spotify Connect. The button only appears once Home Assistant has the player
  (the Music Assistant integration set up); found by name ("CrowPanel"), or set
  the new `music_player` option.
- The panel firmware plays music itself over Sendspin, mixed with tap clicks and
  alarm chimes (ESPHome `sendspin` + `speaker_source` + `mixer`).

## 0.7.0

- Due times: once a date is picked, a *Time* chip opens an hour/minute grid. Only
  for lists that take due times (`SET_DUE_DATETIME_ON_ITEM`); sent to HA as
  `due_datetime` in HA's time zone. Editing keeps an existing time.
- Alarms: for a todo with a time, an *Alarm* chip turns on reminders 1 hour,
  30 min and/or 5 min before, with a chime per todo (Bell, Ding-dong, Chirp,
  Harp) picked from a list that plays it on the panel. The add-on rings them (at
  full volume, even with tap sounds muted) and the panel lights its screen.
  Reminders are kept in `/data/alarms.json`; todo cards with one show a bell.
- In landscape the Time and Alarm chips sit beside the title, as icons until set.
- Volume slider under *Tap sounds* in the heart menu (0-100%, default 70%). It
  clicks once on release so the level can be heard, and is greyed out while
  muted.
- Needs the updated ESPHome config (`chimes.h`, 2s speaker buffer) for chimes;
  older firmware ignores them.
- Protocol: panels that also advertise `volume` (`hello 2 sound volume`) get
  `s click <0-100>`; 0.6.0 firmware still gets plain `s click` (plays at 70%).

## 0.6.0

- Tap sounds: a tap that lands on a button asks the panel to play a short click.
  Taps on empty space and drags stay silent. The heart menu has a *Tap sounds*
  On/Off switch (display only; remembered until the add-on restarts, like the
  list filter).
- Stream protocol: panels advertise `sound` in `hello` (`hello 2 sound`), and only
  those get `s click` text messages. Older firmware is unaffected. Needs the
  updated ESPHome config (speaker + `on_sound`) on the panel.

## 0.5.1

- Page split from one `App.jsx` into components, hooks and helpers under
  `src/`. No visible change: every screen renders pixel-identical in all three
  orientations.
- The ToDo sidebar panel is visible to non-admin users (`panel_admin: false`).
  They get full access: the add-on acts with its own token, not theirs.
- List filter: a round button beside To do / Done / All picks which todo lists
  are shown (list, counts and summary). Only *Married Life* is ticked by
  default (every list if there is none by that name); the choice is remembered
  per browser. *Add a todo* starts on the first ticked list.
- Lists that can't hold due dates (HA's shopping list, read from the entity's
  `supported_features`) get no date choice when adding or editing.

## 0.5.0

- Tap a card to edit its title and due date (the circle still ticks it). The
  list can't be changed: Home Assistant has no way to move an item.
- Due picker: "Custom" replaces "Next week" and opens a calendar in place of
  the keyboard. The chip then shows the chosen date.
- API: `PATCH /api/todos/:id` (`{title?, due?}`, `due: null` clears it).

## 0.4.1

- List is ordered upcoming first: soonest deadline at the top (overdue first),
  then undated items, then done ones.

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
