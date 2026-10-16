/* sim-bike.js — 虚拟自行车：由路线与配速生成骑行采样点。UMD，可在 Node 测试。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.SimBike = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // route: [{x,y}...]; speeds: 长度=route.length，每点速度 kmh; kmPerUnit: 地图单位->公里
  // 返回 points: [{x,y,t,speedKmh}]
  function generatePoints(route, startTs, speeds, kmPerUnit) {
    kmPerUnit = kmPerUnit || 0.003;
    var points = [];
    if (!route || route.length === 0) return points;
    var t = startTs;
    points.push({ x: route[0].x, y: route[0].y, t: t, speedKmh: speeds[0] || 12 });
    for (var i = 1; i < route.length; i++) {
      var prev = route[i - 1], cur = route[i];
      var dx = cur.x - prev.x, dy = cur.y - prev.y;
      var distUnits = Math.sqrt(dx * dx + dy * dy);
      var sA = speeds[i - 1] || 12, sB = speeds[i] || 12;
      var avg = (sA + sB) / 2;
      var durationMs = (avg > 0) ? (distUnits * kmPerUnit / avg) * 3600 * 1000 : 0;
      t += durationMs;
      points.push({ x: cur.x, y: cur.y, t: t, speedKmh: speeds[i] || 12 });
    }
    return points;
  }

  // 默认骑行路线（一段含快/中/慢，用于演示黄/绿/红）
  function defaultRoute() {
    return [
      { x: 200, y: 380 }, { x: 300, y: 360 }, { x: 420, y: 350 }, { x: 520, y: 320 },
      { x: 600, y: 260 }, { x: 660, y: 200 }, { x: 640, y: 140 }, { x: 560, y: 120 },
      { x: 460, y: 150 }, { x: 380, y: 200 }, { x: 300, y: 260 }, { x: 240, y: 320 },
      { x: 200, y: 380 }
    ];
  }
  // 默认配速（对应每段速度 kmh）——混合 快/中/慢
  function defaultSpeeds() {
    return [15, 13, 22, 25, 18, 14, 10, 9, 11, 8, 6, 5, 13];
  }

  return { generatePoints: generatePoints, defaultRoute: defaultRoute, defaultSpeeds: defaultSpeeds };
});
