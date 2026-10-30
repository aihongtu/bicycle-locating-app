/* 今日路段隐藏/恢复：隐藏只影响今日视图，不修改原始历史，且随 rides 持久化 */
'use strict';
const { test, eq, ok } = require('./harness');
const State = require('../js/state');

function fresh() { return State.createState(); }

function rideTwoSegments(st, ts) {
  st.startRide(ts);
  st.appendRidePoint(0, 0, ts, 12);
  st.appendRidePoint(100, 0, ts + 600000, 12);
  st.appendRidePoint(200, 0, ts + 1200000, 12);
  return st.finishRide(ts + 1200000);
}

test('隐藏/恢复单个路段：状态与原始 segments 不受影响', () => {
  const st = fresh();
  const s = rideTwoSegments(st, 1000000);
  eq(s.segments.length, 2);
  eq(st.isSegmentHidden(s.id, 0), false);

  eq(st.hideSegment(s.id, 0).ok, true);
  eq(st.isSegmentHidden(s.id, 0), true);
  eq(st.get().rides.history[0].segments.length, 2, '原始历史不被修改');

  eq(st.restoreSegment(s.id, 0).ok, true);
  eq(st.isSegmentHidden(s.id, 0), false);
});

test('restoreAllSegments 清空全部隐藏', () => {
  const st = fresh();
  const s = rideTwoSegments(st, 1000000);
  st.hideSegment(s.id, 0);
  st.hideSegment(s.id, 1);
  eq(st.isSegmentHidden(s.id, 0), true);
  eq(st.isSegmentHidden(s.id, 1), true);

  eq(st.restoreAllSegments().ok, true);
  eq(st.isSegmentHidden(s.id, 0), false);
  eq(st.isSegmentHidden(s.id, 1), false);
});

test('隐藏状态随 rides 持久化，重建 state 后仍保持', () => {
  const st = fresh();
  const s = rideTwoSegments(st, 1000000);
  st.hideSegment(s.id, 1);

  const reloaded = State.createState({ rides: JSON.parse(JSON.stringify(st.get().rides)) });
  eq(reloaded.isSegmentHidden(s.id, 1), true, '隐藏状态保留');
  eq(reloaded.isSegmentHidden(s.id, 0), false);
  eq(reloaded.get().rides.history[0].segments.length, 2, '历史仍完整');
});

test('hideSegment 非法参数返回 invalid', () => {
  const st = fresh();
  eq(st.hideSegment('', 0).ok, false);
  eq(st.hideSegment('s', -1).ok, false);
  eq(st.hideSegment('s', '0').ok, false);
});

test('跨天的新骑行会重置 today，并清理旧 session 的隐藏段', () => {
  const st = fresh();
  const day1 = new Date(2026, 0, 1, 10, 0, 0).getTime();
  const day2 = new Date(2026, 0, 2, 10, 0, 0).getTime();
  const s1 = rideTwoSegments(st, day1);
  st.hideSegment(s1.id, 0);

  rideTwoSegments(st, day2);
  eq(st.get().rides.today.length, 1, 'today 只保留新一天');
  eq(st.isSegmentHidden(s1.id, 0), false, '旧 session 的隐藏段被清理');
  ok(st.get().rides.hiddenSegments !== undefined, 'hiddenSegments 仍存在');
});