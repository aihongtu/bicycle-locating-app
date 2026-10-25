/* Web Bluetooth transport for the Bike Locator ESP32 firmware. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.BleDevice = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Keep these UUIDs identical to firmware/esp32s3_bike/esp32s3_bike.ino.
  var SERVICE_UUID = '9f6c1000-7d4a-4f3b-9a5c-2d8e6f1a0001';
  var COMMAND_UUID = '9f6c1001-7d4a-4f3b-9a5c-2d8e6f1a0001';
  var connected = null;
  var commandCharacteristic = null;

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

  function clearConnection() {
    connected = null;
    commandCharacteristic = null;
  }

  function connect(device) {
    if (!device || !device.gatt) return Promise.reject(new Error('所选设备不支持蓝牙 GATT'));
    return device.gatt.connect().then(function (server) {
      return server.getPrimaryService(SERVICE_UUID);
    }).then(function (service) {
      return service.getCharacteristic(COMMAND_UUID);
    }).then(function (characteristic) {
      connected = device;
      commandCharacteristic = characteristic;
      if (device.addEventListener) device.addEventListener('gattserverdisconnected', clearConnection);
      return device;
    }).catch(function (error) {
      if (device.gatt.connected) device.gatt.disconnect();
      clearConnection();
      throw error;
    });
  }

  // Backward-compatible helper for callers that only need to clear local state.
  function attach(device) { connected = device || null; return connected; }
  function current() { return connected; }
  function isConnected() { return !!(connected && connected.gatt && connected.gatt.connected && commandCharacteristic); }
  function disconnect() {
    var device = connected;
    clearConnection();
    if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
    return true;
  }

  function sendCommand(kind) {
    if (!isConnected()) return Promise.resolve({ ok: false, reason: 'not-connected' });
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
