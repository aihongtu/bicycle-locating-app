/* M5 — 数据持久化 + 备份恢复 + 集成回归 的测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const Core = require('../js/core');
const State = require('../js/state');
const Storage = require('../js/storage');
const Backup = require('../js/backup');

function memBackend() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
}
function memAvatar() {
  const m = {};
  return { get: id => (id in m ? m[id] : null), set: (id, v) => { m[id] = v; }, remove: id => { delete m[id]; }, keys: () => Object.keys(m) };
}

// 模拟"保存到本地 + 重启读取"：把 state 写入 storage，再从 storage 新建 state
function persistAndReload(state, storage) {
  storage.setJSON(storage.KEYS.PROFILE, state.get().profile);
  storage.setJSON(storage.KEYS.BIKE, state.get().bike);
  storage.setJSON(storage.KEYS.RIDES, state.get().rides);
  storage.setJSON(storage.KEYS.SOCIAL, state.get().social);
  const initial = {
    profile: storage.getJSON(storage.KEYS.PROFILE),
    bike: storage.getJSON(storage.KEYS.BIKE),
    rides: storage.getJSON(storage.KEYS.RIDES),
    social: storage.getJSON(storage.KEYS.SOCIAL)
  };
  return State.createState(initial);
}
// 注入一个真实用户到"附近的人"
function addRealUser(st, id) {
  st.get().social.nearby.push({
    id: id, name: '真实用户' + id, gender: '保密', hobbies: '', avatar: { type: 'preset', presetId: 'p1' },
    relation: 'none', lastRequestAt: 0
  });
  return id;
}

test('持久化：资料/好友/聊天/骑行在“重启”后不丢', () => {
  const storage = Storage.createStorage(memBackend(), memAvatar());
  const st = State.createState();
  st.updateProfile({ username: '小明', gender: '男' });
  addRealUser(st, 'r1');
  st.sendFriendRequest('r1');
  st.settleRequest('r1', 'friend');
  st.sendMessage('r1', '你好');
  const t0 = Date.now();
  st.startRide(t0);
  st.appendRidePoint(0, 0, t0, 18);
  st.appendRidePoint(1, 0, t0 + 300000, 18);
  st.finishRide(t0 + 300000);

  const st2 = persistAndReload(st, storage);
  eq(st2.get().profile.username, '小明');
  eq(st2.get().profile.gender, '男');
  ok(st2.get().social.friends.some(f => f.id === 'r1'), '好友保留');
  eq(st2.get().social.messages['r1'].length, 1, '消息保留');
  eq(st2.get().rides.today.length, 1, '骑行保留');
});

test('备份：导出→清空→导入，四类数据+头像完整恢复', () => {
  const storage = Storage.createStorage(memBackend(), memAvatar());
  const st = State.createState();
  st.updateProfile({ username: '阿豪', hobbies: '爬山' });
  addRealUser(st, 'r2');
  st.sendFriendRequest('r2');
  st.settleRequest('r2', 'friend');
  st.sendMessage('r2', '明天去爬山吗');
  storage.setAvatar('up1', 'data:image/png;base64,ZZZ');

  // 把当前状态落库
  storage.setJSON(storage.KEYS.PROFILE, st.get().profile);
  storage.setJSON(storage.KEYS.SOCIAL, st.get().social);

  const bak = Backup.exportBackup(storage);
  ok(bak.data[storage.KEYS.PROFILE]);
  eq(bak.avatars['up1'], 'data:image/png;base64,ZZZ');

  storage.reset();
  ok(storage.getJSON(storage.KEYS.PROFILE) == null, '已清空');
  Backup.importBackup(storage, bak);

  eq(storage.getJSON(storage.KEYS.PROFILE).username, '阿豪');
  ok(storage.getJSON(storage.KEYS.SOCIAL).friends.some(f => f.id === 'r2'), '好友恢复');
  eq(storage.getJSON(storage.KEYS.SOCIAL).messages['r2'][0].text, '明天去爬山吗');
  eq(storage.getAvatar('up1'), 'data:image/png;base64,ZZZ');
});

test('备份版本与导出时间字段正确', () => {
  const storage = Storage.createStorage(memBackend(), memAvatar());
  storage.setJSON(storage.KEYS.PROFILE, Core.defaultProfile());
  const bak = Backup.exportBackup(storage, 123456);
  eq(bak.version, 1);
  eq(bak.exportedAt, 123456);
});

test('集成回归：完整流程数据最终可落库且可导入', () => {
  const storage = Storage.createStorage(memBackend(), memAvatar());
  const st = State.createState();
  st.updateProfile({ username: '王姐', birthday: '1975-03-02' });
  const uid = addRealUser(st, 'u1');
  st.sendFriendRequest(uid);
  st.settleRequest(uid, 'friend');
  st.sendMessage(uid, '今天天气不错');
  const t0 = Date.now();
  st.startRide(t0);
  [18, 18].forEach(() => st.appendRidePoint(0, 0, t0, 18));
  st.finishRide(t0);

  const persisted = persistAndReload(st, storage);
  const bak = Backup.exportBackup(storage);
  storage.reset();
  Backup.importBackup(storage, bak);
  const st3 = State.createState({
    profile: storage.getJSON(storage.KEYS.PROFILE),
    bike: storage.getJSON(storage.KEYS.BIKE),
    rides: storage.getJSON(storage.KEYS.RIDES),
    social: storage.getJSON(storage.KEYS.SOCIAL)
  });
  eq(st3.get().profile.username, '王姐');
  eq(st3.get().rides.today.length, 1);
  eq(st3.get().social.friends.length, 1);
});
