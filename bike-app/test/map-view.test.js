/* 问题1 — 地图：视口变换/平移钳制/缩放/比例尺 的测试 */
'use strict';
const { test, eq, ok, closeTo } = require('./harness');
const MapView = require('../js/map-view');

function mk() { return MapView.createView({ width: 340, height: 420, worldW: 1000, worldH: 800 }); }

test('世界<->屏幕坐标往返一致', () => {
  const v = mk();
  v.centerOn(520, 300);
  const w = v.screenToWorld(170, 210);
  const s = v.worldToScreen(w.x, w.y);
  closeTo(s.x, 170, 0.001);
  closeTo(s.y, 210, 0.001);
});

test('centerOn 使点位于视野中心', () => {
  const v = mk();
  v.centerOn(520, 300);
  const s = v.worldToScreen(520, 300);
  closeTo(s.x, 170, 0.001);
  closeTo(s.y, 210, 0.001);
});

test('panPx 平移视图且被钳制在世界范围内', () => {
  const v = mk();
  v.centerOn(520, 300);
  v.panPx(100000, 100000); // 疯狂拖出
  const vw = v.getView();
  ok(vw.offsetX >= 0, 'offsetX>=0');
  ok(vw.offsetX <= vw.worldW - vw.width / vw.scale, 'offsetX<=界内');
  ok(vw.offsetY >= 0, 'offsetY>=0');
  ok(vw.offsetY <= vw.worldH - vw.height / vw.scale, 'offsetY<=界内');
});

test('zoomAt 以锚点为中心缩放（锚点世界坐标不动）', () => {
  const v = mk();
  v.centerOn(520, 300);
  const sx = 60, sy = 300;
  const before = v.screenToWorld(sx, sy);
  v.zoomAt(1.5, sx, sy);
  const after = v.screenToWorld(sx, sy);
  closeTo(after.x, before.x, 1e-6);
  closeTo(after.y, before.y, 1e-6);
  ok(v.getView().scale > 1, '放大后 scale 增大');
});

test('zoom 被限制在 min/max 之间', () => {
  const v = mk();
  for (let i = 0; i < 30; i++) v.zoomBy(1.5);
  ok(v.getView().scale <= 4 + 1e-9, '不超上限');
  for (let i = 0; i < 60; i++) v.zoomBy(1 / 1.5);
  ok(v.getView().scale >= 0.3 - 1e-9, '不低于下限');
});

test('isVisible 判断世界点是否在视野内', () => {
  const v = mk();
  v.centerOn(520, 300);
  ok(v.isVisible(520, 300), '中心点可见');
  ok(!v.isVisible(-100, -100), '远处点不可见');
});

test('scaleBar 返回漂亮长度且在合理像素区间', () => {
  const v = mk();
  for (const s of [0.4, 1, 2, 3.5]) {
    v.zoomBy(s / v.getView().scale);
    const bar = v.scaleBar();
    ok(bar.meters > 0 && bar.px > 0, '米与像素为正');
    ok(bar.px >= 30 && bar.px <= 110, '像素在30~110，实际=' + bar.px);
  }
});

test('比例尺像素长度与标注米数严格一致（防乱标）', () => {
  const v = mk();
  // 1px 屏幕 = 1/scale 世界单位 = 3/scale 米（KM_PER_UNIT=0.003→3 米/单位）
  for (const s of [0.4, 1, 2, 3.5]) {
    v.zoomBy(s / v.getView().scale);
    const bar = v.scaleBar();
    const expected = bar.px * 3 / v.getView().scale;
    closeTo(bar.meters, expected, 0.5,
      '像素与标注不符 scale=' + s + ' px=' + bar.px + ' 米=' + bar.meters);
  }
});
