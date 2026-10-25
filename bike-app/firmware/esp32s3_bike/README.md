# ESP32-S3 bicycle locator prototype

This firmware handles the App's **响铃 / Ring** and **发光 / Flash** actions. Ring plays a three-note chime through the MAX98357A I2S amplifier and speaker; Glow drives GPIO 7 high for eight seconds, then switches it off.

## Wiring

| MAX98357A | ESP32-S3 |
|---|---|
| DIN | GPIO 4 |
| BCLK | GPIO 5 |
| LRCLK / LRC | GPIO 6 |
| GND | GND |

For the external lamp, connect the XY-MOS control input `TRIG/PWM` to ESP32-S3 GPIO 7 and the control `GND` to ESP32-S3 GND. The lamp's 12 V supply goes through the XY-MOS power terminals, not through ESP32 GPIO or the USB power rail. Verify that the XY-MOS trigger accepts a 3.3 V signal before connecting GPIO 7. See [GLOW-CONTROL.md](GLOW-CONTROL.md).

Connect the speaker to the amplifier board's speaker output terminals. Power the amplifier board from a supply supported by the exact breakout board, and connect its ground to ESP32 ground. Do not connect the speaker directly to ESP32 pins. Disconnect USB before changing wiring.

## Upload from Arduino IDE

1. Install/select Espressif's **Arduino-ESP32 3.x** board package. The sketch uses the official `ESP_I2S.h` API included with this core.
2. Open `esp32s3_bike.ino`.
3. Select **ESP32S3 Dev Module** and the ESP32-S3's USB serial port. The COM number can change; unplug/reconnect the ESP32 to identify its port. Do not select the Quectel GNSS module's port. Close Arduino Serial Monitor and disconnect the App's **电脑GNSS** serial connection before uploading.
4. Upload. If upload stalls, hold **BOOT**, tap **RST**, release **BOOT**, then retry.
5. Open Serial Monitor at **115200 baud**. Expect `I2S audio ready` and `BLE ready: waiting for RING or GLOW`.

## Connect from the App

1. Leave the ESP32 powered by USB and advertising.
2. Run the App in a Web Bluetooth capable browser on a secure context. On the same computer, `http://localhost:8080` is suitable; open the App and choose **找车 → 寻找并连接设备**.
3. Select **Bike Locator ESP32**, then press **连接设备** in the App.
4. Press **响铃**. The speaker should play three ascending tones. Press **发光** to switch on the external lamp for eight seconds. The Serial Monitor should show `BLE command: RING` or `BLE command: GLOW; lamp on for 8 seconds`.

The App and sketch share the custom BLE service and command UUIDs in `js/services/bluetooth.js` and `esp32s3_bike.ino`. Both must use the same UUIDs. The App's **发光** action sends `GLOW`.

## Current limits

- The App can read GNSS coordinates from a Quectel USB serial port on a computer through Web Serial. This is a desktop test path; it does not make the ESP32 forward GPS or use cellular service.
- The lamp output is a logic control only. Use a suitable external supply and driver for the lamp; never connect a 12 V lamp supply to the ESP32 GPIO or power the lamp from the ESP32 board.
- Do not power the speaker from GPIO. Confirm the amplifier board's supply voltage and current requirements from its own markings/specification before connecting its power.
- Browsers must support Web Bluetooth. The system device picker should show the ESP32 only while this firmware is running and advertising.
