/* 定位精度修复 — geoOptions 高精度参数 + accuracyLabel 精度分级 测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const Core = require('../js/core');

test('geoOptions 强制高精度定位，不取缓存位置', () => {
  const o = Core.geoOptions();
  eq(o.enableHighAccuracy, true, '必须开启高精度，避免粗定位(城市级)');
  eq(o.maximumAge, 0, '不取缓存的旧位置');
  ok(o.timeout > 0, '有超时');
});

test('accuracyLabel：不同精度给出分级文案', () => {
  eq(Core.accuracyLabel(20), '高精度(±20 米)');
  eq(Core.accuracyLabel(120), '较精确(±120 米)');
  eq(Core.accuracyLabel(500), '一般(±1 公里)');
  eq(Core.accuracyLabel(5000), '粗略(城市级，±5 公里)');
});

test('accuracyLabel：非法/缺失精度返回未知', () => {
  eq(Core.accuracyLabel(undefined), '定位精度未知');
  eq(Core.accuracyLabel(0), '定位精度未知');
  eq(Core.accuracyLabel(NaN), '定位精度未知');
});
