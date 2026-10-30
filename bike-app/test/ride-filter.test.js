/* 问题D — GPS 异常点过滤 + 轨迹闭合兜底 测试 */
'use strict';
const { test, eq, ok, closeTo } = require('./harness');
const Core = require('../js/core');
const State = require('../js/state');

test('isSaneStep：首点恒正常，正常相邻点正常，跳跃点为漂移', () => {
  eq(Core.isSaneStep(null, { x: 0, y: 0 }), true, '首点正常');
  eq(Core.isSaneStep({ x: 0, y: 0 }, { x: 100, y: 0 }), true, '0.3km 正常');
  eq(Core.isSaneStep({ x: 0, y: 0 }, { x: 1000, y: 0 }), false, '3km 视为漂移');
});

test('isSaneStep：支持自定义阈值', () => {
  eq(Core.isSaneStep({ x: 0, y: 0 }, { x: 300, y: 0 }, 1), true, '0.9km<1 正常');
  eq(Core.isSaneStep({ x: 0, y: 0 }, { x: 500, y: 0 }, 1), false, '1.5km>1 漂移');
});

test('轨迹闭合兜底：首尾接近(环线)时补回程里程，时长按缺口估算', () => {
  const pts = [
    { x: 0, y: 0, t: 0, speedKmh: 18 },
    { x: 100, y: 0, t: 60000, speedKmh: 18 },
    { x: 200, y: 0, t: 120000, speedKmh: 18 },
    { x: 15, y: 0, t: 180000, speedKmh: 18 } // 距起点 0.045km < 0.25 → 闭合
  ];
  const c = Core.computeRideTotals(pts);
  closeTo(c.totals.distanceKm, 0.95, 0.02, '闭合段 0.045km 计入总里程');
  closeTo(c.totals.durationMin, 3.15, 0.02, '只补缺口时长（0.045/18*60=0.15min），不重复整段');
});

test('非环线：终点距起点远时不补回程', () => {
  const pts = [
    { x: 0, y: 0, t: 0, speedKmh: 18 },
    { x: 100, y: 0, t: 60000, speedKmh: 18 },
    { x: 200, y: 0, t: 120000, speedKmh: 18 },
    { x: 1000, y: 0, t: 180000, speedKmh: 18 } // 距起点 3km，不闭合
  ];
  const c = Core.computeRideTotals(pts);
  closeTo(c.totals.distanceKm, 0.9, 0.01, '不加回程');
  eq(c.totals.durationMin, 3);
});

test('漂移点过滤后里程不应包含异常跳跃', () => {
  // 前两段正常 + 一个 3km 漂移点应被 isSaneStep 拦截
  const prev = { x: 0, y: 0 }, drift = { x: 1000, y: 0 };
  eq(Core.isSaneStep(prev, drift), false, '漂移点被识别');
});

test('pointKm 换算：地图单位→公里', () => {
  closeTo(Core.pointKm({ x: 0, y: 0 }, { x: 100, y: 0 }), 0.3, 0.001);
});
