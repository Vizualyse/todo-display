#ifdef USE_ESP32

#include "tile_stream.h"

#include "esphome/components/network/util.h"
#include "esphome/core/hal.h"
#include "esphome/core/log.h"

#include <esp_heap_caps.h>
#include <esp_idf_version.h>

#include <algorithm>
#include <cstring>

#ifdef CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
// From mbedtls' esp_crt_bundle.h, which isn't on the include path for ESPHome components.
// display.py enables the bundle when the URL is wss://.
extern "C" esp_err_t esp_crt_bundle_attach(void *conf);
#endif

namespace esphome {
namespace tile_stream {

static const char *const TAG = "tile_stream";
static constexpr uint8_t WS_OPCODE_CONTINUATION = 0x0;
static constexpr uint8_t WS_OPCODE_BINARY = 0x2;
static constexpr size_t HEADER_LEN = 8;
static constexpr size_t TILE_HEADER_LEN = 12;

static uint16_t read_u16(const uint8_t *p) { return p[0] | (p[1] << 8); }
static uint32_t read_u32(const uint8_t *p) { return p[0] | (p[1] << 8) | (p[2] << 16) | (uint32_t(p[3]) << 24); }

void TileStreamDisplay::setup() {
  esp_lcd_rgb_panel_config_t config{};
  config.clk_src = LCD_CLK_SRC_DEFAULT;
  config.timings.pclk_hz = this->pclk_hz_;
  config.timings.h_res = this->width_;
  config.timings.v_res = this->height_;
  config.timings.hsync_pulse_width = this->hsync_pulse_width_;
  config.timings.hsync_back_porch = this->hsync_back_porch_;
  config.timings.hsync_front_porch = this->hsync_front_porch_;
  config.timings.vsync_pulse_width = this->vsync_pulse_width_;
  config.timings.vsync_back_porch = this->vsync_back_porch_;
  config.timings.vsync_front_porch = this->vsync_front_porch_;
  config.timings.flags.pclk_active_neg = this->pclk_inverted_;
  config.data_width = 16;
  config.num_fbs = 1;
  // Bounce buffers stream the PSRAM framebuffer through internal RAM, which keeps the
  // picture stable while Wi-Fi and the JPEG decoder compete for PSRAM bandwidth.
  config.bounce_buffer_size_px = this->width_ * this->bounce_lines_;
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 3, 0)
  config.dma_burst_size = 64;
#else
  config.psram_trans_align = 64;
#endif
  config.hsync_gpio_num = this->hsync_pin_;
  config.vsync_gpio_num = this->vsync_pin_;
  config.de_gpio_num = this->de_pin_;
  config.pclk_gpio_num = this->pclk_pin_;
  config.disp_gpio_num = -1;  // no DISP/enable line
  for (int i = 0; i < 16; i++)
    config.data_gpio_nums[i] = this->data_pins_[i];
  config.flags.fb_in_psram = 1;

  esp_err_t err = esp_lcd_new_rgb_panel(&config, &this->panel_);
  if (err == ESP_OK)
    err = esp_lcd_panel_reset(this->panel_);
  if (err == ESP_OK)
    err = esp_lcd_panel_init(this->panel_);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "RGB panel init failed: %s", esp_err_to_name(err));
    this->mark_failed();
    return;
  }

  this->jpeg_ = std::make_unique<JPEGDEC>();
  this->updates_ = xQueueCreate(4, sizeof(Update));
}

void TileStreamDisplay::loop() {
  if (this->client_ == nullptr && network::is_connected())
    this->start_stream_();

  if (this->ws_just_connected_.exchange(false)) {
    ESP_LOGI(TAG, "Stream connected");
    this->send_text_("hello");
  }

  Update update;
  while (this->updates_ != nullptr && xQueueReceive(this->updates_, &update, 0) == pdTRUE) {
    this->apply_update_(update);
    heap_caps_free(update.data);
  }
}

