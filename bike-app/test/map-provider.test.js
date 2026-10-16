/* 问题1 — 地图：provider 抽象接口（为接入高德/系统地图预留） 的测试 */
'use strict';
const { test, eq, ok, throws } = require('./harness');
const MapProvider = require('../js/map-provider');

test('createProvider("sim") 实现全部接口方法', () => {
  const p = MapProvider.createProvider('sim');
  eq(p.kind, 'sim');
  MapProvider.INTERFACE_METHODS.forEach(m => ok(typeof p[m] === 'function', '缺少方法 ' + m));
});

test('接口方法清单齐全（8 项，含起点/终点标记、用户位置标记）', () => {
  eq(MapProvider.INTERFACE_METHODS.length, 8);
  ok(MapProvider.INTERFACE_METHODS.indexOf('drawScaleBar') >= 0);
  ok(MapProvider.INTERFACE_METHODS.indexOf('drawStartEnd') >= 0);
  ok(MapProvider.INTERFACE_METHODS.indexOf('drawUser') >= 0);
});

test('sim 在支持列表，amap/system 在规划列表（未来接入）', () => {
  ok(MapProvider.SUPPORTED.indexOf('sim') >= 0);
  ok(MapProvider.PLANNED.indexOf('amap') >= 0, '高德地图已列入规划');
  ok(MapProvider.PLANNED.indexOf('system') >= 0, '系统地图已列入规划');
});

test('未实现的 provider（amap）创建时给出清晰错误', () => {
  throws(() => MapProvider.createProvider('amap'), 'amap 未实现应抛错');
  throws(() => MapProvider.createProvider('system'), 'system 未实现应抛错');
  throws(() => MapProvider.createProvider('xxx'), '未知应抛错');
});
