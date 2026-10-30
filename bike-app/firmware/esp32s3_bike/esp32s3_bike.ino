/*
  Bicycle locator ESP32-S3
  BLE commands:
    RING -> I2S speaker plays a three-note chime
    GLOW -> GPIO 7 turns the external 12V lamp on for 8 seconds
    GNSS -> Quectel UART is queried and valid coordinates are notified over BLE

  I2S / MAX98357A:
    DIN   <- GPIO 4
    BCLK  <- GPIO 5
    LRCLK <- GPIO 6

  XY-MOS lamp driver:
    TRIG/PWM <- GPIO 7
    GND      <- ESP32 GND
    The lamp gets its 12V power from a separate 12V supply through
    the XY-MOS VIN+/VIN- and OUT+/OUT- terminals.
*/

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ESP_I2S.h>
#include <math.h>

static const char *DEVICE_NAME = "Bike Locator ESP32";
static const char *SERVICE_UUID = "9f6c1000-7d4a-4f3b-9a5c-2d8e6f1a0001";
static const char *COMMAND_UUID = "9f6c1001-7d4a-4f3b-9a5c-2d8e6f1a0001";
static const char *POSITION_UUID = "9f6c1002-7d4a-4f3b-9a5c-2d8e6f1a0001";

static constexpr int PIN_I2S_DIN = 4;
static constexpr int PIN_I2S_BCLK = 5;
static constexpr int PIN_I2S_LRCLK = 6;
static constexpr int LAMP_PIN = 7;
static constexpr int GNSS_RX_PIN = 18;  // ESP RX <- GNSS board TX
static constexpr int GNSS_TX_PIN = 17;  // ESP TX -> GNSS board RX
static constexpr uint32_t GNSS_POLL_MS = 3000;

static constexpr uint32_t SAMPLE_RATE = 16000;
static constexpr size_t FRAMES_PER_BLOCK = 256;
static constexpr uint32_t LAMP_ON_MS = 8000;

I2SClass I2S;
HardwareSerial GnssSerial(1);
BLECharacteristic *commandCharacteristic = nullptr;
BLECharacteristic *positionCharacteristic = nullptr;

volatile uint8_t pendingRings = 0;
volatile uint32_t lampOffAt = 0;
volatile bool lampIsOn = false;

bool i2sReady = false;
uint32_t lastGnssPollAt = 0;
String gnssLine;

portMUX_TYPE ringMux = portMUX_INITIALIZER_UNLOCKED;
portMUX_TYPE lampMux = portMUX_INITIALIZER_UNLOCKED;

class ServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer *server) override {
    BLEDevice::startAdvertising();
    Serial.println("BLE disconnected; advertising again");
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String value = characteristic->getValue();
    value.trim();

    if (value == "RING") {
      portENTER_CRITICAL(&ringMux);
      if (pendingRings < 3) {
        ++pendingRings;
      }
      portEXIT_CRITICAL(&ringMux);

      Serial.println("BLE command: RING");
    } else if (value == "GLOW") {
      portENTER_CRITICAL(&lampMux);
      lampOffAt = millis() + LAMP_ON_MS;
      lampIsOn = true;
      portEXIT_CRITICAL(&lampMux);

      digitalWrite(LAMP_PIN, HIGH);
      Serial.println("BLE command: GLOW; lamp on for 8 seconds");
    } else {
      Serial.print("BLE command ignored: ");
      Serial.println(value);
    }
  }
};

void writeSilence(uint16_t milliseconds) {
  static int16_t silence[FRAMES_PER_BLOCK * 2] = {};

  uint32_t remainingFrames = SAMPLE_RATE * milliseconds / 1000;

  while (remainingFrames > 0) {
    size_t frames = min((uint32_t)FRAMES_PER_BLOCK, remainingFrames);
    I2S.write(
      (uint8_t *)silence,
      frames * 2 * sizeof(int16_t)
    );
    remainingFrames -= frames;
  }
}

void playTone(uint16_t frequency, uint16_t milliseconds) {
  int16_t samples[FRAMES_PER_BLOCK * 2];

  uint32_t totalFrames = SAMPLE_RATE * milliseconds / 1000;
  uint32_t writtenFrames = 0;
  double phase = 0.0;
  const double phaseStep = 2.0 * PI * frequency / SAMPLE_RATE;

  while (writtenFrames < totalFrames) {
    size_t frames = min(
      (uint32_t)FRAMES_PER_BLOCK,
      totalFrames - writtenFrames
    );

    for (size_t i = 0; i < frames; ++i) {
      uint32_t frame = writtenFrames + i;
      uint32_t edge = min(frame, totalFrames - frame - 1);
      float envelope = edge < 240 ? edge / 240.0f : 1.0f;

      int16_t sample = (int16_t)(
        sinf((float)phase) * 5200.0f * envelope
      );

      samples[i * 2] = sample;
      samples[i * 2 + 1] = sample;

      phase += phaseStep;
      if (phase >= 2.0 * PI) {
        phase -= 2.0 * PI;
      }
    }

    I2S.write(
      (uint8_t *)samples,
      frames * 2 * sizeof(int16_t)
    );

    writtenFrames += frames;
  }
}

void playBell() {
  if (!i2sReady) {
    return;
  }

  playTone(1047, 170);
  writeSilence(45);
  playTone(1319, 170);
  writeSilence(45);
  playTone(1568, 260);
  writeSilence(20);
}

