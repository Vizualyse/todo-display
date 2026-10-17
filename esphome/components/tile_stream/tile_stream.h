#pragma once

#ifdef USE_ESP32

#include "esphome/components/display/display.h"
#include "esphome/core/component.h"
#include "esphome/core/helpers.h"

#include <esp_lcd_panel_ops.h>
#include <esp_lcd_panel_rgb.h>
#include <esp_websocket_client.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

#include <JPEGDEC.h>

#include <atomic>
#include <memory>
#include <string>

namespace esphome {
namespace tile_stream {

/**
 * Display platform that owns an ESP32-S3 RGB panel and fills it with JPEG tiles
 * pushed by the todo_display server over a WebSocket. See server/stream.js for
 * the wire protocol.
 */
class TileStreamDisplay : public display::Display {
 public:
  void setup() override;
  void loop() override;
  // Frames come from the stream, not from a lambda, so periodic updates do nothing.
  void update() override {}
  void dump_config() override;
  float get_setup_priority() const override { return setup_priority::HARDWARE; }

  display::DisplayType get_display_type() override { return display::DISPLAY_TYPE_COLOR; }
  void draw_pixel_at(int x, int y, Color color) override;

  /// Forward touches (native panel coordinates) to the server. A down + up with
  /// little movement is a tap; moves in between drag (e.g. scroll the list).
  void touch_down(int x, int y);
  void touch_move(int x, int y);
  void touch_up();
  bool is_stream_connected() const { return this->ws_connected_; }

  void set_url(const std::string &url) { this->url_ = url; }
  void set_dimensions(int width, int height) {
    this->width_ = width;
    this->height_ = height;
  }
  void set_pclk(uint32_t hz, bool inverted) {
    this->pclk_hz_ = hz;
    this->pclk_inverted_ = inverted;
  }
  void set_bounce_buffer_lines(int lines) { this->bounce_lines_ = lines; }
  void set_sync_pins(int de, int hsync, int vsync, int pclk) {
    this->de_pin_ = de;
    this->hsync_pin_ = hsync;
    this->vsync_pin_ = vsync;
    this->pclk_pin_ = pclk;
  }
  void set_data_pin(int index, int pin) { this->data_pins_[index] = pin; }
  void set_timings(int hpw, int hbp, int hfp, int vpw, int vbp, int vfp) {
    this->hsync_pulse_width_ = hpw;
    this->hsync_back_porch_ = hbp;
    this->hsync_front_porch_ = hfp;
    this->vsync_pulse_width_ = vpw;
    this->vsync_back_porch_ = vbp;
    this->vsync_front_porch_ = vfp;
  }

 protected:
  struct Update {
    uint8_t *data;
    size_t len;
  };

  int get_width_internal() override { return this->width_; }
  int get_height_internal() override { return this->height_; }

  void start_stream_();
  void send_text_(const char *text);
  void apply_update_(const Update &update);
  void copy_rect_(int src_x, int src_y, int dst_x, int dst_y, int w, int h);
  void on_ws_data_(const esp_websocket_event_data_t *event);
  void drop_partial_();
  static void on_ws_event_(void *arg, esp_event_base_t base, int32_t event_id, void *event_data);
  static int on_jpeg_draw_(JPEGDRAW *draw);

  std::string url_;
  int width_{800};
  int height_{480};
  uint32_t pclk_hz_{15000000};
  bool pclk_inverted_{true};
  int bounce_lines_{10};
  int de_pin_{-1}, hsync_pin_{-1}, vsync_pin_{-1}, pclk_pin_{-1};
  int data_pins_[16]{};
  int hsync_pulse_width_{}, hsync_back_porch_{}, hsync_front_porch_{};
  int vsync_pulse_width_{}, vsync_back_porch_{}, vsync_front_porch_{};

  esp_lcd_panel_handle_t panel_{nullptr};
  esp_websocket_client_handle_t client_{nullptr};
  std::unique_ptr<JPEGDEC> jpeg_;

  // Written by the WebSocket task, consumed in loop().
  QueueHandle_t updates_{nullptr};
  std::atomic<bool> ws_connected_{false};
  std::atomic<bool> ws_just_connected_{false};
  uint8_t *rx_buf_{nullptr};
  size_t rx_len_{0};

  bool touching_{false};
  uint32_t last_touch_ms_{0};
  HighFrequencyLoopRequester high_freq_;
  int last_touch_x_{0};
  int last_touch_y_{0};
};

}  // namespace tile_stream
}  // namespace esphome

#endif  // USE_ESP32
