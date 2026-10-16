/* sim-device.js — 模拟"寻找并连接设备"：返回可发现的模拟追踪器设备。UMD，可在 Node 测试。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.SimDevice = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 模拟扫描出的附近设备（未来接入真实蓝牙后替换为真实扫描结果）
  function listDevices(rng) {
    var r = (rng && typeof rng === 'function') ? rng() : Math.random();
    var pool = [
      { id: 'dev_a', name: '车把追踪器 A', rssi: -45 },
      { id: 'dev_b', name: '坐垫追踪器 B', rssi: -58 },
      { id: 'dev_c', name: '后轮追踪器 C', rssi: -63 }
    ];
    if (r < 0.2) return pool.slice(0, 1);
    if (r < 0.5) return pool.slice(0, 2);
    return pool;
  }

  return { listDevices: listDevices };
});
