# ESP32-S3 bicycle locator prototype

This firmware handles the App's **响铃 / Ring** and **发光 / Flash** actions, reads GNSS data from a Quectel module over UART, and sends valid coordinates to the App over BLE notifications. Ring plays a three-note chime through the MAX98357A I2S amplifier and speaker; Glow drives GPIO 7 high for eight seconds, then switches it off.

## Wiring

| MAX98357A | ESP32-S3 |
|---|---|
| DIN | GPIO 4 |
| BCLK | GPIO 5 |
| LRCLK / LRC | GPIO 6 |
| GND | GND |

For the Quectel GNSS development board, use its labeled UART pins (not the board's USB connector):

| Quectel GNSS board | ESP32-S3 |
|---|---|
| TX | GPIO 18 (ESP32 UART RX) |
| RX | GPIO 17 (ESP32 UART TX) |
| GND | GND |

The sketch expects the GNSS UART at **115200 baud** and uses Quectel `AT+QGPS=1` / `AT+QGPSLOC=2`. Confirm the exact breakout board's UART voltage level and pin labels before wiring; connect grounds together. Do not connect either board's 5 V pin to an ESP32 GPIO. The GNSS module's USB port is not used as the App's location link.

For the external lamp, connect the XY-MOS control input `TRIG/PWM` to ESP32-S3 GPIO 7 and the control `GND` to ESP32-S3 GND. The lamp's 12 V supply goes through the XY-MOS power terminals, not through ESP32 GPIO or the USB power rail. Verify that the XY-MOS trigger accepts a 3.3 V signal before connecting GPIO 7. See [GLOW-CONTROL.md](GLOW-CONTROL.md).

Connect the speaker to the amplifier board's speaker output terminals. Power the amplifier board from a supply supported by the exact breakout board, and connect its ground to ESP32 ground. Do not connect the speaker directly to ESP32 pins. Disconnect USB before changing wiring.

## Upload from Arduino IDE

1. Install/select Espressif's **Arduino-ESP32 3.x** board package. The sketch uses the official `ESP_I2S.h` API included with this core.
2. Open `esp32s3_bike.ino`.
3. Select **ESP32S3 Dev Module** and the ESP32-S3's USB serial port. The COM number can change; unplug/reconnect the ESP32 to identify its port. GNSS data is read by the ESP32 UART, not by the computer's serial port.
4. Upload. If upload stalls, hold **BOOT**, tap **RST**, release **BOOT**, then retry.
5. Open Serial Monitor at **115200 baud**. Expect I2S, GNSS UART, and BLE startup messages. Later, a valid fix prints `GNSS fix: latitude, longitude, HDOP`.

## Connect from the App

1. Leave the ESP32 powered by USB and advertising.
2. Run the App in a Web Bluetooth capable browser on a secure context. On the same computer, `http://localhost:8080` is suitable; open the App and choose **找车 → 寻找并连接设备**.
3. Select **Bike Locator ESP32**, then press **连接设备** in the App.
4. Press **响铃**. The speaker should play three ascending tones. Press **发光** to switch on the external lamp for eight seconds. The Serial Monitor should show `BLE command: RING` or `BLE command: GLOW; lamp on for 8 seconds`. Once GNSS has a fix, the map receives the ESP32's position automatically; the first fix recenters the map.

The App and sketch share the custom BLE service, command, and position UUIDs in `js/services/bluetooth.js` and `esp32s3_bike.ino`. Both must use the same UUIDs. The App's **发光** action sends `GLOW`; the position characteristic sends latitude, longitude, and HDOP in a compact binary notification.

## Current limits

- The ESP32 USB serial connection is only for firmware upload and debug logs. GNSS position reaches the App over BLE; the GNSS module's own USB serial port is not part of this path.
- The lamp output is a logic control only. Use a suitable external supply and driver for the lamp; never connect a 12 V lamp supply to the ESP32 GPIO or power the lamp from the ESP32 board.
- Do not power the speaker from GPIO. Confirm the amplifier board's supply voltage and current requirements from its own markings/specification before connecting its power.
- Browsers must support Web Bluetooth. The system device picker should show the ESP32 only while this firmware is running and advertising.
