#pragma once

// The voice satellite's "I'm listening" chime: two quick rising notes, built with the
// panel's synth (chimes.h) but in a buffer sized for this one sound. chimes::play()
// allocates 2s of scratch (~576KB), too much for the satellite's 2MB of PSRAM.

#include "chimes.h"

namespace wake_chime {

static constexpr int LEN = chimes::RATE * 0.35f;

static void play(esphome::speaker::Speaker *spk) {
  static float *mix = static_cast<float *>(heap_caps_malloc(LEN * sizeof(float), MALLOC_CAP_SPIRAM));
  static int16_t *pcm = static_cast<int16_t *>(heap_caps_malloc(LEN * sizeof(int16_t), MALLOC_CAP_SPIRAM));
  if (mix == nullptr || pcm == nullptr)
    return;
  static const chimes::Partial p[] = {{1, 1}, {2, 0.2f}};
  std::fill(mix, mix + LEN, 0.0f);
  chimes::add_note(mix, 0.0f, 784.0f, 0.25f, 0.06f, p, 2);
  chimes::add_note(mix, 0.09f, 1174.7f, 0.26f, 0.08f, p, 2);
  float max = 1e-6f;
  for (int i = 0; i < LEN; i++)
    max = std::max(max, fabsf(mix[i]));
  for (int i = 0; i < LEN; i++)
    pcm[i] = chimes::shape(mix[i] / max, 1.0f);
  spk->play(reinterpret_cast<const uint8_t *>(pcm), LEN * sizeof(int16_t));
}

}  // namespace wake_chime
