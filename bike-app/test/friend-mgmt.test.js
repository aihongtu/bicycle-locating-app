/* 问题4 — 好友管理：可删除好友、好友请求冷却(一定时间内一次)、已是好友不可再发请求 的测试
 * 社交已移除虚拟人：附近/好友仅来自真实用户数据，测试用 addRealUser 注入真实用户。 */
'use strict';
const { test, eq, ok } = require('./harness');
const Core = require('../js/core');
const State = require('../js/state');

function fresh() { return State.createState(); }
// 注入一个真实用户到"附近的人"
function addRealUser(st, id) {
  st.get().social.nearby.push({
    id: id, name: '真实用户' + id, gender: '保密', hobbies: '', avatar: { type: 'preset', presetId: 'p1' },
    relation: 'none', lastRequestAt: 0
  });
  return id;
}
// 把一个 nearby 真实用户变成好友
function makeFriend(st, uid) {
  st.sendFriendRequest(uid);
  st.settleRequest(uid, 'friend');
}

test('没有真实用户时附近列表为空（不再生成虚拟人）', () => {
  const st = fresh();
  eq(st.ensureNearby().length, 0, '附近无虚拟人');
});

test('已是好友后不可再发送好友请求', () => {
  const st = fresh();
  const uid = addRealUser(st, 'u1');
  makeFriend(st, uid);
  const r = st.sendFriendRequest(uid);
  eq(r.ok, false);
  eq(r.reason, 'already-friend');
});

test('请求已发送(未决)时不可再发送', () => {
  const st = fresh();
  const uid = addRealUser(st, 'u1');
  st.sendFriendRequest(uid);
  const r = st.sendFriendRequest(uid);
  eq(r.ok, false);
  eq(r.reason, 'already-requested');
});

test('冷却：对方拒绝后，冷却期内不可再次发送，过期后可发送', () => {
  const st = fresh();
  const uid = addRealUser(st, 'u1');
  st.sendFriendRequest(uid);
  st.settleRequest(uid, 'rejected');
  const n1 = st.get().social.nearby.find(n => n.id === uid);
  ok(n1.lastRequestAt > 0, '记录了请求时间');

  // 冷却期内（默认1小时）再发 → cooldown，且剩余时间>0
  const r = st.sendFriendRequest(uid);
  eq(r.ok, false);
  eq(r.reason, 'cooldown');
  ok(r.remainingMs > 0 && r.remainingMs <= Core.REQUEST_COOLDOWN_MS);

  // 模拟冷却过期（回拨上次请求时间到冷却窗口之前），应可再次发送
  n1.lastRequestAt = Core.now() - Core.REQUEST_COOLDOWN_MS - 1000;
  const r2 = st.sendFriendRequest(uid);
  eq(r2.ok, true, '冷却过期后可再次发送');
  ok(st.get().social.nearby.find(n => n.id === uid).relation === 'requested', '重新进入请求已发送');
});

test('删除好友：从好友列表移除并重置附近关系', () => {
  const st = fresh();
  const uid = addRealUser(st, 'u1');
  makeFriend(st, uid);
  ok(st.get().social.friends.some(f => f.id === uid), '已是好友');
  const res = st.removeFriend(uid);
  eq(res.ok, true);
  ok(!st.get().social.friends.some(f => f.id === uid), '已从好友列表移除');
  eq(st.get().social.nearby.find(n => n.id === uid).relation, 'none', '附近关系重置，可重新添加');
});

test('删除非好友返回 notfound', () => {
  const st = fresh();
  const r = st.removeFriend('nobody');
  eq(r.ok, false);
  eq(r.reason, 'notfound');
});

test('删除后冷却也被重置（可立即重新添加）', () => {
  const st = fresh();
  const uid = addRealUser(st, 'u1');
  makeFriend(st, uid);
  st.removeFriend(uid);
  const r = st.sendFriendRequest(uid);
  eq(r.ok, true, '删除好友后可重新发送请求');
});
