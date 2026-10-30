#!/usr/bin/env node
/* build-map-data.js — 从 OpenStreetMap/Overpass 拉取演示区矢量数据，
 * 简化/归一化后写入 assets/map/sjtu-minhang.json，供模拟地图两种风格共用。
 *
 * 用法（在 bike-app 目录）：
 *   node tools/build-map-data.js
 * 可用环境变量覆盖：
 *   MAP_BBOX="south,west,north,east"
 *   MAP_OUT="assets/map/sjtu-minhang.json"
 *
 * 数据来源：© OpenStreetMap contributors，ODbL 许可。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const BBOX = (process.env.MAP_BBOX || '31.018,121.421,31.040,121.444')
  .split(',').map(Number);
const OUT = process.env.MAP_OUT ||
  path.join(__dirname, '..', 'assets', 'map', 'sjtu-minhang.json');
const CENTER = [
  (BBOX[0] + BBOX[2]) / 2,
  (BBOX[1] + BBOX[3]) / 2
];

const QUERY = [
  '[out:json][timeout:180];',
  '(',
  'way["highway"](' + BBOX.join(',') + ');',
  'way["building"](' + BBOX.join(',') + ');',
  'way["natural"="water"](' + BBOX.join(',') + ');',
  'way["waterway"](' + BBOX.join(',') + ');',
  'way["leisure"="park"](' + BBOX.join(',') + ');',
  'way["leisure"~"^(pitch|track|playground)$"](' + BBOX.join(',') + ');',
  'way["landuse"~"^(grass|forest|meadow|recreation_ground)$"](' + BBOX.join(',') + ');',
  'way["amenity"="parking"](' + BBOX.join(',') + ');',
  'node["amenity"~"^(parking|bicycle_parking|cafe|restaurant|bank|atm|toilets)$"](' + BBOX.join(',') + ');',
  'node["railway"="station"](' + BBOX.join(',') + ');',
  'node["highway"="bus_stop"](' + BBOX.join(',') + ');',
  ');',
  'out body geom;'
].join('');

function fetchOverpass(query, endpoint) {
  return new Promise(function (resolve, reject) {
    const url = endpoint + '?data=' + encodeURIComponent(query);
    const req = https.get(url, {
      headers: { 'User-Agent': 'bike-app-local-demo/0.1 (offline map build)' },
      timeout: 180000
    }, function (res) {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('Overpass HTTP ' + res.statusCode));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Overpass JSON parse failed: ' + e.message)); }
      });
    });
    req.on('timeout', function () { req.destroy(new Error('Overpass timeout')); });
    req.on('error', reject);
  });
}

function round6(n) { return Math.round(n * 1e6) / 1e6; }

function pointDistSq(p, a, b) {
  let x = a[0], y = a[1];
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  const sq = tolerance * tolerance;
  const keep = [];
  const first = 0, last = points.length - 1;
  keep[first] = keep[last] = true;
  const stack = [[first, last]];
  while (stack.length) {
    const seg = stack.pop();
    let maxDist = 0, index = -1;
    for (let i = seg[0] + 1; i < seg[1]; i++) {
      const d = pointDistSq(points[i], points[seg[0]], points[seg[1]]);
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > sq && index > 0) {
      keep[index] = true;
      stack.push([seg[0], index], [index, seg[1]]);
    }
  }
  return points.filter(function (_, i) { return keep[i]; });
}

function ringArea(points) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return Math.abs(a / 2);
}

function normalizeWay(el, tolerance) {
  if (!el.geometry || el.geometry.length < 2) return null;
  let coords = el.geometry.map(function (g) { return [round6(g.lon), round6(g.lat)]; });
  coords = simplify(coords, tolerance || 0.00002);
  if (coords.length < 2) return null;
  return coords;
}

function main() {
  console.log('Overpass bbox:', BBOX.join(','));
  const endpoints = [
    process.env.MAP_ENDPOINT,
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ].filter(Boolean);
  function tryFetch(i) {
    if (i >= endpoints.length) return Promise.reject(new Error('all Overpass endpoints failed'));
    console.log('Trying', endpoints[i]);
    return fetchOverpass(QUERY, endpoints[i]).catch(function (e) {
      console.warn('endpoint failed:', e.message);
      return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return tryFetch(i + 1); });
    });
  }
  return tryFetch(0).then(function (data) {
    const roads = [];
    const buildings = [];
    const water = [];
    const parks = [];
    const pitches = [];
    const parking = [];
    const pois = [];
    const seen = {};

    (data.elements || []).forEach(function (el) {
      const tags = el.tags || {};
      const id = el.type + '/' + el.id;
      if (seen[id]) return;
      seen[id] = true;

      if (el.type === 'node') {
        const amenity = tags.amenity;
        const railway = tags.railway;
        const highway = tags.highway;
        if (amenity || railway === 'station' || highway === 'bus_stop') {
          let type = amenity || (railway === 'station' ? 'station' : 'bus_stop');
          if (type === 'bicycle_parking') type = 'bike_parking';
          pois.push({
            type: type,
            name: tags.name || '',
            pos: [round6(el.lon), round6(el.lat)]
          });
        }
        return;
      }

      if (el.type !== 'way') return;

      if (tags.highway) {
        const coords = normalizeWay(el, 0.00002);
        if (coords) {
          roads.push({
            class: tags.highway,
            name: tags.name || '',
            tunnel: tags.tunnel === 'yes',
            bridge: tags.bridge === 'yes',
            coords: coords
          });
        }
      }

      if (tags.building) {
        const coords = normalizeWay(el, 0.00003);
        if (coords && coords.length >= 3 && ringArea(coords) > 4e-9) {
          buildings.push({
            name: tags.name || '',
            coords: coords
          });
        }
      }

      if (tags.natural === 'water' || tags.waterway) {
        let coords = normalizeWay(el, 0.00004);
        if (coords) {
          // natural=water / waterway=riverbank 是面；river/canal/stream 是线。
          const isArea = tags.natural === 'water' || tags.waterway === 'riverbank';
          if (isArea && coords.length >= 3) {
            const first = coords[0], last = coords[coords.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              coords.push([first[0], first[1]]);
            }
          }
          water.push({
            kind: tags.waterway || 'water',
            name: tags.name || '',
            polygon: isArea && coords.length >= 4,
            coords: coords
          });
        }
      }

      const leisure = tags.leisure || '';
      const landuse = tags.landuse || '';
      if (leisure === 'park' || leisure === 'garden' ||
          landuse === 'grass' || landuse === 'forest' || landuse === 'meadow' || landuse === 'recreation_ground') {
        const coords = normalizeWay(el, 0.00004);
        if (coords && coords.length >= 3) {
          parks.push({
            kind: leisure || landuse,
            name: tags.name || '',
            coords: coords
          });
        }
      }

      if (leisure === 'pitch' || leisure === 'track' || leisure === 'playground') {
        const coords = normalizeWay(el, 0.00004);
        if (coords && coords.length >= 3) {
          pitches.push({ kind: leisure, name: tags.name || '', coords: coords });
        }
      }

      if (tags.amenity === 'parking') {
        const coords = normalizeWay(el, 0.00004);
        if (coords && coords.length >= 3) {
          parking.push({ name: tags.name || '', coords: coords });
        }
      }
    });

    const out = {
      meta: {
        name: '上海交通大学（闵行校区）演示区',
        source: 'OpenStreetMap',
        attribution: '© OpenStreetMap contributors',
        license: 'ODbL',
        center: [round6(CENTER[1]), round6(CENTER[0])],
        bbox: [round6(BBOX[1]), round6(BBOX[0]), round6(BBOX[3]), round6(BBOX[2])],
        generatedAt: new Date().toISOString()
      },
      roads: roads,
      buildings: buildings,
      water: water,
      parks: parks,
      pitches: pitches,
      parking: parking,
      pois: pois
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out));
    const size = fs.statSync(OUT).size;
    console.log('Wrote', OUT);
    console.log('roads=' + roads.length + ' buildings=' + buildings.length +
      ' water=' + water.length + ' parks=' + parks.length +
      ' pitches=' + pitches.length + ' parking=' + parking.length + ' pois=' + pois.length);
    console.log('size=' + (size / 1024 / 1024).toFixed(2) + ' MB');
    console.log('attribution: © OpenStreetMap contributors (ODbL)');
  });
}

main().catch(function (e) {
  console.error('build-map-data failed:', e.message);
  process.exit(1);
});
