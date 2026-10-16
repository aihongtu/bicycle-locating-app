/* M1 — 模块4「我的」逻辑：资料编辑、头像选择 的测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const State = require('../js/state');

function fresh() { return State.createState(); }

test('默认资料字段完整', () => {
  const s = fresh().get();
  ok(s.profile.username && s.profile.avatar && s.profile.gender && s.profile.birthday && s.profile.hobbies && s.profile.intro);
});

test('updateProfile 修改并保留其余字段', () => {
  const st = fresh();
  st.updateProfile({ username: '小明', gender: '男', birthday: '1998-06-15', hobbies: '骑行、摄影', intro: '热爱周末骑行' });
  const p = st.get().profile;
  eq(p.username, '小明');
  eq(p.gender, '男');
  eq(p.birthday, '1998-06-15');
  ok(p.avatar && p.avatar.type === 'preset', '未改头像仍保留');
});

test('setAvatar 支持预设与上传', () => {
  const st = fresh();
  st.setAvatar({ type: 'preset', presetId: 'p3' });
  eq(st.get().profile.avatar.presetId, 'p3');
  st.setAvatar({ type: 'upload', key: 'abc', imageData: 'data:image/png;base64,QQ' });
  eq(st.get().profile.avatar.type, 'upload');
  ok(st.get().profile.avatar.imageData.indexOf('data:image') === 0);
});

test('onChange 在修改资料时触发', () => {
  const st = fresh();
  let calls = 0;
  st.onChange(() => calls++);
  st.updateProfile({ username: '新名字' });
  ok(calls >= 1, '资料修改触发通知');
});
