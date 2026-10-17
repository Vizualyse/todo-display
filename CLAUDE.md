# ToDo Display

Home Assistant add-on that renders a React + Tailwind todo page in headless
Chromium and streams it as JPEG tiles to an ESP32-S3 CrowPanel 7.0" running a
custom ESPHome display component. See `README.md` for layout and setup.

## MUST READ before implementing anything

**Read [`Learnings.md`](Learnings.md) in full before making any change.** It records
measured performance, hardware quirks (touch I2C on the USB pins, GPIO38, UART0
logging), protocol invariants (one update in flight, scroll copies, atomic scroll
state), and process rules that already cost us debugging time. Don't re-learn
them.

## Non-negotiables

- Bump `version` in `todo_display/config.yaml` (and add a `CHANGELOG.md` entry) for
  every add-on change, or Home Assistant keeps running the old build.
- The repo is public: no secrets in tracked files. The display key belongs in
  `esphome/secrets.yaml`; the HA token in `.ha-token`.
- GitHub operations use the **Vizualyse** account explicitly:
  `GH_TOKEN=$(gh auth token --user Vizualyse) gh ...`.
- Protocol changes must stay backward compatible (negotiate via `hello <n>`) and be
  verified with a framebuffer-accurate simulated client before flashing.
- Add new learnings to `Learnings.md` as you discover them.
