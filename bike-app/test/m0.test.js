/* M0 — 存储封装、ID、默认数据、备份基础 的测试 */
'use strict';
const { test, eq, ok, closeTo, throws } = require('./harness');
const Core = require('../js/core');
const Storage = require('../js/storage');
const Backup = require('../js/backup');

// 内存版 backend
function memBackend() {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    dump: () => m
  };
}
function memAvatar() {
  const m = {};
  return {
    get: id => (id in m ? m[id] : null),
    set: (id, v) => { m[id] = v; },
    remove: id => { delete m[id]; },
    keys: () => Object.keys(m)
  };
}

test('makeId 生成唯一且带前缀的 id', () => {
  const a = Core.makeId('r'), b = Core.makeId('r');
  ok(a.startsWith('r_'), '前缀');
  ok(a !== b, '唯一');
});

test('默认资料与默认自行车结构完整', () => {
  const p = Core.defaultProfile();
  ok(p.username && p.avatar && p.gender && p.birthday && p.hobbies && p.intro, '资料字段');
  const b = Core.defaultBike();
  ok(b.bikeName && b.position && b.status && b.glow && b.ring, '车字段');
});

test('storage JSON 读写与复位', () => {
  const s = Storage.createStorage(memBackend(), memAvatar());
  s.setJSON(s.KEYS.PROFILE, { a: 1 });
  eq(s.getJSON(s.KEYS.PROFILE).a, 1);
  s.setJSON('bikeapp.none', null);
  s.reset();
  eq(s.getJSON(s.KEYS.PROFILE), null, '复位后清空');
});

test('storage 头像读写', () => {
  const s = Storage.createStorage(memBackend(), memAvatar());
  s.setAvatar('up1', 'data:image/png;base64,AAA');
  eq(s.getAvatar('up1'), 'data:image/png;base64,AAA');
  ok(s.avatarKeys().indexOf('up1') >= 0);
});

test('backup 导出/导入往返一致', () => {
  const b = memBackend(), a = memAvatar();
  const s = Storage.createStorage(b, a);
  s.setJSON(s.KEYS.PROFILE, { username: '小明' });
  s.setJSON(s.KEYS.SOCIAL, { friends: [1, 2] });
  s.setAvatar('up1', 'imgdata');
  const bak = Backup.exportBackup(s, 111);
  eq(bak.version, 1);
  eq(bak.data[s.KEYS.PROFILE].username, '小明');

  // 清空后导入
  s.reset();
  Backup.importBackup(s, bak);
  eq(s.getJSON(s.KEYS.PROFILE).username, '小明');
  eq(s.getJSON(s.KEYS.SOCIAL).friends.length, 2);
  eq(s.getAvatar('up1'), 'imgdata');
});

test('backup 导入非法数据抛错', () => {
  const s = Storage.createStorage(memBackend(), memAvatar());
  throws(() => Backup.importBackup(s, null), '空数据');
  throws(() => Backup.importBackup(s, { data: 1 }), 'data非对象');
});
