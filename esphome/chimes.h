#pragma once

// Sounds the todo page asks for (tile_stream on_sound): a tap click and the alarm
// chimes. Synthesised at 48kHz 16-bit mono, the mixer's rate (music is 48kHz). The chime
// names match CHIMES in the add-on (server/alarms.js, src/lib/alarms.js).

#include "esphome/components/speaker/speaker.h"
#include "esphome/core/log.h"

#include <esp_heap_caps.h>

#include <algorithm>
#include <cmath>
#include <string>

namespace chimes {

static constexpr int RATE = 48000;
static constexpr int MAX_SAMPLES = RATE * 2;  // fits the speaker's 2s buffer

struct Partial {
  float ratio, amp;
};

// A struck/plucked note: fast attack, exponential decay, a few harmonics.
static void add_note(float *buf, float start, float freq, float dur, float tau, const Partial *partials, int count,
                     float gain = 1.0f) {
  const int from = start * RATE;
  const int len = std::min<int>(dur * RATE, MAX_SAMPLES - from);
  for (int i = 0; i < len; i++) {
    const float t = float(i) / RATE;
    const float env = std::min(1.0f, t / 0.003f) * expf(-t / tau) * std::min(1.0f, (dur - t) / 0.02f);
    float v = 0;
    for (int p = 0; p < count; p++)
      v += partials[p].amp * sinf(2 * float(M_PI) * freq * partials[p].ratio * t);
    buf[from + i] += gain * env * v;
  }
}

// Fills buf and returns the length in samples, or 0 for an unknown name.
static int synth(const std::string &name, float *buf) {
  std::fill(buf, buf + MAX_SAMPLES, 0.0f);
  if (name == "bell") {
    static const Partial p[] = {{1, 1}, {2.0f, 0.4f}, {3.0f, 0.25f}, {4.2f, 0.15f}};
    add_note(buf, 0.0f, 1046.5f, 0.9f, 0.45f, p, 4);
    add_note(buf, 0.75f, 1046.5f, 1.0f, 0.5f, p, 4);
    return 1.75f * RATE;
  }
  if (name == "dingdong") {
    static const Partial p[] = {{1, 1}, {2, 0.3f}, {3, 0.1f}};
    add_note(buf, 0.0f, 659.3f, 0.8f, 0.35f, p, 3);
    add_note(buf, 0.5f, 523.3f, 1.1f, 0.5f, p, 3);
    return 1.6f * RATE;
  }
  if (name == "chirp") {
    // Two bursts of three alarm-clock beeps.
    static const Partial p[] = {{1, 1}, {3, 0.3f}, {5, 0.15f}};
    for (float burst : {0.0f, 0.6f})
      for (int b = 0; b < 3; b++)
        add_note(buf, burst + b * 0.14f, 2000, 0.08f, 10, p, 3);
    return 1.0f * RATE;
  }
  if (name == "harp") {
    static const Partial p[] = {{1, 1}, {2, 0.25f}};
    const float notes[] = {523.3f, 659.3f, 784.0f, 1046.5f};
    for (int n = 0; n < 4; n++)
      add_note(buf, n * 0.12f, notes[n], 1.0f, 0.35f, p, 2);
    return 1.4f * RATE;
  }
  return 0;
}

// 8ms 2.5kHz tick with a fast decay (1.5ms). Squared volume so the slider feels
// even; 70% is about the original loudness.
static void play_click(esphome::speaker::Speaker *spk, float volume) {
  static constexpr int LEN = RATE / 125;
  static int16_t pcm[LEN];
  const float peak = 20000 * volume * volume;
  for (int i = 0; i < LEN; i++)
    pcm[i] = peak * expf(-float(i) / (RATE * 0.0015f)) * sinf(2 * float(M_PI) * 2500 * i / RATE);
  spk->play(reinterpret_cast<const uint8_t *>(pcm), sizeof(pcm));
}

/// The format every sound here is written in; set on the speaker before it starts.
static esphome::audio::AudioStreamInfo stream_info() { return esphome::audio::AudioStreamInfo(16, 1, RATE); }

// Returns false for an unknown sound.
static bool play(esphome::speaker::Speaker *spk, const std::string &name, float volume) {
  if (name == "click") {
    play_click(spk, volume);
    return true;
  }
  // Scratch buffers in PSRAM, allocated on first use.
  static float *mix = static_cast<float *>(heap_caps_malloc(MAX_SAMPLES * sizeof(float), MALLOC_CAP_SPIRAM));
  static int16_t *pcm = static_cast<int16_t *>(heap_caps_malloc(MAX_SAMPLES * sizeof(int16_t), MALLOC_CAP_SPIRAM));
  if (mix == nullptr || pcm == nullptr)
    return false;
  const int len = synth(name, mix);
  if (len == 0)
    return false;
  // Normalise, so every chime peaks at the same level for a given volume.
  float max = 1e-6f;
  for (int i = 0; i < len; i++)
    max = std::max(max, fabsf(mix[i]));
  const float scale = 26000 * volume * volume / max;
  for (int i = 0; i < len; i++)
    pcm[i] = mix[i] * scale;
  const size_t bytes = len * sizeof(int16_t);
  const size_t written = spk->play(reinterpret_cast<const uint8_t *>(pcm), bytes);
  if (written < bytes)
    ESP_LOGW("chimes", "%s: only %u of %u bytes fit the speaker buffer", name.c_str(), (unsigned) written,
             (unsigned) bytes);
  return true;
}

}  // namespace chimes
