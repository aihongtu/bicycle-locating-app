/* 问题2 — 登录方式：游客访问 / 微信账号（本地模拟）测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const Login = require('../js/login');

function makeStorage() {
  const map = {};
  return { getItem: k => (k in map ? map[k] : null), setItem: (k, v) => { map[k] = String(v); } };
}

test('默认登录方式为游客访问', () => {
  eq(Login.current(makeStorage()).mode, 'guest');
});

test('微信登录后 mode 为 wechat 且昵称持久化', () => {
  const s = makeStorage();
  Login.loginWechat(s, ' 阿狸 ');
  const c = Login.current(s);
  eq(c.mode, 'wechat');
  eq(c.wechatNick, '阿狸');
  eq(Login.isWechat(s), true);
});

test('微信昵称为空时用默认值', () => {
  const s = makeStorage();
  Login.loginWechat(s, '   ');
  eq(Login.current(s).wechatNick, '微信用户');
});

test('可切换回游客访问（清空微信昵称）', () => {
  const s = makeStorage();
  Login.loginWechat(s, '阿狸');
  Login.loginGuest(s);
  const c = Login.current(s);
  eq(c.mode, 'guest');
  eq(c.wechatNick, '');
  eq(Login.isWechat(s), false);
});

test('损坏的存储数据安全降级为游客', () => {
  const bad = { getItem: () => '{oops', setItem: (k, v) => {} };
  eq(Login.current(bad).mode, 'guest');
});

test('null 存储时安全降级', () => {
  eq(Login.current(null).mode, 'guest');
  eq(Login.loginWechat(null, 'x').mode, 'wechat'); // 不写也不抛
});
