import esphome.codegen as cg
import esphome.config_validation as cv
from esphome import automation, pins
from esphome.components import display
from esphome.components.esp32 import add_idf_component, add_idf_sdkconfig_option
from esphome.const import CONF_HEIGHT, CONF_ID, CONF_TRIGGER_ID, CONF_URL, CONF_WIDTH

DEPENDENCIES = ["esp32", "psram"]
AUTO_LOAD = ["network"]

tile_stream_ns = cg.esphome_ns.namespace("tile_stream")
TileStreamDisplay = tile_stream_ns.class_("TileStreamDisplay", display.Display)
SoundTrigger = tile_stream_ns.class_("SoundTrigger", automation.Trigger.template(cg.std_string))
VolumeTrigger = tile_stream_ns.class_("VolumeTrigger", automation.Trigger.template(cg.float_))

CONF_PCLK_FREQUENCY = "pclk_frequency"
CONF_PCLK_INVERTED = "pclk_inverted"
CONF_BOUNCE_BUFFER_LINES = "bounce_buffer_lines"
CONF_DE_PIN = "de_pin"
CONF_HSYNC_PIN = "hsync_pin"
CONF_VSYNC_PIN = "vsync_pin"
CONF_PCLK_PIN = "pclk_pin"
CONF_DATA_PINS = "data_pins"
CONF_ON_SOUND = "on_sound"
CONF_ON_VOLUME = "on_volume"
TIMINGS = {
    # Defaults are Elecrow's published timings for the CrowPanel 7.0" (800x480).
    "hsync_pulse_width": 48,
    "hsync_back_porch": 40,
    "hsync_front_porch": 40,
    "vsync_pulse_width": 31,
    "vsync_back_porch": 13,
    "vsync_front_porch": 1,
}
# B0..B4, G0..G5, R0..R4 for the CrowPanel 7.0".
DEFAULT_DATA_PINS = [15, 7, 6, 5, 4, 9, 46, 3, 8, 16, 1, 14, 21, 47, 48, 45]

PIN = pins.internal_gpio_output_pin_number


def _validate_url(value):
    value = cv.string(value)
    if not value.startswith(("ws://", "wss://")):
        raise cv.Invalid("url must start with ws:// or wss://")
    return value


def _validate_bounce(config):
    lines = config[CONF_BOUNCE_BUFFER_LINES]
    if lines and config[CONF_HEIGHT] % lines:
        raise cv.Invalid(f"{CONF_BOUNCE_BUFFER_LINES} must divide the height ({config[CONF_HEIGHT]})")
    return config


CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(TileStreamDisplay),
            cv.Required(CONF_URL): _validate_url,
            cv.Optional(CONF_WIDTH, default=800): cv.int_range(min=1, max=2048),
            cv.Optional(CONF_HEIGHT, default=480): cv.int_range(min=1, max=2048),
            cv.Optional(CONF_PCLK_FREQUENCY, default="15MHz"): cv.All(
                cv.frequency, cv.float_range(min=1e6, max=40e6)
            ),
            cv.Optional(CONF_PCLK_INVERTED, default=True): cv.boolean,
            cv.Optional(CONF_BOUNCE_BUFFER_LINES, default=10): cv.int_range(min=0, max=64),
            cv.Optional(CONF_DE_PIN, default=41): PIN,
            cv.Optional(CONF_HSYNC_PIN, default=39): PIN,
            cv.Optional(CONF_VSYNC_PIN, default=40): PIN,
            cv.Optional(CONF_PCLK_PIN, default=0): PIN,
            cv.Optional(CONF_DATA_PINS, default=DEFAULT_DATA_PINS): cv.All(
                [PIN], cv.Length(min=16, max=16)
            ),
            # Runs with `sound` (e.g. "click") and `volume` (0..1) when the page asks.
            cv.Optional(CONF_ON_SOUND): automation.validate_automation(
                {cv.GenerateID(CONF_TRIGGER_ID): cv.declare_id(SoundTrigger)}
            ),
            # Runs with `volume` (0..1) when the page sets the panel's master volume.
            cv.Optional(CONF_ON_VOLUME): automation.validate_automation(
                {cv.GenerateID(CONF_TRIGGER_ID): cv.declare_id(VolumeTrigger)}
            ),
            **{
                cv.Optional(name, default=default): cv.int_range(min=0, max=255)
                for name, default in TIMINGS.items()
            },
        }
    ).extend(cv.polling_component_schema("never")),
    _validate_bounce,
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await display.register_display(var, config)

    cg.add(var.set_url(config[CONF_URL]))
    cg.add(var.set_dimensions(config[CONF_WIDTH], config[CONF_HEIGHT]))
    cg.add(var.set_pclk(int(config[CONF_PCLK_FREQUENCY]), config[CONF_PCLK_INVERTED]))
    cg.add(var.set_bounce_buffer_lines(config[CONF_BOUNCE_BUFFER_LINES]))
    cg.add(
        var.set_sync_pins(
            config[CONF_DE_PIN], config[CONF_HSYNC_PIN], config[CONF_VSYNC_PIN], config[CONF_PCLK_PIN]
        )
    )
    for i, pin in enumerate(config[CONF_DATA_PINS]):
        cg.add(var.set_data_pin(i, pin))
    cg.add(var.set_timings(*(config[name] for name in TIMINGS)))
    for conf in config.get(CONF_ON_VOLUME, []):
        trigger = cg.new_Pvariable(conf[CONF_TRIGGER_ID], var)
        await automation.build_automation(trigger, [(cg.float_, "volume")], conf)
    for conf in config.get(CONF_ON_SOUND, []):
        trigger = cg.new_Pvariable(conf[CONF_TRIGGER_ID], var)
        await automation.build_automation(
            trigger, [(cg.std_string, "sound"), (cg.float_, "volume")], conf
        )

    # Same JPEG decoder (and its S3 SIMD dependency) that ESPHome's runtime images use.
    cg.add_library("JPEGDEC", "1.8.4", "https://github.com/bitbank2/JPEGDEC#1.8.4")
    add_idf_component(name="espressif/esp-dsp", ref="1.8.2")
    add_idf_component(name="espressif/esp_websocket_client", ref="1.5.0")
    if config[CONF_URL].startswith("wss://"):
        add_idf_sdkconfig_option("CONFIG_MBEDTLS_CERTIFICATE_BUNDLE", True)
        add_idf_sdkconfig_option("CONFIG_MBEDTLS_CERTIFICATE_BUNDLE_DEFAULT_FULL", True)
    # The stream is bursty (whole updates at once): a bigger TCP window and more
    # Wi-Fi RX buffers / aggregation let a 20-40KB update arrive without stalling
    # on ACK round trips. Buffers go to PSRAM where possible.
    add_idf_sdkconfig_option("CONFIG_LWIP_TCP_WND_DEFAULT", 32768)
    add_idf_sdkconfig_option("CONFIG_LWIP_TCP_RECVMBOX_SIZE", 32)
    add_idf_sdkconfig_option("CONFIG_ESP_WIFI_STATIC_RX_BUFFER_NUM", 16)
    add_idf_sdkconfig_option("CONFIG_ESP_WIFI_DYNAMIC_RX_BUFFER_NUM", 64)
    add_idf_sdkconfig_option("CONFIG_ESP_WIFI_RX_BA_WIN", 16)
    add_idf_sdkconfig_option("CONFIG_SPIRAM_TRY_ALLOCATE_WIFI_LWIP", True)
    # Restart RGB DMA on vsync so a PSRAM bandwidth hiccup can't leave the image shifted.
    add_idf_sdkconfig_option("CONFIG_LCD_RGB_RESTART_IN_VSYNC", True)
