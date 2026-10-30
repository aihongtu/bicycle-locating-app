/* 问题F — 卡路里/配速分段统计更准 测试 */
'use strict';
const { test, eq, ok, closeTo } = require('./harness');
const Core = require('../js/core');

// 变速数据：快段24km/h(5min) + 慢段15km/h(5min)
const VARY = [
  { x: 0, y: 0, t: 0, speedKmh: 24 },
  { x: 100, y: 0, t: 300000, speedKmh: 24 },
  { x: 200, y: 0, t: 600000, speedKmh: 6 } // 与上一段取均速15
];

test('变速骑行：卡路里按各段强度累加（快慢段各自 MET）', () => {
  const c = Core.computeRideTotals(VARY);
  // 5min*MET10(24km/h)+5min*MET6(15km/h) = 5*12.25 + 5*7.35 = 98
  eq(c.totals.caloriesKcal, 98);
});

test('体重参数影响卡路里估算', () => {
  const c = Core.computeRideTotals(VARY, 50);
  // 5*8.75 + 5*5.25 = 70
  eq(c.totals.caloriesKcal, 70);
});

test('无效速度不产生卡路里', () => {
  const pts = [
    { x: 0, y: 0, t: 0 },
    { x: 100, y: 0, t: 300000 },
    { x: 200, y: 0, t: 600000 }
  ];
  eq(Core.computeRideTotals(pts).totals.caloriesKcal, 0);
});

test('配速分段：黄<3 / 绿3~9 / 红>9 仍正确', () => {
  eq(Core.paceToColor(2.9), '黄');
  eq(Core.paceToColor(3), '绿');
  eq(Core.paceToColor(9), '绿');
  eq(Core.paceToColor(9.1), '红');
});

test('静止/无效配速显示灰色，不再误判为“最快”黄色', () => {
  eq(Core.paceToColor(0), '灰');
  eq(Core.paceToColor(null), '灰');
  eq(Core.paceColorHex(0), '#95a5a6');
});

test('闭环回程段按缺口时长计入卡路里，不重复整段', () => {
  const pts = [
    { x: 0, y: 0, t: 0, speedKmh: 18 },
    { x: 100, y: 0, t: 60000, speedKmh: 18 },
    { x: 200, y: 0, t: 120000, speedKmh: 18 },
    { x: 15, y: 0, t: 180000, speedKmh: 18 } // 距起点0.045km，闭合
  ];
  const c = Core.computeRideTotals(pts);
  // 3段*1min*calPerMin(18)=29.4 + 缺口0.15min*9.8=1.47 → 30.87 → 31
  eq(c.totals.caloriesKcal, 31);
});

test('起点=终点且缺口为0时，时长/卡路里不重复计入', () => {
  const pts = [
    { x: 0, y: 0, t: 0, speedKmh: 18 },
    { x: 100, y: 0, t: 600000, speedKmh: 18 },
    { x: 0, y: 0, t: 1200000, speedKmh: 18 }
  ];
  const c = Core.computeRideTotals(pts);
  eq(c.totals.durationMin, 20, '20 分钟不应变成 30 分钟');
  eq(c.totals.caloriesKcal, 196);
});
