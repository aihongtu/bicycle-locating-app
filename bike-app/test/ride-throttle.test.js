/* 问题E — 记录中节流（省电/续航）测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const Core = require('../js/core');

test('shouldSamplePoint：首点必记', () => {
  eq(Core.shouldSamplePoint(null, { t: 1000 }), true);
});

test('shouldSamplePoint：间隔足够时必记（即使没动）', () => {
  const prev = { x: 0, y: 0, t: 0 };
  eq(Core.shouldSamplePoint(prev, { x: 0, y: 0, t: Core.RIDE_MIN_INTERVAL_MS + 1 }), true);
});

test('shouldSamplePoint：间隔不足且位移很小则跳过（节流）', () => {
  const prev = { x: 0, y: 0, t: 0 };
  eq(Core.shouldSamplePoint(prev, { x: 2, y: 0, t: 1000 }), false, '2单位=6m<10m 跳过');
});

test('shouldSamplePoint：间隔不足但位移明显则仍记', () => {
  const prev = { x: 0, y: 0, t: 0 };
  eq(Core.shouldSamplePoint(prev, { x: 500, y: 0, t: 1000 }), true, '500单位=1.5km 移动明显');
});

test('默认节流参数存在且合理', () => {
  eq(Core.RIDE_MIN_INTERVAL_MS, 10000);
  eq(Core.RIDE_MIN_MOVE_KM, 0.01);
});
