/* M4 — 模块3「骑友」逻辑：双向加好友、好友上限100、好友请求、聊天 的测试 */
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

test('没有真实用户时附近列表为空（不再生成虚拟人）', () => {
  const st = fresh();
  eq(st.ensureNearby().length, 0, '附近无虚拟人');
});

test('加好友流程：发送请求→对方同意→成为好友', () => {
  const st = fresh();
  const uid = addRealUser(st, 'u1');
  eq(st.sendFriendRequest(uid).ok, true);
  eq(st.get().social.nearby.find(n => n.id === uid).relation, 'requested', '请求已发送');
  const res = st.settleRequest(uid, 'friend');
  eq(res.result, 'friend');
  ok(st.get().social.friends.some(f => f.id === uid), '成为好友');
});

test('重复请求与已是好友不可再发', () => {
  const st = fresh();
  const uid = addRealUser(st, 'u1');
  st.sendFriendRequest(uid);
  eq(st.sendFriendRequest(uid).reason, 'already-requested');
  st.settleRequest(uid, 'friend');
  eq(st.sendFriendRequest(uid).reason, 'already-friend');
});

test('对方拒绝后关系为 rejected', () => {
  const st = fresh();
  const uid = addRealUser(st, 'u1');
  st.sendFriendRequest(uid);
  const res = st.settleRequest(uid, 'rejected');
  eq(res.result, 'rejected');
  eq(st.get().social.nearby.find(n => n.id === uid).relation, 'rejected');
});

test('好友上限：100 人满后无法添加且 settle 受限', () => {
  const st = fresh();
  // 直接塞满 99 个 + 1 个 = 100
  for (let i = 0; i < Core.FRIEND_LIMIT; i++) st.get().social.friends.push({ id: 'f' + i, name: 'u' + i });
  eq(st.get().social.friends.length, 100);
  eq(st.canAddFriend(), false);
  const r = st.sendFriendRequest('r1');
  eq(r.ok, false); eq(r.reason, 'limit');
  // 即使近处有人发请求，settle 也受限
  addRealUser(st, 'r1');
  st.get().social.nearby.find(n => n.id === 'r1').relation = 'requested';
  const s = st.settleRequest('r1', 'friend');
  eq(s.ok, false); eq(s.reason, 'limit');
});

test('收到好友请求：同意后成为好友，忽略后为 ignored', () => {
  const st = fresh();
  const rider = { id: 'r1', name: '真实用户r1', gender: '保密', avatar: { type: 'preset', presetId: 'p1' } };
  const rq = st.receiveFriendRequest(rider);
  eq(rq.ok, true);
  eq(st.get().social.requests[0].status, 'pending');
  const rid = st.get().social.requests[0].id;
  ok(st.acceptRequest(rid).ok, '同意成功');
  ok(st.get().social.friends.some(f => f.id === rider.id), '成为好友');

  const rider2 = { id: 'r2', name: '真实用户r2', gender: '保密', avatar: { type: 'preset', presetId: 'p1' } };
  const rq2 = st.receiveFriendRequest(rider2);
  const rid2 = st.get().social.requests[1].id;
  ok(st.ignoreRequest(rid2).ok);
  eq(st.get().social.requests[1].status, 'ignored');
});

test('聊天：空消息拒绝，发送与接收保留，按好友分线程', () => {
  const st = fresh();
  eq(st.sendMessage('f1', '  ').ok, false, '空消息拒绝');
  ok(st.sendMessage('f1', '今天骑去哪？').ok);
  st.receiveMessage('f1', '去滨江绿道');
  const thread = st.get().social.messages['f1'];
  eq(thread.length, 2);
  eq(thread[0].fromMe, true);
  eq(thread[0].text, '今天骑去哪？');
  eq(thread[1].fromMe, false);
  // 另一好友独立线程
  st.sendMessage('f2', '嗨');
  ok(!('f2' in st.get().social.messages) || st.get().social.messages['f2'].length === 1);
});

