/* 问题2 — 车辆管理：每用户仅一辆车，可添加/删除、寻找并连接设备、持久化 的测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const Core = require('../js/core');
const State = require('../js/state');
const Storage = require('../js/storage');
const SimDevice = require('../js/services/sim-device');

function fresh() { return State.createState(); }

function memBackend() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
}
function memAvatar() {
  const m = {};
  return { get: id => (id in m ? m[id] : null), set: (id, v) => { m[id] = v; }, remove: id => { delete m[id]; }, keys: () => Object.keys(m) };
}

test('默认有一辆车，且可通过 hasBike/getBike 获取', () => {
  const st = fresh();
  ok(st.hasBike());
  ok(st.getBike() && st.getBike().bikeName);
});

test('addBike 创建/替换唯一车辆', () => {
  const st = fresh();
  const b = st.addBike('山地车', { x: 100, y: 100 });
  eq(st.getBike().id, b.id);
  eq(st.getBike().bikeName, '山地车');
  eq(st.getBike().position.x, 100);
  ok(st.hasBike());
});

test('removeBike 删除后 hasBike 为 false、getBike 为 null', () => {
  const st = fresh();
  ok(st.removeBike().ok);
  ok(!st.hasBike());
  eq(st.getBike(), null);
});

test('删除车辆后发光/响铃返回 null（不报错）', () => {
  const st = fresh();
  st.removeBike();
  eq(st.glowBike(8), null);
  eq(st.ringBike(3), null);
});

test('sim-device 返回可发现设备（1~3个，含名称与信号）', () => {
  const devs = SimDevice.listDevices(() => 0.9);
  ok(devs.length >= 1 && devs.length <= 3);
  devs.forEach(d => ok(d.id && d.name && typeof d.rssi === 'number'));
});

test('连接设备：发现→添加车辆（单车覆盖）', () => {
  const st = fresh();
  const devs = SimDevice.listDevices(() => 0.9);
  st.addBike(devs[0].name);
  eq(st.getBike().bikeName, devs[0].name);
});

test('车辆持久化：删除后重启仍无车，添加后重启仍有车', () => {
  const storage = Storage.createStorage(memBackend(), memAvatar());
  // 删除
  const st = fresh();
  st.removeBike();
  storage.setJSON(storage.KEYS.BIKE, st.getBike()); // 存为 null
  let st2 = State.createState({ bike: storage.getJSON(storage.KEYS.BIKE), bikeProvided: true });
  ok(!st2.hasBike(), '删除后重启无车');

  // 添加
  const st3 = fresh();
  st3.addBike('通勤车', { x: 200, y: 200 });
  storage.setJSON(storage.KEYS.BIKE, st3.getBike());
  const st4 = State.createState({ bike: storage.getJSON(storage.KEYS.BIKE) });
  ok(st4.hasBike());
  eq(st4.getBike().bikeName, '通勤车');
});

test('旧多车格式({list,activeId})可迁移为单车', () => {
  const legacy = { list: [{ id: 'a', bikeName: '旧车', position: { x: 1, y: 2 }, status: '在线', parkedAt: 1, glow: { active: false, until: 0 }, ring: { active: false, count: 0, until: 0 } }], activeId: 'a' };
  const st = State.createState({ bikes: legacy });
  ok(st.hasBike());
  eq(st.getBike().bikeName, '旧车');
});
