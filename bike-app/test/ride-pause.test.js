/* 问题C — 记录暂停/继续 + 定位错误分类 测试 */
'use strict';
const { test, eq, ok, throws } = require('./harness');
const Core = require('../js/core');
const State = require('../js/state');

function fresh() { return State.createState(); }

test('startRide 初始未暂停', () => {
  const st = fresh();
  const ar = st.startRide();
  eq(ar.paused, false);
});

test('pauseRide 后暂停，appendRidePoint 拒绝', () => {
  const st = fresh();
  st.startRide();
  eq(st.pauseRide().ok, true);
  eq(st.get().activeRide.paused, true);
  throws(() => st.appendRidePoint(0, 0, Date.now(), 15), '暂停中不能记录点');
});

test('resumeRide 后恢复，可继续记录点', () => {
  const st = fresh();
  st.startRide();
  st.pauseRide();
  eq(st.resumeRide().ok, true);
  eq(st.get().activeRide.paused, false);
  st.appendRidePoint(0, 0, Date.now(), 15); // 不抛
  eq(st.activeRidePoints().length, 1);
});

test('无进行中记录时 pause/resume 返回 no-active', () => {
  const st = fresh();
  eq(st.pauseRide().ok, false);
  eq(st.resumeRide().ok, false);
});

test('定位错误分类：权限拒绝/不可用/超时/未知', () => {
  eq(Core.rideErrorKind({ code: 1 }), 'denied');
  eq(Core.rideErrorKind({ code: 2 }), 'unavailable');
  eq(Core.rideErrorKind({ code: 3 }), 'timeout');
  eq(Core.rideErrorKind({}), 'unknown');
  eq(Core.rideErrorKind(null), 'unknown');
});
