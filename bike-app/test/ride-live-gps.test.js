/* 骑行页实时记录真实 GPS 轨迹 的数据链路测试：
 * 真实经纬度 → simFromGeo 转模拟坐标 → startRide/append/finish 落库 → 汇总/分段/颜色正确，
 * 且匀速数据下记录里程与真实 Haversine 距离一致。 */
'use strict';
const { test, eq, ok } = require('./harness');
const Core = require('../js/core');
const State = require('../js/state');
const AmapAPI = require('../js/amap-engine');

const BASE = { lng: 121.4737, lat: 31.2304 };
// 变速数据（用于颜色规则）：相邻点速度不同，能覆盖 黄/绿/红 三档
const RAW_COLOR = [
  { x: 500, y: 400, v: 24 }, { x: 520, y: 400, v: 24 },
  { x: 540, y: 380, v: 15 }, { x: 560, y: 380, v: 15 },
  { x: 560, y: 360, v: 6 },  { x: 580, y: 360, v: 6 }
];
// 匀速数据（用于里程一致性）：v=15km/h，每段 250m(=83.33 单位)/60s，几何距离=速度×时间
const RAW_SMOOTH = [
  { x: 500, y: 400 }, { x: 583.33, y: 400 }, { x: 666.67, y: 400 },
  { x: 750, y: 400 }, { x: 833.33, y: 400 }, { x: 916.67, y: 400 }
];

function toRealGps(pts) { return pts.map(p => AmapAPI.geoFromSim(BASE, p.x, p.y)); }

// 把"真实 GPS 经纬度序列 + 速度标签"记录成骑行会话
function recordReal(raw, vel) {
  const real = toRealGps(raw);
  const st = State.createState();
  const t0 = Date.now();
  st.startRide(t0);
  real.forEach((g, i) => {
    const p = AmapAPI.simFromGeo(BASE, g.lng, g.lat);
    st.appendRidePoint(p.x, p.y, t0 + i * 60000, vel ? vel[i] : raw[i].v);
  });
  const s = st.finishRide(t0 + raw.length * 60000);
  return { st, session: s };
}

test('真实 GPS 点转模拟坐标后，位置与原始轨迹一致', () => {
  const real = toRealGps(RAW_COLOR);
  real.forEach((g, i) => {
    const back = AmapAPI.simFromGeo(BASE, g.lng, g.lat);
    ok(Math.abs(back.x - RAW_COLOR[i].x) < 1e-6, 'x 往返一致 idx=' + i);
    ok(Math.abs(back.y - RAW_COLOR[i].y) < 1e-6, 'y 往返一致 idx=' + i);
  });
});

test('真实 GPS 记录落库：今日存在记录、无进行中状态', () => {
  const { st, session } = recordReal(RAW_COLOR, null);
  eq(st.get().activeRide, null);
  const today = st.get().rides.today[0];
  ok(today, '今日有记录');
  eq(today.id, session.id);
  eq(today.points.length, RAW_COLOR.length);
});

test('匀速数据下记录里程 ≈ 真实经纬度 Haversine 累计距离', () => {
  const { session } = recordReal(RAW_SMOOTH, RAW_SMOOTH.map(() => 15));
  const real = toRealGps(RAW_SMOOTH);
  let realM = 0;
  for (let i = 1; i < real.length; i++) realM += AmapAPI.haversine(real[i - 1], real[i]);
  const simKm = session.totals.distanceKm;
  const realKm = realM / 1000;
  ok(Math.abs(simKm - realKm) < 0.06, '匀速下模拟里程应接近真实里程，sim=' + simKm.toFixed(3) + ' real=' + realKm.toFixed(3));
});

test('分段颜色符合规则：快<3min/km=黄、3~9=绿、>9=红', () => {
  const { session } = recordReal(RAW_COLOR, null);
  session.segments.forEach(seg => {
    eq(seg.color, Core.paceToColor(seg.paceMinPerKm), '颜色一致（配速 ' + seg.paceMinPerKm + '）');
  });
  const colors = session.segments.map(s => s.color);
  ok(colors.indexOf('黄') >= 0, '应有快速段(黄)');
  ok(colors.indexOf('绿') >= 0, '应有正常段(绿)');
  ok(colors.indexOf('红') >= 0, '应有慢速段(红)');
});

test('汇总字段可从已存分段重新计算一致', () => {
  const { session } = recordReal(RAW_COLOR, null);
  const rc = Core.computeRideTotals(session.points).totals;
  eq(session.totals.distanceKm, rc.distanceKm);
  eq(session.totals.durationMin, rc.durationMin);
  eq(session.totals.avgSpeedKmh, rc.avgSpeedKmh);
  eq(session.totals.caloriesKcal, rc.caloriesKcal);
});