void serviceLamp() {
  bool shouldTurnOff = false;

  portENTER_CRITICAL(&lampMux);

  if (lampIsOn && (int32_t)(millis() - lampOffAt) >= 0) {
    lampIsOn = false;
    shouldTurnOff = true;
  }

  portEXIT_CRITICAL(&lampMux);

  if (shouldTurnOff) {
    digitalWrite(LAMP_PIN, LOW);
    Serial.println("Lamp OFF");
  }
}

void notifyGnssPosition(const String &line) {
  const int marker = line.indexOf("+QGPSLOC:");
  if (marker < 0 || positionCharacteristic == nullptr) return;

  String fields = line.substring(marker + 9);
  const int comma1 = fields.indexOf(',');
  const int comma2 = comma1 < 0 ? -1 : fields.indexOf(',', comma1 + 1);
  const int comma3 = comma2 < 0 ? -1 : fields.indexOf(',', comma2 + 1);
  const int comma4 = comma3 < 0 ? -1 : fields.indexOf(',', comma3 + 1);
  if (comma1 < 0 || comma2 < 0 || comma3 < 0) return;

  const double latitude = fields.substring(comma1 + 1, comma2).toDouble();
  const double longitude = fields.substring(comma2 + 1, comma3).toDouble();
  const double hdop = comma4 < 0
    ? fields.substring(comma3 + 1).toDouble()
    : fields.substring(comma3 + 1, comma4).toDouble();

  if (!isfinite(latitude) || !isfinite(longitude) ||
      fabs(latitude) > 90.0 || fabs(longitude) > 180.0 ||
      (latitude == 0.0 && longitude == 0.0)) return;

  const int32_t latE6 = (int32_t)lround(latitude * 1000000.0);
  const int32_t lngE6 = (int32_t)lround(longitude * 1000000.0);
  const uint16_t hdopTenths = isfinite(hdop) && hdop >= 0.0 && hdop < 6553.5
    ? (uint16_t)lround(hdop * 10.0)
    : 0xFFFF;
  const uint32_t latBits = (uint32_t)latE6;
  const uint32_t lngBits = (uint32_t)lngE6;
  uint8_t payload[10] = {
    (uint8_t)(latBits), (uint8_t)(latBits >> 8), (uint8_t)(latBits >> 16), (uint8_t)(latBits >> 24),
    (uint8_t)(lngBits), (uint8_t)(lngBits >> 8), (uint8_t)(lngBits >> 16), (uint8_t)(lngBits >> 24),
    (uint8_t)(hdopTenths), (uint8_t)(hdopTenths >> 8)
  };

  positionCharacteristic->setValue(payload, sizeof(payload));
  positionCharacteristic->notify();
  Serial.printf("GNSS fix: %.6f, %.6f, HDOP %.1f\n", latitude, longitude,
                hdopTenths == 0xFFFF ? -1.0 : hdopTenths / 10.0);
}

void serviceGnss() {
  while (GnssSerial.available()) {
    const char ch = (char)GnssSerial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      if (gnssLine.length()) notifyGnssPosition(gnssLine);
      gnssLine = "";
    } else if (gnssLine.length() < 220) {
      gnssLine += ch;
    } else {
      gnssLine = "";
    }
  }

  const uint32_t now = millis();
  if ((uint32_t)(now - lastGnssPollAt) >= GNSS_POLL_MS) {
    lastGnssPollAt = now;
    GnssSerial.print("AT+QGPSLOC=2\r\n");
  }
}

void setup() {
  Serial.begin(115200);
  delay(250);

  // Lamp stays off after power-up or reset.
  pinMode(LAMP_PIN, OUTPUT);
  digitalWrite(LAMP_PIN, LOW);

  I2S.setPins(PIN_I2S_BCLK, PIN_I2S_LRCLK, PIN_I2S_DIN);
  i2sReady = I2S.begin(
    I2S_MODE_STD,
    SAMPLE_RATE,
    I2S_DATA_BIT_WIDTH_16BIT,
    I2S_SLOT_MODE_STEREO
  );

  Serial.println(
    i2sReady ? "I2S audio ready" : "ERROR: I2S initialization failed"
  );

  GnssSerial.begin(115200, SERIAL_8N1, GNSS_RX_PIN, GNSS_TX_PIN);
  delay(500);
  GnssSerial.print("AT\r\n");
  delay(200);
  GnssSerial.print("AT+QGPS=1\r\n");
  lastGnssPollAt = millis();
  Serial.printf("GNSS UART ready: RX=%d TX=%d; polling every %lu ms\n",
                GNSS_RX_PIN, GNSS_TX_PIN, (unsigned long)GNSS_POLL_MS);

  BLEDevice::init(DEVICE_NAME);

  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);

  commandCharacteristic = service->createCharacteristic(
    COMMAND_UUID,
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_WRITE_NR
  );

  commandCharacteristic->setCallbacks(new CommandCallbacks());
  positionCharacteristic = service->createCharacteristic(
    POSITION_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  positionCharacteristic->addDescriptor(new BLE2902());
  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("BLE ready: RING/GLOW commands and GNSS position notifications");
}

void loop() {
  serviceGnss();
  serviceLamp();

  bool play = false;

  portENTER_CRITICAL(&ringMux);
  if (pendingRings > 0) {
    --pendingRings;
    play = true;
  }
  portEXIT_CRITICAL(&ringMux);

  if (play) {
    playBell();
  }

  serviceLamp();
  delay(5);
}
