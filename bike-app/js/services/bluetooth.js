/* Web Bluetooth transport for the Bike Locator ESP32 firmware. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.BleDevice = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Keep these UUIDs identical to firmware/esp32s3_bike/esp32s3_bike.ino.
  var SERVICE_UUID = '9f6c1000-7d4a-4f3b-9a5c-2d8e6f1a0001';
  var COMMAND_UUID = '9f6c1001-7d4a-4f3b-9a5c-2d8e6f1a0001';
  var POSITION_UUID = '9f6c1002-7d4a-4f3b-9a5c-2d8e6f1a0001';
  var connected = null;
  var commandCharacteristic = null;
  var positionCharacteristic = null;
  var positionHandler = null;
  var disconnectHandler = null;

  function isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function';
  }

  function deviceName(device) {
    if (device && device.name) return device.name;
    if (device && device.id) return '蓝牙设备 ' + device.id.slice(0, 4);
    return '未知蓝牙设备';
  }

  function scanForDevice() {
    return navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    }).then(function (device) {
      return { name: deviceName(device), device: device || null };
    });
  }

  function clearConnection(notify) {
    var onDisconnect = disconnectHandler;
    connected = null;
    commandCharacteristic = null;
    positionCharacteristic = null;
    positionHandler = null;
    disconnectHandler = null;
    if (notify && onDisconnect) onDisconnect();
  }

  function connect(device, handlers) {
    if (!device || !device.gatt) return Promise.reject(new Error('所选设备不支持蓝牙 GATT'));
    handlers = handlers || {};
    return device.gatt.connect().then(function (server) {
      return server.getPrimaryService(SERVICE_UUID);
    }).then(function (service) {
      return Promise.all([
        service.getCharacteristic(COMMAND_UUID),
        service.getCharacteristic(POSITION_UUID)
      ]);
    }).then(function (characteristics) {
      connected = device;
      commandCharacteristic = characteristics[0];
      positionCharacteristic = characteristics[1];
      positionHandler = typeof handlers.onPosition === 'function' ? handlers.onPosition : null;
      disconnectHandler = typeof handlers.onDisconnect === 'function' ? handlers.onDisconnect : null;
      positionCharacteristic.addEventListener('characteristicvaluechanged', function (event) {
        var value = event.target && event.target.value;
        if (!value || value.byteLength < 10 || !positionHandler) return;
        var lat = value.getInt32(0, true) / 1000000;
        var lng = value.getInt32(4, true) / 1000000;
        var hdopRaw = value.getUint16(8, true);
        if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (!lat && !lng)) return;
        positionHandler({ lat: lat, lng: lng, hdop: hdopRaw === 65535 ? null : hdopRaw / 10, receivedAt: Date.now() });
      });
      if (device.addEventListener) device.addEventListener('gattserverdisconnected', function () { clearConnection(true); });
      return positionCharacteristic.startNotifications().then(function () { return device; });
    }).catch(function (error) {
      if (device.gatt.connected) device.gatt.disconnect();
      clearConnection();
      throw error;
    });
  }

  // Test/backward-compatible helper: callers can inject a device and its command characteristic.
  function attach(device, characteristic) {
    connected = device || null;
    commandCharacteristic = characteristic || null;
    positionCharacteristic = null;
    positionHandler = null;
    disconnectHandler = null;
    return connected;
  }
  function current() { return connected; }
  function isConnected() { return !!(connected && connected.gatt && connected.gatt.connected && commandCharacteristic); }
  function disconnect() {
    var device = connected;
    clearConnection();
    if (device && device.gatt && device.gatt.connected && typeof device.gatt.disconnect === 'function') {
      device.gatt.disconnect();
    }
    return true;
  }

  function sendCommand(kind) {
    if (!connected || !connected.gatt || !connected.gatt.connected) return { ok: false, reason: 'not-connected' };
    if (!commandCharacteristic) return { ok: false, reason: 'unsupported' };
    var payload = kind === 'ring' ? 'RING' : 'GLOW';
    var bytes = new TextEncoder().encode(payload);
    var write = commandCharacteristic.writeValueWithResponse
      ? commandCharacteristic.writeValueWithResponse(bytes)
      : commandCharacteristic.writeValue(bytes);
    return write.then(function () { return { ok: true }; }).catch(function (error) {
      return { ok: false, reason: 'write-failed', error: error };
    });
  }

  return {
    SERVICE_UUID: SERVICE_UUID,
    COMMAND_UUID: COMMAND_UUID,
    POSITION_UUID: POSITION_UUID,
    isSupported: isSupported,
    scanForDevice: scanForDevice,
    deviceName: deviceName,
    connect: connect,
    attach: attach,
    current: current,
    isConnected: isConnected,
    disconnect: disconnect,
    // Firmware handles GLOW on the lamp-control GPIO and switches the lamp off after its timeout.
    sendGlow: function () { return sendCommand('glow'); },
    sendRing: function () { return sendCommand('ring'); }
  };
});
