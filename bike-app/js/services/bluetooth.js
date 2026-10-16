/* bluetooth.js — 真实蓝牙设备查找、连接流程与指令接口（Web Bluetooth：navigator.bluetooth.requestDevice）。
 * 能力分层：
 *  - 查找：scanForDevice() 调系统蓝牙选择器，返回 {name, device}
 *  - 连接流程：attach()/current()/isConnected()/disconnect() 管理当前连接设备
 *  - 指令接口：sendGlow()/sendRing() 向设备下发发光/响铃指令。
 *    真实硬件需通过 GATT 特征写入指令（需设备协议文档，见 sendCommand 内 TODO）；
 *    当前无硬件协议时统一返回 {ok:false, reason:'unsupported'}，由页面回退模拟反馈。
 *  - 不支持 Web Bluetooth 时页面回退模拟设备扫描。
 * UMD，可在 Node 用 mock 测试。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.BleDevice = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var connected = null; // 当前已连接的真实设备（device 对象）

  // 当前浏览器是否支持 Web Bluetooth（真实设备查找）
  function isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function';
  }

  // 由设备对象派生可展示的设备名（优先 name，其次 id，缺省未知）
  function deviceName(device) {
    if (device && device.name) return device.name;
    if (device && device.id) return '蓝牙设备 ' + device.id.slice(0, 4);
    return '未知蓝牙设备';
  }

  // 调用系统蓝牙选择器，让用户选择附近真实设备；返回 {name, device}
  function scanForDevice() {
    return navigator.bluetooth.requestDevice({ acceptAllDevices: true }).then(function (device) {
      return { name: deviceName(device), device: device || null };
    });
  }

  // ---- 连接流程 ----
  function attach(device) { connected = device || null; return connected; }
  function current() { return connected; }
  function isConnected() { return !!connected; }
  function disconnect() { connected = null; return true; }

  // ---- 指令接口：发光 / 响铃 ----
  // 同步返回 {ok, reason}：
  //  - not-connected：尚未连接真实设备
  //  - unsupported：已连接但当前无该设备 GATT 协议实现（页面回退模拟反馈）
  //  - ok:true：已成功下发（接入真实硬件并实现 sendCommand 后）
  function sendCommand(kind) {
    if (!connected) return { ok: false, reason: 'not-connected' };
    // TODO(真实硬件): 依据设备 GATT 服务/特征文档，向对应特征写入发光/响铃指令。
    // 示例：device.gatt.connect().then(svc => svc.getCharacteristic(CMD_UUID).then(ch => ch.writeValue(...)))
    return { ok: false, reason: 'unsupported' };
  }
  function sendGlow() { return sendCommand('glow'); }
  function sendRing() { return sendCommand('ring'); }

  return {
    isSupported: isSupported, scanForDevice: scanForDevice, deviceName: deviceName,
    attach: attach, current: current, isConnected: isConnected, disconnect: disconnect,
    sendGlow: sendGlow, sendRing: sendRing
  };
});
