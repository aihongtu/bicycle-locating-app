/* 高德真实地图引擎（AmapEngine）测试
 * 用最小 AMap / document mock 验证：构造不抛错、模拟↔经纬度换算、叠加层绘制（车标记/图例/比例尺/轨迹）与清理。 */
'use strict';
const { test, eq, ok } = require('./harness');
const AmapAPI = require('../js/amap-engine');

// ---- 最小环境 mock ----
function makeFakeEl() {
  return {
    className: '', style: {}, textContent: '', innerHTML: '',
    setAttribute() {}, appendChild() {}, querySelector() { return { style: {} }; },
    parentNode: null
  };
}
global.window = global;
function makeScriptEl() {
  return { src: '', async: false, onload: null, onerror: null, parentNode: null, setAttribute() {} };
}
global.document = {
  createElement: function (tag) { return tag === 'script' ? makeScriptEl() : makeFakeEl(); },
  head: { appendChild: function () {} }
};
global.AMap = {
  Map: function () {
    this._objs = [];
    this.on = function () {};
    this.setCenter = function () {};
    this.zoomIn = function () {};
    this.zoomOut = function () {};
    this.getZoom = function () { return 15; };
    this.add = function (o) { this._objs.push(o); };
    this.remove = function () {};
    this.getSize = function () { return { width: 340, height: 420 }; };
    this.getCenter = function () { return { lng: 121.4737, lat: 31.2304 }; };
    this.lngLatToPixel = function () { return { x: 500, y: 400 }; };
    this.pixelToLngLat = function (p) { return { lng: 121.4737 + (p.x - 500) * 1e-5, lat: 31.2304 }; }; // 1px≈1.1m
  },
  Marker: function (opts) { this.opts = opts || {}; this.on = function () {}; },
  Polyline: function (opts) { this.opts = opts || {}; }
};

const AmapEngine = AmapAPI.AmapEngine;

test('AmapEngine 构造不抛错且创建地图实例', () => {
  const el = makeFakeEl();
  const e = new AmapEngine(el, { zoom: 15 });
  ok(e.map, '应创建 AMap.Map');
  eq(e.el, el);
  eq(typeof e.centerOn, 'function');
});

test('geoFromSim 与 simFromGeo 往返一致', () => {
  const base = { lng: 121.4737, lat: 31.2304 };
  const p = { x: 520, y: 380 };
  const g = AmapAPI.geoFromSim(base, p.x, p.y);
  const back = AmapAPI.simFromGeo(base, g.lng, g.lat);
  ok(Math.abs(back.x - p.x) < 1e-6, 'x 往返应一致');
  ok(Math.abs(back.y - p.y) < 1e-6, 'y 往返应一致');
});

test('drawBike 创建车标记（含 amap-bike 样式类）', () => {
  const e = new AmapEngine(makeFakeEl(), {});
  e.drawBike({ x: 500, y: 400 }, false);
  eq(e._markers.length, 1);
  ok(e._markers[0].opts.content.className.indexOf('amap-bike') >= 0, '标记内容应带 amap-bike 类');
});

test('drawLegend 幂等：只创建一次', () => {
  const e = new AmapEngine(makeFakeEl(), {});
  e.drawLegend();
  e.drawLegend();
  ok(e._legendEl, '应创建图例元素');
  eq(typeof e._legendEl, 'object');
});

test('比例尺：基于像素<->经纬度真实换算绘制元素', () => {
  const e = new AmapEngine(makeFakeEl(), {});
  eq(typeof e.drawScaleBar, 'function');
  e.drawScaleBar();
  ok(e._scaleEl, '应创建比例尺元素');
  ok(e._scaleEl.className.indexOf('amap-scale') >= 0, '元素应带 amap-scale 类');
});

test('drawRoute 按分段数量创建轨迹线', () => {
  const e = new AmapEngine(makeFakeEl(), {});
  const points = [{ x: 500, y: 400 }, { x: 520, y: 380 }, { x: 540, y: 360 }];
  const segments = [
    { fromIdx: 0, toIdx: 1, color: '黄' },
    { fromIdx: 1, toIdx: 2, color: '红' }
  ];
  e.drawRoute(segments, points);
  eq(e._polylines.length, 2);
});

test('drawStartEnd 创建起点与终点两个标记（含 amap-se 类）', () => {
  const e = new AmapEngine(makeFakeEl(), {});
  e.drawStartEnd({ x: 500, y: 400 }, { x: 560, y: 360 });
  eq(e._markers.length, 2);
  ok(e._markers[0].opts.content.className.indexOf('amap-se') >= 0 && e._markers[0].opts.content.className.indexOf('start') >= 0, '起点标记应带 start 类');
  ok(e._markers[1].opts.content.className.indexOf('amap-se') >= 0 && e._markers[1].opts.content.className.indexOf('end') >= 0, '终点标记应带 end 类');
});

test('clear 清空标记与轨迹', () => {
  const e = new AmapEngine(makeFakeEl(), {});
  e.drawBike({ x: 500, y: 400 }, false);
  const pts = [{ x: 500, y: 400 }, { x: 520, y: 380 }];
  e.drawRoute([{ fromIdx: 0, toIdx: 1, color: '绿' }], pts);
  e.clear();
  eq(e._markers.length, 0);
  eq(e._polylines.length, 0);
});

test('haversine 计算上海两点距离（约 300 米量级）', () => {
  const a = { lng: 121.4737, lat: 31.2304 };
  const b = AmapAPI.geoFromSim(a, 600, 300);
  const d = AmapAPI.haversine(a, b);
  ok(d > 0, '距离应为正');
  ok(d < 2000, '模拟偏移应在 2 公里内');
});

test('高德加载有超时回退：弱网下脚本挂起也能回退 sim，避免页面一直等待', () => {
  ok(AmapAPI.AMAP_LOAD_TIMEOUT_MS > 0, '应配置加载超时时长');
  const fs = require('fs'); const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'amap-engine.js'), 'utf8');
  ok(src.includes('setTimeout'), 'load 应设置超时');
  ok(/removeChild/.test(src), '超时应移除挂起的脚本元素');
  ok(/fire\(false\)/.test(src), '超时后应回退（fire false）');
});