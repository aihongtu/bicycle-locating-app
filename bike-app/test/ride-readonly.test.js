/* 问题3 — 删去冗余"模拟骑行"：骑行页只读展示今日记录，无自动生成/无残留骑行中状态 的测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const Core = require('../js/core');
const State = require('../js/state');

function fresh() { return State.createState(); }

test('初始状态无进行中的骑行（不再自动开始模拟骑行）', () => {
  const st = fresh();
  eq(st.activeRidePoints().length, 0);
  eq(st.get().activeRide, null);
});

test('今日骑行记录可直接渲染（只读展示路径），无需进行中状态', () => {
  const st = fresh();
  const t0 = Date.now();
  st.startRide(t0);
  st.appendRidePoint(0, 0, t0, 24);
  st.appendRidePoint(1, 0, t0 + 20000, 24);
  st.appendRidePoint(2, 0, t0 + 60000, 6);
  const session = st.finishRide(t0 + 60000);

  // 结束后续：无 activeRide，可从 rides.today 读取展示数据
  eq(st.get().activeRide, null);
  const today = st.get().rides.today[0];
  ok(today, '今日有记录');

  // 展示数据可由保存的分段/总计直接渲染，与独立计算一致
  const recomputed = Core.computeRideTotals(today.points).totals;
  eq(today.totals.distanceKm, recomputed.distanceKm);
  eq(today.totals.durationMin, recomputed.durationMin);
  eq(today.totals.avgSpeedKmh, recomputed.avgSpeedKmh);
  eq(today.totals.caloriesKcal, recomputed.caloriesKcal);

  // 分段颜色符合规则（<3黄,3~9绿,>9红）
  today.segments.forEach(seg => {
    eq(seg.color, Core.paceToColor(seg.paceMinPerKm), '颜色一致');
  });
});

test('今日聚合：同一天多次骑行都保留（不再覆盖式只留最近一次）', () => {
  const st = fresh();
  const t0 = new Date(2026, 0, 1, 10, 0, 0).getTime();
  st.startRide(t0);
  st.appendRidePoint(0, 0, t0, 12);
  st.appendRidePoint(1, 0, t0 + 600000, 12);
  st.finishRide(t0 + 600000);
  const id1 = st.get().rides.today[0].id;

  const t1 = t0 + 3600000;
  st.startRide(t1);
  st.appendRidePoint(0, 0, t1, 18);
  st.appendRidePoint(1, 0, t1 + 600000, 18);
  st.finishRide(t1 + 600000);

  eq(st.get().rides.today.length, 2, '同一天两次都保留');
  eq(st.get().rides.today[0].id, id1, '第一次仍在');
  eq(st.get().rides.history.length, 2, '历史累计保留');
});
