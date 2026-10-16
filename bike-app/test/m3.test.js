/* M3 — 模块2「骑行记录」逻辑：配速分色、卡路里、分段/总计、模拟骑行 的测试 */
'use strict';
const { test, eq, ok, closeTo } = require('./harness');
const Core = require('../js/core');
const State = require('../js/state');
const SimBike = require('../js/services/sim-bike');

function fresh() { return State.createState(); }

test('配速分色边界：<3黄、3绿、9绿、>9红', () => {
  eq(Core.paceToColor(2.9), '黄');
  eq(Core.paceToColor(3), '绿');
  eq(Core.paceToColor(9), '绿');
  eq(Core.paceToColor(9.1), '红');
});

test('paceColorHex 对应三种颜色', () => {
  eq(Core.paceColorHex(2), '#f5c518');
  eq(Core.paceColorHex(5), '#2ecc71');
  eq(Core.paceColorHex(10), '#e74c3c');
});

test('卡路里估算：里程为0为0、速度0为0、正常里程为正且数值确定', () => {
  eq(Core.estimateCalories(0, 12), 0);
  eq(Core.estimateCalories(5, 0), 0);
  eq(Core.estimateCalories(5, 12), 184); // 确定性：5km@12km/h≈184千卡(70kg)
  ok(Core.estimateCalories(10, 15) > 100);
});

test('buildRideSegments 由点构造分段并含正确颜色', () => {
  const t0 = Date.now();
  const pts = [
    { x: 0, y: 0, t: t0, speedKmh: 24 },
    { x: 10, y: 0, t: t0 + 20000, speedKmh: 24 },
    { x: 20, y: 0, t: t0 + 50000, speedKmh: 6 },
    { x: 30, y: 0, t: t0 + 90000, speedKmh: 6 }
  ];
  const segs = Core.buildRideSegments(pts);
  eq(segs.length, 3);
  // 段0 均速24 → 配速2.5 黄；段2 均速6 → 配速10 红
  eq(segs[0].color, '黄');
  eq(segs[2].color, '红');
  closeTo(segs[0].distanceKm, 24 * (20 / 3600), 0.01);
});

test('computeRideTotals 汇总一致', () => {
  const t0 = Date.now();
  const pts = [
    { x: 0, y: 0, t: t0, speedKmh: 18 },
    { x: 1, y: 0, t: t0 + 300000, speedKmh: 18 },
    { x: 200, y: 0, t: t0 + 600000, speedKmh: 18 }  // 终点远离起点(0.6km)，非环线，避免触发闭环兜底
  ];
  const r = Core.computeRideTotals(pts);
  ok(r.segments.length === 2);
  closeTo(r.totals.durationMin, 10, '10分钟');
  ok(r.totals.distanceKm > 0);
  closeTo(r.totals.avgSpeedKmh, 18, '均速18');
  ok(r.totals.caloriesKcal > 0);
});

test('模拟骑行：开始→加点→结束 生成今日会话', () => {
  const st = fresh();
  const t0 = Date.now();
  st.startRide(t0);
  st.appendRidePoint(0, 0, t0, 18);
  st.appendRidePoint(1, 0, t0 + 300000, 18);
  st.appendRidePoint(2, 0, t0 + 600000, 18);
  ok(st.activeRidePoints().length === 3, '进行中有点');
  const sess = st.finishRide(t0 + 600000);
  ok(sess.totals.durationMin > 0);
  eq(st.get().rides.today.length, 1, '计入今日');
  eq(st.get().rides.history.length, 1, '计入历史');
  eq(st.get().activeRide, null, '结束后无进行中');
  eq(sess.totals.distanceKm, st.get().rides.today[0].totals.distanceKm, '一致');
});

test('未开始骑行时 finishRide 抛错', () => {
  const st = fresh();
  let threw = false;
  try { st.finishRide(); } catch (e) { threw = true; }
  ok(threw, '抛错');
});

test('默认路线生成完整会话，三种颜色路段均存在且卡路里为正', () => {
  const st = fresh();
  const t0 = Date.now();
  const pts = SimBike.generatePoints(SimBike.defaultRoute(), t0, SimBike.defaultSpeeds(), Core.KM_PER_UNIT);
  st.startRide(t0);
  pts.forEach(p => st.appendRidePoint(p.x, p.y, p.t, p.speedKmh));
  const sess = st.finishRide(t0 + 1000);
  const colors = new Set(sess.segments.map(s => s.color));
  ok(colors.has('黄') && colors.has('绿') && colors.has('红'), '三色，实际=' + JSON.stringify([...colors]));
  ok(sess.totals.caloriesKcal > 0);
});
