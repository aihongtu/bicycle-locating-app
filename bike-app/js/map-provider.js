/* map-provider.js — 地图提供方抽象接口 + 工厂。
 * 现实现 'sim'（Canvas 模拟地图）。为后续接入 'amap'(高德地图) 与 'system'(系统内置地图)
 * 预留统一接口：MapEngine 只依赖 provider，替换底层地图时无需改页面。UMD。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.MapProvider = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 各 provider 必须实现的接口方法（ctx=canvas 2d，view=MapView）
  var INTERFACE_METHODS = ['drawBase', 'drawRoute', 'drawBike', 'drawDirection', 'drawLegend', 'drawScaleBar', 'drawStartEnd', 'drawUser'];

  // 模拟地图 provider（Canvas 2D 绘制，基于 view 坐标变换）
  function SimProvider() {
    this.kind = 'sim';
  }

  SimProvider.prototype.drawBase = function (ctx, view) {
    var v = view.getView();
    var visMin = view.screenToWorld(0, 0), visMax = view.screenToWorld(v.width, v.height);
    ctx.fillStyle = '#eef3ee';
    ctx.fillRect(0, 0, v.width, v.height);
    ctx.strokeStyle = '#cfd8cf'; ctx.lineWidth = 1;
    var step = 60;
    var x0 = Math.floor(visMin.x / step) * step;
    for (var x = x0; x <= visMax.x; x += step) {
      var s = view.worldToScreen(x, visMin.y);
      ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, v.height); ctx.stroke();
    }
    var y0 = Math.floor(visMin.y / step) * step;
    for (var y = y0; y <= visMax.y; y += step) {
      var s2 = view.worldToScreen(visMin.x, y);
      ctx.beginPath(); ctx.moveTo(0, s2.y); ctx.lineTo(v.width, s2.y); ctx.stroke();
    }
    // 简易地标区块（世界坐标）
    ctx.fillStyle = '#dcebd6';
    drawWorldRect(ctx, view, 90, 200, 90, 70);
    drawWorldRect(ctx, view, 520, 60, 90, 70);
    ctx.fillStyle = '#cfe3f7';
    drawWorldRect(ctx, view, 420, 330, 120, 60);
  };

  function drawWorldRect(ctx, view, wx, wy, w, h) {
    var a = view.worldToScreen(wx, wy), b = view.worldToScreen(wx + w, wy + h);
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }

  SimProvider.prototype.drawRoute = function (ctx, view, segments, points) {
    if (!points || points.length < 2 || !segments) return;
    ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      ctx.strokeStyle = colorHex(seg.color);
      var a = view.worldToScreen(points[seg.fromIdx].x, points[seg.fromIdx].y);
      var b = view.worldToScreen(points[seg.toIdx].x, points[seg.toIdx].y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  };

  // 起点/终点标记：起点=绿色圆+“起”，终点=红色圆+“终”
  SimProvider.prototype.drawStartEnd = function (ctx, view, start, end) {
    function dot(pos, fill, ring, label) {
      var s = view.worldToScreen(pos.x, pos.y);
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, s.x, s.y + 4);
    }
    if (start) dot(start, '#27ae60', '#fff', '起');
    if (end) dot(end, '#e74c3c', '#fff', '终');
  };

  SimProvider.prototype.drawUser = function (ctx, view, pos) {
    var s = view.worldToScreen(pos.x, pos.y);
    // 蓝点 + 淡蓝光晕，表示"我的位置"
    ctx.save();
    var g = ctx.createRadialGradient(s.x, s.y, 6, s.x, s.y, 34);
    g.addColorStop(0, 'rgba(41,128,185,0.45)');
    g.addColorStop(1, 'rgba(41,128,185,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, 34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2980b9';
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('我', s.x, s.y + 4);
  };

  SimProvider.prototype.drawBike = function (ctx, view, pos, glow) {
    var s = view.worldToScreen(pos.x, pos.y);
    if (glow) {
      ctx.save();
      var g = ctx.createRadialGradient(s.x, s.y, 5, s.x, s.y, 42);
      g.addColorStop(0, 'rgba(245,197,24,0.85)');
      g.addColorStop(1, 'rgba(245,197,24,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, 42, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#f39c12';
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7d3c00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y - 3, 3, 0, Math.PI * 2); ctx.fill();
  };

  SimProvider.prototype.drawDirection = function (ctx, view, from, to, distanceText) {
    var a = view.worldToScreen(from.x, from.y), b = view.worldToScreen(to.x, to.y);
    var dx = b.x - a.x, dy = b.y - a.y;
    var ang = Math.atan2(dy, dx);
    var len = Math.sqrt(dx * dx + dy * dy);
    var ex = a.x + Math.cos(ang) * Math.min(70, len), ey = a.y + Math.sin(ang) * Math.min(70, len);
    ctx.strokeStyle = '#2980b9'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath();
    ctx.fillStyle = '#2980b9'; ctx.fill(); ctx.restore();
    if (distanceText) {
      ctx.fillStyle = '#1a5276'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('距你 ' + distanceText, (a.x + b.x) / 2, (a.y + b.y) / 2 - 18);
    }
  };

  SimProvider.prototype.drawLegend = function (ctx, view) {
    var x = 12, y = 16;
    var items = [['#f5c518', '快(<3min/km)'], ['#2ecc71', '正常(3-9)'], ['#e74c3c', '慢(>9min/km)']];
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    items.forEach(function (it) {
      ctx.fillStyle = it[0]; ctx.fillRect(x, y, 16, 12);
      ctx.fillStyle = '#333'; ctx.fillText(it[1], x + 22, y + 11);
      y += 20;
    });
  };

  // 比例尺：左下角，带"米"标注
  SimProvider.prototype.drawScaleBar = function (ctx, view) {
    var bar = view.scaleBar();
    var x = 12, y = view.getView().height - 14;
    ctx.strokeStyle = '#444'; ctx.fillStyle = '#444';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + bar.px, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + bar.px, y - 5); ctx.lineTo(x + bar.px, y + 5); ctx.stroke();
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(bar.meters >= 1000 ? (bar.meters / 1000) + ' 公里' : bar.meters + ' 米', x + bar.px / 2, y + 16);
  };

  function colorHex(color) {
    return color === '黄' ? '#f5c518' : (color === '绿' ? '#2ecc71' : '#e74c3c');
  }

  var SUPPORTED = ['sim'];
  var PLANNED = ['amap', 'system']; // 后续接入高德地图 / 系统内置地图

  function createProvider(kind) {
    if (kind === 'sim') return new SimProvider();
    if (PLANNED.indexOf(kind) >= 0) {
      throw new Error('地图提供方 "' + kind + '"（高德地图/系统地图）尚未实现，请先用 "sim"；后续接入时实现 ' + INTERFACE_METHODS.join(',') + ' 即可接入。');
    }
    throw new Error('未知地图提供方：' + kind);
  }

  return { createProvider: createProvider, INTERFACE_METHODS: INTERFACE_METHODS, SUPPORTED: SUPPORTED, PLANNED: PLANNED };
});
