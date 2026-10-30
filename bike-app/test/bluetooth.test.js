/* 问题1 — 真实蓝牙设备查找、连接流程与指令接口 测试（同步 harness 兼容） */
'use strict';
const { test, eq, ok } = require('./harness');
const BleDevice = require('../js/services/bluetooth');

function setNavigator(nav) {
  try { Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav }); return true; }
  catch (e) { return false; }
}

test('浏览器不支持 Web Bluetooth 时 isSupported 为 false', () => {
  eq(BleDevice.isSupported(), false);
});

test('deviceName：优先设备 name，其次 id，缺省未知', () => {
  eq(BleDevice.deviceName({ name: '我的追踪器', id: 'x' }), '我的追踪器');
  ok(BleDevice.deviceName({ id: 'abcd1234' }).indexOf('abcd') >= 0);
  eq(BleDevice.deviceName(null), '未知蓝牙设备');
});

test('scanForDevice 调用 requestDevice（按自定义服务过滤）', () => {
  let called = null;
  if (!setNavigator({ bluetooth: { requestDevice: function (opts) { called = opts; return Promise.resolve({ name: '车' }); } } })) return;
  BleDevice.scanForDevice();
  eq(!!called, true);
  ok(called.filters && called.filters[0].services.indexOf(BleDevice.SERVICE_UUID) >= 0, '应按自定义服务过滤');
});

test('连接流程：attach 后 isConnected，disconnect 后断开', () => {
  eq(BleDevice.isConnected(), false);
  const dev = { name: '车把追踪器', gatt: { connected: true } };
  const characteristic = { writeValue: function () { return Promise.resolve(); } };
  BleDevice.attach(dev, characteristic);
  eq(BleDevice.isConnected(), true);
  eq(BleDevice.current(), dev);
  BleDevice.disconnect();
  eq(BleDevice.isConnected(), false);
  eq(BleDevice.current(), null);
});

test('已连接时 sendGlow 返回 Promise（真实 GATT 异步写入）', () => {
  const dev = { name: '车把追踪器', gatt: { connected: true } };
  BleDevice.attach(dev, { writeValue: function () { return Promise.resolve(); } });
  const p = BleDevice.sendGlow();
  ok(p && typeof p.then === 'function', '应返回 Promise');
  BleDevice.disconnect();
});

test('指令接口：未连接时 sendGlow/sendRing 返回 not-connected', () => {
  BleDevice.disconnect();
  const g = BleDevice.sendGlow();
  eq(g.ok, false); eq(g.reason, 'not-connected');
  const r = BleDevice.sendRing();
  eq(r.ok, false); eq(r.reason, 'not-connected');
});

test('指令接口：已连接但无硬件协议时返回 unsupported（由页面回退模拟）', () => {
  BleDevice.attach({ name: '车把追踪器', gatt: { connected: true } });
  const g = BleDevice.sendGlow();
  eq(g.ok, false); eq(g.reason, 'unsupported');
  const r = BleDevice.sendRing();
  eq(r.ok, false); eq(r.reason, 'unsupported');
  BleDevice.disconnect();
});