void TileStreamDisplay::start_stream_() {
  esp_websocket_client_config_t config{};
  config.uri = this->url_.c_str();
  config.buffer_size = 8192;
  config.task_stack = 6144;
  config.reconnect_timeout_ms = 2000;
  config.network_timeout_ms = 5000;
  config.ping_interval_sec = 10;
#ifdef CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
  if (this->url_.rfind("wss://", 0) == 0)
    config.crt_bundle_attach = esp_crt_bundle_attach;
#endif

  this->client_ = esp_websocket_client_init(&config);
  if (this->client_ == nullptr) {
    ESP_LOGE(TAG, "WebSocket client init failed");
    this->mark_failed();
    return;
  }
  esp_websocket_register_events(this->client_, WEBSOCKET_EVENT_ANY, &TileStreamDisplay::on_ws_event_, this);
  esp_websocket_client_start(this->client_);
}

void TileStreamDisplay::send_text_(const char *text) {
  if (this->client_ == nullptr || !esp_websocket_client_is_connected(this->client_))
    return;
  esp_websocket_client_send_text(this->client_, text, strlen(text), pdMS_TO_TICKS(250));
}

void TileStreamDisplay::touch_down(int x, int y) {
  char msg[24];
  snprintf(msg, sizeof(msg), "d %d %d", x, y);
  this->send_text_(msg);
  this->touching_ = true;
  this->last_touch_x_ = x;
  this->last_touch_y_ = y;
}

void TileStreamDisplay::touch_move(int x, int y) {
  // Skip jitter; the server only needs meaningful movement.
  static constexpr int MIN_MOVE_PX = 4;
  if (!this->touching_ || (abs(x - this->last_touch_x_) < MIN_MOVE_PX && abs(y - this->last_touch_y_) < MIN_MOVE_PX))
    return;
  char msg[24];
  snprintf(msg, sizeof(msg), "m %d %d", x, y);
  this->send_text_(msg);
  this->last_touch_x_ = x;
  this->last_touch_y_ = y;
}

void TileStreamDisplay::touch_up() {
  if (!this->touching_)
    return;
  this->touching_ = false;
  this->send_text_("u");
}

// Runs on the WebSocket task: only reassemble messages and hand them to loop().
void TileStreamDisplay::on_ws_event_(void *arg, esp_event_base_t base, int32_t event_id, void *event_data) {
  auto *self = static_cast<TileStreamDisplay *>(arg);
  switch (event_id) {
    case WEBSOCKET_EVENT_CONNECTED:
      self->ws_connected_ = true;
      self->ws_just_connected_ = true;
      break;
    case WEBSOCKET_EVENT_DISCONNECTED:
    case WEBSOCKET_EVENT_CLOSED:
      self->ws_connected_ = false;
      self->drop_partial_();
      break;
    case WEBSOCKET_EVENT_DATA:
      self->on_ws_data_(static_cast<esp_websocket_event_data_t *>(event_data));
      break;
    default:
      break;
  }
}

