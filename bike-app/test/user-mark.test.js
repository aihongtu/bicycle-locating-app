/* 用户位置标注 — 地图引擎提供 drawUser + 页面调用 测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const path = require('path');
const fs = require('fs');

const MapProvider = require('../js/map-provider');

test('sim 绘制器提供 drawUser（"我的位置"蓝点标记）', () => {
  const p = MapProvider.createProvider('sim');
  ok(typeof p.drawUser === 'function', 'SimProvider 必须有 drawUser 方法');
});

test('sim 引擎接口：setUserGeo/getUserGeo/drawUser 齐备', () => {
  const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'map-engine.js'), 'utf8');
  ok(engineSrc.includes('MapEngine.prototype.drawUser'), 'map-engine 需委托 drawUser');
  ok(engineSrc.includes('MapEngine.prototype.setUserGeo'), 'map-engine 需 setUserGeo');
  ok(engineSrc.includes('MapEngine.prototype.getUserGeo'), 'map-engine 需 getUserGeo');
});

test('高德引擎提供 drawUser 方法', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'amap-engine.js'), 'utf8');
  ok(src.includes('AmapEngine.prototype.drawUser'), 'amap-engine 需 drawUser');
});

test('找车页在 sim 模式设置用户位置并在地图重绘时标注', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'find.js'), 'utf8');
  ok(src.includes('simEngine.setUserGeo(YOU)'), 'sim 模式需设置"我的位置"');
  ok(src.includes('engine.drawUser()'), '重绘时需调用 drawUser 标注用户位置');
});

test('找车页 sim 模式也真实定位并请求权限（手机定位准、会问权限）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'find.js'), 'utf8');
  ok(src.includes('locateNow'), '应有统一定位函数(覆盖 sim/高德)');
  ok(src.includes('navigator.geolocation.getCurrentPosition'), 'sim 定位需调用真实定位(触发权限询问)');
  ok(src.includes('AmapAPI.simFromGeo'), 'sim 需把真实经纬度映射到世界坐标');
  ok(/ui\.confirmPrivacy/.test(src), '定位前需先征得用户同意(隐私说明)');
  ok(src.includes('locateNow()'), '初始化时应调用统一定位');
});

test('找车页新增"刷新位置"键：点击后统一真实定位并刷新车辆位置', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'find.js'), 'utf8');
  ok(src.includes('刷新位置'), '应有"刷新位置"按钮文案');
  ok(src.includes('locateNow'), '应统一调用 locateNow 刷新定位');
  ok(src.includes('refreshBikeLocation'), '刷新时应同时刷新车辆位置');
  ok(src.includes('位置已刷新'), '刷新后应提示定位精度');
  ok(src.includes('updateBikePosition'), '车辆位置刷新需调用 state.updateBikePosition');
});

test('state.updateBikePosition 更新车辆坐标并返回结果', () => {
  const State = require('../js/state');
  const st = State.createState();
  st.addBike('测试车', { x: 400, y: 300 });
  const r = st.updateBikePosition(520, 380);
  ok(r.ok === true, '更新应成功');
  eq(st.get().bike.position.x, 520);
  eq(st.get().bike.position.y, 380);
  const bad = st.updateBikePosition('a', 'b');
  ok(bad.ok === false, '非法坐标应失败');
  const st3 = State.createState(); st3.removeBike();
  const noBike = st3.updateBikePosition(1, 1);
  ok(noBike.ok === false, '无车辆时应失败');
});