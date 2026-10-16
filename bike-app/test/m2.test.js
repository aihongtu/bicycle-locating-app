/* M2 — 模块1「找车」逻辑：发光/响铃模拟、虚拟车生成、距离 的测试 */
'use strict';
const { test, eq, ok, closeTo } = require('./harness');
const Core = require('../js/core');
const State = require('../js/state');
const SimBike = require('../js/services/sim-bike');

function fresh() { return State.createState(); }

test('发光：glowBike 激活且到期时间正确', () => {
  const st = fresh();
  const before = Core.now();
  const g = st.glowBike(8);
  ok(g.active);
  closeTo((g.until - before) / 1000, 8, '持续8秒');
});

test('响铃：ringBike 记录次数', () => {
  const st = fresh();
  const r = st.ringBike(3);
  ok(r.active);
  eq(r.count, 3);
});

test('expireBikeFx 到期后自动关闭', () => {
  const st = fresh();
  st.glowBike(1);
  const until = st.get().bike.glow.until;
  st.expireBikeFx(until + 1);
  eq(st.get().bike.glow.active, false, '到期后发光关闭');
});

test('sim-bike generatePoints 时间递增、点数正确、速度一致', () => {
  const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
  const speeds = [12, 24, 24];
  const pts = SimBike.generatePoints(route, 1000000, speeds, 0.003);
  eq(pts.length, 3);
  ok(pts[1].t > pts[0].t, '时间递增');
  eq(pts[1].speedKmh, 24);
  ok(pts[2].t > pts[1].t);
});

test('距离换算：dist2d * KM_PER_UNIT * 1000 = 米', () => {
  const d = Core.dist2d({ x: 0, y: 0 }, { x: 100, y: 0 }) * Core.KM_PER_UNIT * 1000;
  closeTo(d, 300, '100单位≈300米');
});

test('默认骑行路线可生成多段且配速分布含快/中/慢', () => {
  const now = Date.now();
  const pts = SimBike.generatePoints(SimBike.defaultRoute(), now, SimBike.defaultSpeeds(), Core.KM_PER_UNIT);
  const segs = Core.buildRideSegments(pts);
  ok(segs.length >= 2, '有多段');
  const colors = new Set(segs.map(s => s.color));
  ok(colors.has('黄') && colors.has('绿') && colors.has('红'), '含三种颜色，实际=' + JSON.stringify([...colors]));
});
