/* 离线地图演示数据：结构、范围、署名、体积 的测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'assets', 'map', 'sjtu-minhang.json');

test('离线地图数据存在且体积可控', () => {
  ok(fs.existsSync(DATA), 'sjtu-minhang.json 应存在');
  const size = fs.statSync(DATA).size;
  ok(size > 0 && size < 5 * 1024 * 1024, '数据应小于 5MB，实际=' + size);
});

test('数据包含 OSM 署名、ODbL 许可与演示区 bbox', () => {
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  ok(raw.meta && raw.meta.attribution.indexOf('OpenStreetMap') >= 0, '应有 OSM 署名');
  eq(raw.meta.license, 'ODbL');
  ok(Array.isArray(raw.meta.bbox) && raw.meta.bbox.length === 4, '应有 bbox');
  ok(Array.isArray(raw.meta.center) && raw.meta.center.length === 2, '应有中心点');
  const c = raw.meta.center, b = raw.meta.bbox;
  ok(c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3], '中心点应在 bbox 内');
});

test('道路/建筑/水系/公园/POI 数量足够支撑演示', () => {
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  ok(raw.roads.length > 100, '道路数量，实际=' + raw.roads.length);
  ok(raw.buildings.length > 50, '建筑数量，实际=' + raw.buildings.length);
  ok(raw.water.length > 5, '水系数量，实际=' + raw.water.length);
  ok(raw.parks.length > 5, '公园数量，实际=' + raw.parks.length);
  ok(raw.pitches.length > 5, '球场/操场数量，实际=' + raw.pitches.length);
  ok(raw.parking.length > 5, '停车场数量，实际=' + raw.parking.length);
  ok(raw.pois.length > 10, 'POI 数量，实际=' + raw.pois.length);
  ok(raw.water.some(function (w) { return w.polygon; }), '至少应有一个面状水域（湖泊/池塘）');
});

test('所有道路坐标至少两个点，且落在 bbox 附近', () => {
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const b = raw.meta.bbox;
  raw.roads.forEach(function (road) {
    ok(road.coords.length >= 2, '道路至少 2 点：' + road.class);
    road.coords.forEach(function (p) {
      ok(p[0] >= b[0] - 0.02 && p[0] <= b[2] + 0.02, '经度在范围内');
      ok(p[1] >= b[1] - 0.02 && p[1] <= b[3] + 0.02, '纬度在范围内');
    });
  });
});