/* 真实定位隐私授权 的同意状态持久化测试（consented/grant，storage 可注入） */
'use strict';
const { test, eq, ok } = require('./harness');
const Privacy = require('../js/privacy');

function makeStorage() {
  const map = {};
  return {
    getItem: k => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); }
  };
}

test('默认未同意定位隐私', () => {
  eq(Privacy.consented(makeStorage()), false);
});

test('grant 后 consented 返回 true', () => {
  const s = makeStorage();
  eq(Privacy.consented(s), false);
  ok(Privacy.grant(s), 'grant 应成功');
  eq(Privacy.consented(s), true);
});

test('同意状态持久化（同一 storage 多次读取一致）', () => {
  const s = makeStorage();
  Privacy.grant(s);
  eq(Privacy.consented(s), true);
  eq(s.getItem(Privacy.KEY), '1');
});

test('storage 抛错时视为未同意、grant 不抛错', () => {
  const bad = { getItem() { throw new Error('boom'); }, setItem() { throw new Error('boom'); } };
  eq(Privacy.consented(bad), false);
  eq(Privacy.grant(bad), false);
});

test('null/缺失 storage 时安全降级', () => {
  eq(Privacy.consented(null), false);
  eq(Privacy.grant(undefined), false);
});
