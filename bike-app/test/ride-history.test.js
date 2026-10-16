/* 问题B — 历史骑行列表数据支撑：多次记录落库（history 保留全部、today 只留最新）、记录字段完整 测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const State = require('../js/state');

function fresh() { return State.createState(); }
function rideOne(st, ts, pts) {
  st.startRide(ts);
  pts.forEach(function (p) { st.appendRidePoint(p.x, p.y, p.t, p.speedKmh); });
  st.finishRide(ts + pts.length * 60000);
}

test('多次骑行记录：history 保留全部，today 只留当天最新一条', () => {
  const st = fresh();
  rideOne(st, 1000000, [{ x: 0, y: 0, t: 1000000, speedKmh: 18 }, { x: 1, y: 0, t: 1001000, speedKmh: 18 }]);
  rideOne(st, 2000000, [{ x: 0, y: 0, t: 2000000, speedKmh: 18 }, { x: 1, y: 0, t: 2001000, speedKmh: 18 }]);
  eq(st.get().rides.history.length, 2, '历史保留全部');
  eq(st.get().rides.today.length, 1, 'today 只留最新');
  eq(st.get().rides.today[0].startedAt, 2000000, 'today 为最新一条');
});

test('记录字段完整，可支撑历史详情展示', () => {
  const st = fresh();
  st.startRide();
  st.appendRidePoint(0, 0, Date.now(), 15);
  st.appendRidePoint(1, 0, Date.now() + 120000, 15);
  const s = st.finishRide();
  ok(s.id && s.date && s.startedAt && s.endedAt, '基础字段齐全');
  eq(s.points.length, 2);
  ok(s.segments && s.segments.length > 0, '含分色路段');
  ok(s.totals && typeof s.totals.distanceKm === 'number', '含汇总');
  eq(st.get().activeRide, null, '结束后无进行中记录');
});