void TileStreamDisplay::on_ws_data_(const esp_websocket_event_data_t *event) {
  const bool binary = event->op_code == WS_OPCODE_BINARY ||
                      (event->op_code == WS_OPCODE_CONTINUATION && this->rx_buf_ != nullptr);
  if (!binary || event->payload_len <= 0)
    return;

  // Messages larger than the client buffer arrive in chunks at increasing offsets.
  if (event->payload_offset == 0) {
    this->drop_partial_();
    this->rx_len_ = event->payload_len;
    this->rx_buf_ = static_cast<uint8_t *>(heap_caps_malloc(this->rx_len_, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  }
  if (this->rx_buf_ == nullptr)
    return;
  const size_t end = event->payload_offset + event->data_len;
  if (end > this->rx_len_) {
    this->drop_partial_();
    return;
  }
  memcpy(this->rx_buf_ + event->payload_offset, event->data_ptr, event->data_len);
  if (end < this->rx_len_)
    return;

  Update update{this->rx_buf_, this->rx_len_};
  this->rx_buf_ = nullptr;
  // The server keeps one update in flight, so a full queue means something is badly wrong.
  if (xQueueSend(this->updates_, &update, 0) != pdTRUE)
    heap_caps_free(update.data);
}

void TileStreamDisplay::drop_partial_() {
  if (this->rx_buf_ != nullptr) {
    heap_caps_free(this->rx_buf_);
    this->rx_buf_ = nullptr;
  }
}

void TileStreamDisplay::apply_update_(const Update &update) {
  const uint8_t *data = update.data;
  if (update.len < HEADER_LEN || data[0] != 'T') {
    ESP_LOGW(TAG, "Ignoring malformed update (%u bytes)", (unsigned) update.len);
    return;
  }
  const uint16_t count = read_u16(data + 2);
  const uint32_t version = read_u32(data + 4);
  const uint32_t started = micros();

  size_t offset = HEADER_LEN;
  for (uint16_t i = 0; i < count; i++) {
    if (offset + TILE_HEADER_LEN > update.len)
      break;
    const uint16_t x = read_u16(data + offset);
    const uint16_t y = read_u16(data + offset + 2);
    const uint32_t len = read_u32(data + offset + 8);
    offset += TILE_HEADER_LEN;
    if (offset + len > update.len)
      break;

    if (this->jpeg_->openRAM(const_cast<uint8_t *>(data + offset), len, &TileStreamDisplay::on_jpeg_draw_)) {
      this->jpeg_->setPixelType(RGB565_LITTLE_ENDIAN);
      this->jpeg_->setUserPointer(this);
      if (!this->jpeg_->decode(x, y, 0))
        ESP_LOGW(TAG, "Tile %u decode failed (error %d)", i, this->jpeg_->getLastError());
      this->jpeg_->close();
    } else {
      ESP_LOGW(TAG, "Tile %u open failed (error %d)", i, this->jpeg_->getLastError());
    }
    offset += len;
  }

  ESP_LOGD(TAG, "v%u: %u tile(s), %u bytes, drawn in %ums", (unsigned) version, count, (unsigned) update.len,
           (unsigned) ((micros() - started) / 1000));
  char ack[24];
  snprintf(ack, sizeof(ack), "ack %u", (unsigned) version);
  this->send_text_(ack);
}

int TileStreamDisplay::on_jpeg_draw_(JPEGDRAW *draw) {
  auto *self = static_cast<TileStreamDisplay *>(draw->pUser);
  const int x1 = std::min(draw->x + draw->iWidth, self->width_);
  const int y1 = std::min(draw->y + draw->iHeight, self->height_);
  if (x1 <= draw->x || y1 <= draw->y)
    return 1;
  // RGB panels copy straight into the PSRAM framebuffer; the call is synchronous.
  if (x1 - draw->x == draw->iWidth) {
    esp_lcd_panel_draw_bitmap(self->panel_, draw->x, draw->y, x1, y1, draw->pPixels);
  } else {
    for (int row = 0; row < y1 - draw->y; row++)
      esp_lcd_panel_draw_bitmap(self->panel_, draw->x, draw->y + row, x1, draw->y + row + 1,
                                draw->pPixels + row * draw->iWidth);
  }
  return 1;
}

void TileStreamDisplay::draw_pixel_at(int x, int y, Color color) {
  if (this->panel_ == nullptr || x < 0 || y < 0 || x >= this->width_ || y >= this->height_)
    return;
  const uint16_t pixel = display::ColorUtil::color_to_565(color);
  esp_lcd_panel_draw_bitmap(this->panel_, x, y, x + 1, y + 1, &pixel);
}

void TileStreamDisplay::dump_config() {
  ESP_LOGCONFIG(TAG, "Tile stream display:");
  ESP_LOGCONFIG(TAG, "  Resolution: %dx%d, PCLK %u Hz, bounce buffer %d lines", this->width_, this->height_,
                (unsigned) this->pclk_hz_, this->bounce_lines_);
  // The URL carries the secret, so log only the scheme and host.
  const size_t host_end = this->url_.find('/', this->url_.find("//") + 2);
  ESP_LOGCONFIG(TAG, "  Server: %s", this->url_.substr(0, host_end).c_str());
}

}  // namespace tile_stream
}  // namespace esphome

#endif  // USE_ESP32
