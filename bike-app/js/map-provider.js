/* map-provider.js — 地图提供方抽象接口 + 工厂。
 * 现实现 'sim'（Canvas 模拟地图）。为后续接入 'amap'(高德地图) 与 'system'(系统内置地图)
 * 预留统一接口：MapEngine 只依赖 provider，替换底层地图时无需改页面。UMD。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.MapProvider = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 各 provider 必须实现的接口方法（ctx=canvas 2d，view=MapView）
  var INTERFACE_METHODS = ['drawBase', 'drawRoute', 'drawBike', 'drawDirection', 'drawLegend', 'drawScaleBar', 'drawStartEnd', 'drawUser'];

  function palette() {
    var dark = typeof document !== 'undefined' && document.body &&
      document.body.classList && document.body.classList.contains('dark');
    if (dark) {
      return {
        bg: '#1f2926', grid: '#32413a', major: '#40544a', block: '#26342e',
        park: '#2b3f34', water: '#203b48', text: '#e7eee8', muted: '#a9b7ae',
        panel: 'rgba(32,39,39,.88)', routeCasing: '#101614', compass: '#a9b7ae', teal: '#46c3ce',
        waterStroke: '#2f6478', pitch: '#2c4432', pitchStroke: '#3f5c46', parking: '#2a312e', parkingStroke: '#3d4842'
      };
    }
    return {
      bg: '#eef3ee', grid: '#d7e0d7', major: '#c3d0c6', block: '#e3ebe0',
      park: '#d5e8cf', water: '#cfe3f7', text: '#26322c', muted: '#5f6d66',
      panel: 'rgba(249,250,247,.86)', routeCasing: '#ffffff', compass: '#52625a', teal: '#159eae',
      waterStroke: '#8fb9c9', pitch: '#cfe3c2', pitchStroke: '#a9c99a', parking: '#ddddd5', parkingStroke: '#c2c2b8'
    };
  }

  function tr(s) {
    var I = (typeof window !== 'undefined') && window.BikeApp && window.BikeApp.I18n;
    return I ? I.translate(s) : s;
  }

  var FONT_FAMILY = '"Noto Sans SC","Microsoft YaHei","PingFang SC",sans-serif';
  function mapFont(size, weight) { return (weight || '400') + ' ' + size + 'px ' + FONT_FAMILY; }

  function realPalette() {
    var dark = typeof document !== 'undefined' && document.body &&
      document.body.classList && document.body.classList.contains('dark');
    if (dark) {
      return {
        bg: '#1b2320', water: '#1d3b47', park: '#203a2c', building: '#28322d',
        buildingStroke: '#45534b', road: '#2c3732', roadCasing: '#111816',
        major: '#4c432c', text: '#e8eee9', muted: '#a9b7ae',
        panel: 'rgba(32,39,39,.86)', compass: '#a9b7ae', teal: '#46c3ce',
        waterStroke: '#2f6478', pitch: '#2e4a35', pitchStroke: '#456b4c', parking: '#2a312e', parkingStroke: '#3d4842'
      };
    }
    return {
      bg: '#f2efe9', water: '#aad3df', park: '#c8e6c9', building: '#d9d0c9',
      buildingStroke: '#b9aaa0', road: '#ffffff', roadCasing: '#c9c1b6',
      major: '#f2d6a2', text: '#333333', muted: '#666666',
      panel: 'rgba(255,255,255,.86)', compass: '#52625a', teal: '#159eae',
      waterStroke: '#7fb3c8', pitch: '#b7d9a8', pitchStroke: '#93bf84', parking: '#d8d8d2', parkingStroke: '#b8b8ae'
    };
  }

  var ROAD_ORDER = {
    motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4,
    residential: 5, living_street: 6, service: 7, cycleway: 8, footway: 9, path: 10
  };
  function roadRank(cls) { return ROAD_ORDER[cls] != null ? ROAD_ORDER[cls] : 6; }
  function roadWidth(cls, style) {
    if (style === 'realistic') {
      var w = { motorway: 8, trunk: 8, primary: 7, secondary: 5, tertiary: 4,
        residential: 3, living_street: 2.5, service: 1.8, cycleway: 1.6, footway: 1.3, path: 1.1 };
      return w[cls] || 2;
    }
    var t = { motorway: 3.2, trunk: 3.2, primary: 2.6, secondary: 2, tertiary: 1.5,
      residential: 1.1, living_street: 0.9, service: 0.7, cycleway: 0.9, footway: 0.6, path: 0.6 };
    return t[cls] || 0.9;
  }
  function roadMinScale(cls) {
    if (roadRank(cls) <= 4) return 0;
    if (roadRank(cls) === 5) return 0.40;   // residential
    if (roadRank(cls) === 6) return 0.55;   // living_street
    if (roadRank(cls) <= 8) return 1.20;    // service / cycleway
    return 1.80;                            // footway / path
  }

  function bboxOf(points) {
    if (!points || !points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    var b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    points.forEach(function (p) {
      if (p.x < b.minX) b.minX = p.x;
      if (p.y < b.minY) b.minY = p.y;
      if (p.x > b.maxX) b.maxX = p.x;
      if (p.y > b.maxY) b.maxY = p.y;
    });
    return b;
  }

  function prepareData(raw) {
    var meta = raw.meta || {};
    var center = meta.center || [121.4325, 31.0290];
    var lat0 = center[1], lng0 = center[0];
    var cos = Math.cos(lat0 * Math.PI / 180);
    function project(c) {
      var dx = (c[0] - lng0) * 111320 * cos;
      var dy = (lat0 - c[1]) * 111320;
      return { x: 500 + dx / 3, y: 400 + dy / 3 };
    }
    function prep(feature) {
      var pts = (feature.coords || []).map(project);
      return {
        name: feature.name || '',
        kind: feature.kind || feature.class || '',
        class: feature.class || '',
        polygon: !!feature.polygon,
        pts: pts,
        bbox: bboxOf(pts)
      };
    }
    var data = {
      meta: meta,
      center: center,
      roads: (raw.roads || []).map(prep),
      buildings: (raw.buildings || []).map(prep),
      water: (raw.water || []).map(prep),
      parks: (raw.parks || []).map(prep),
      pitches: (raw.pitches || []).map(prep),
      parking: (raw.parking || []).map(prep),
      pois: (raw.pois || []).map(function (p) {
        return { type: p.type || '', name: p.name || '', pt: project(p.pos || [lng0, lat0]) };
      })
    };
    var b = meta.bbox || [121.421, 31.018, 121.444, 31.04];
    data.bounds = bboxOf([project([b[0], b[1]]), project([b[2], b[3]])]);
    data.roads.sort(function (a, b) { return roadRank(a.class) - roadRank(b.class); });
    return data;
  }

  var mapDataCache = {};
  var mapDataPromises = {};
  function loadMapData(url) {
    if (mapDataCache[url]) return Promise.resolve(mapDataCache[url]);
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
    if (!mapDataPromises[url]) {
      mapDataPromises[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error('map data HTTP ' + r.status);
        return r.json();
      }).then(function (raw) {
        mapDataCache[url] = raw;
        return raw;
      });
    }
    return mapDataPromises[url];
  }

  function featureVisible(view, bbox) {
    var v = view.getView();
    var a = view.worldToScreen(bbox.minX, bbox.minY);
    var b = view.worldToScreen(bbox.maxX, bbox.maxY);
    return a.x <= v.width + 40 && b.x >= -40 && a.y <= v.height + 40 && b.y >= -40;
  }

  function polyline(ctx, view, pts) {
    if (!pts || pts.length < 2) return;
    var p0 = view.worldToScreen(pts[0].x, pts[0].y);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
    for (var i = 1; i < pts.length; i++) {
      var p = view.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function polygon(ctx, view, pts) {
    if (!pts || pts.length < 2) return;
    var p0 = view.worldToScreen(pts[0].x, pts[0].y);
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
    for (var i = 1; i < pts.length; i++) {
      var p = view.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }

  // 模拟地图 provider（Canvas 2D 绘制，基于 view 坐标变换）
  function SimProvider(opts) {
    opts = opts || {};
    this.kind = 'sim';
    this.style = opts.style === 'realistic' ? 'realistic' : 'p09';
    this.dataUrl = opts.dataUrl || '';
    this.data = null;
    this.onReady = null;
    if (this.dataUrl) this.load();
  }

  SimProvider.prototype.load = function () {
    var self = this;
    loadMapData(this.dataUrl).then(function (raw) {
      self.data = prepareData(raw);
      if (self.onReady) self.onReady();
    }).catch(function () { self.data = null; });
  };
  SimProvider.prototype.setStyle = function (style) {
    this.style = style === 'realistic' ? 'realistic' : 'p09';
  };
  SimProvider.prototype.hasData = function () { return !!this.data; };

  SimProvider.prototype.drawBase = function (ctx, view) {
    if (this.data && this.dataInView(view)) {
      this.drawDataBase(ctx, view);
      return;
    }
    this.drawProceduralBase(ctx, view);
  };

  SimProvider.prototype.dataInView = function (view) {
    if (!this.data) return false;
    var v = view.getView();
    var c = view.screenToWorld(v.width / 2, v.height / 2);
    var b = this.data.bounds;
    var mx = Math.max((b.maxX - b.minX) * 0.2, 220);
    var my = Math.max((b.maxY - b.minY) * 0.2, 220);
    return c.x >= b.minX - mx && c.x <= b.maxX + mx && c.y >= b.minY - my && c.y <= b.maxY + my;
  };

  function hash(i, j) {
    var n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  SimProvider.prototype.drawProceduralBase = function (ctx, view) {
    var v = view.getView();
    var p = palette();
    var visMin = view.screenToWorld(0, 0), visMax = view.screenToWorld(v.width, v.height);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, v.width, v.height);

    // 自适应街区尺寸：屏幕上约 70~180px 一格
    var blockStep = 120;
    while (blockStep * v.scale < 70) blockStep *= 2;
    while (blockStep * v.scale > 180 && blockStep > 10) blockStep /= 2;

    var bx0 = Math.floor(visMin.x / blockStep) * blockStep;
    var by0 = Math.floor(visMin.y / blockStep) * blockStep;
    var cellPx = blockStep * v.scale;

    // 街区 / 公园 / 水面：按世界坐标种子生成，平移不闪烁
    for (var bx = bx0; bx <= visMax.x; bx += blockStep) {
      for (var by = by0; by <= visMax.y; by += blockStep) {
        var h = hash(bx / blockStep, by / blockStep);
        var a = view.worldToScreen(bx, by);
        if (h < 0.10) {
          ctx.fillStyle = p.park;
          ctx.fillRect(a.x, a.y, cellPx, cellPx);
          if (cellPx > 64) {
            ctx.fillStyle = p.muted; ctx.font = mapFont(9, '600'); ctx.textAlign = 'center';
            ctx.fillText(tr('公园'), a.x + cellPx / 2, a.y + cellPx / 2 + 3);
          }
        } else if (h < 0.14) {
          ctx.fillStyle = p.water;
          ctx.fillRect(a.x, a.y, cellPx, cellPx);
          if (cellPx > 64) {
            ctx.fillStyle = p.muted; ctx.font = mapFont(9, '600'); ctx.textAlign = 'center';
            ctx.fillText(tr('水域'), a.x + cellPx / 2, a.y + cellPx / 2 + 3);
          }
        } else {
          ctx.globalAlpha = 0.55 + h * 0.25;
          ctx.fillStyle = p.block;
          ctx.fillRect(a.x, a.y, cellPx, cellPx);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 街区内部细网格
    var step = 60;
    while (step * v.scale < 24) step *= 2;
    while (step * v.scale > 72 && step > 1) step /= 2;
    ctx.strokeStyle = p.grid; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    var gx0 = Math.floor(visMin.x / step) * step;
    for (var gx = gx0; gx <= visMax.x; gx += step) {
      var gs = view.worldToScreen(gx, visMin.y);
      ctx.beginPath(); ctx.moveTo(gs.x, 0); ctx.lineTo(gs.x, v.height); ctx.stroke();
    }
    var gy0 = Math.floor(visMin.y / step) * step;
    for (var gy = gy0; gy <= visMax.y; gy += step) {
      var gs2 = view.worldToScreen(visMin.x, gy);
      ctx.beginPath(); ctx.moveTo(0, gs2.y); ctx.lineTo(v.width, gs2.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 道路：街区分界为次干道，每 3 格为主干道
    for (var rx = bx0; rx <= visMax.x; rx += blockStep) {
      var idx = Math.round(rx / blockStep);
      var majorX = (idx % 3 === 0);
      var sx = view.worldToScreen(rx, visMin.y);
      ctx.strokeStyle = p.routeCasing; ctx.lineWidth = majorX ? 8 : 4;
      ctx.beginPath(); ctx.moveTo(sx.x, 0); ctx.lineTo(sx.x, v.height); ctx.stroke();
      ctx.strokeStyle = majorX ? p.major : p.grid; ctx.lineWidth = majorX ? 4 : 1.5;
      ctx.beginPath(); ctx.moveTo(sx.x, 0); ctx.lineTo(sx.x, v.height); ctx.stroke();
    }
    for (var ry = by0; ry <= visMax.y; ry += blockStep) {
      var idy = Math.round(ry / blockStep);
      var majorY = (idy % 3 === 0);
      var sy = view.worldToScreen(visMin.x, ry);
      ctx.strokeStyle = p.routeCasing; ctx.lineWidth = majorY ? 8 : 4;
      ctx.beginPath(); ctx.moveTo(0, sy.y); ctx.lineTo(v.width, sy.y); ctx.stroke();
      ctx.strokeStyle = majorY ? p.major : p.grid; ctx.lineWidth = majorY ? 4 : 1.5;
      ctx.beginPath(); ctx.moveTo(0, sy.y); ctx.lineTo(v.width, sy.y); ctx.stroke();
    }

    // 少量 POI 点/路口标注
    ctx.textAlign = 'left';
    for (var px = bx0; px <= visMax.x; px += blockStep * 2) {
      for (var py = by0; py <= visMax.y; py += blockStep * 2) {
        var ph = hash(px / blockStep + 11, py / blockStep + 7);
        if (ph > 0.72) {
          var ps = view.worldToScreen(px, py);
          ctx.fillStyle = p.teal;
          ctx.beginPath(); ctx.arc(ps.x, ps.y, 2.5, 0, Math.PI * 2); ctx.fill();
          if (cellPx > 90) {
            ctx.fillStyle = p.muted; ctx.font = mapFont(8, '500');
            ctx.fillText(tr(ph > 0.9 ? '停车场' : '路口'), ps.x + 5, ps.y - 4);
          }
        }
      }
    }
  };

  SimProvider.prototype.drawDataBase = function (ctx, view) {
    var v = view.getView();
    var style = this.style;
    var p = style === 'realistic' ? realPalette() : palette();
    var d = this.data;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, v.width, v.height);

    // 水系
    d.water.forEach(function (f) {
      if (!featureVisible(view, f.bbox)) return;
      if (f.polygon && f.pts.length >= 3) {
        ctx.fillStyle = p.water;
        polygon(ctx, view, f.pts); ctx.fill();
        ctx.strokeStyle = p.waterStroke;
        ctx.lineWidth = style === 'realistic' ? 1.4 : 1;
        ctx.stroke();
      } else {
        ctx.strokeStyle = p.waterStroke;
        ctx.lineWidth = style === 'realistic' ? 6 : 3;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        polyline(ctx, view, f.pts);
      }
    });

    // 公园/绿地
    d.parks.forEach(function (f) {
      if (!featureVisible(view, f.bbox) || f.pts.length < 3) return;
      ctx.fillStyle = p.park;
      polygon(ctx, view, f.pts); ctx.fill();
      if (style === 'realistic') {
        ctx.strokeStyle = p.park; ctx.lineWidth = 1; ctx.stroke();
      }
    });

    // 球场/操场
    d.pitches.forEach(function (f) {
      if (!featureVisible(view, f.bbox) || f.pts.length < 3) return;
      ctx.fillStyle = p.pitch;
      polygon(ctx, view, f.pts); ctx.fill();
      ctx.strokeStyle = p.pitchStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 停车场（面）
    d.parking.forEach(function (f) {
      if (!featureVisible(view, f.bbox) || f.pts.length < 3) return;
      ctx.fillStyle = p.parking;
      polygon(ctx, view, f.pts); ctx.fill();
      ctx.strokeStyle = p.parkingStroke;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    // 建筑：放大到街区级再画，避免糊成一片
    if (v.scale >= (style === 'realistic' ? 0.25 : 0.32)) {
      d.buildings.forEach(function (f) {
        if (!featureVisible(view, f.bbox) || f.pts.length < 3) return;
        ctx.fillStyle = p.building;
        ctx.globalAlpha = style === 'realistic' ? 0.96 : 0.42;
        polygon(ctx, view, f.pts); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.buildingStroke;
        ctx.lineWidth = style === 'realistic' ? 0.8 : 0.55;
        polygon(ctx, view, f.pts); ctx.stroke();
      });
    }

    // 道路：先画外描边，再按等级画芯线；支路在低缩放下隐藏
    var roads = d.roads.filter(function (f) { return v.scale >= roadMinScale(f.class); });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    roads.forEach(function (f) {
      if (!featureVisible(view, f.bbox)) return;
      ctx.strokeStyle = style === 'realistic' ? p.roadCasing : p.bg;
      ctx.lineWidth = roadWidth(f.class, style) + (style === 'realistic' ? 4 : 2);
      polyline(ctx, view, f.pts);
    });
    roads.forEach(function (f) {
      if (!featureVisible(view, f.bbox)) return;
      var major = roadRank(f.class) <= 2;
      ctx.strokeStyle = style === 'realistic'
        ? (major ? p.major : p.road)
        : (major ? p.major : p.muted);
      ctx.lineWidth = roadWidth(f.class, style);
      polyline(ctx, view, f.pts);
    });

    this.drawDataLabels(ctx, view, p, style, roads);

    // 数据署名
    ctx.fillStyle = p.muted;
    ctx.font = mapFont(8);
    ctx.textAlign = 'right';
    ctx.fillText('© OpenStreetMap contributors', v.width - 10, v.height - 38);
  };

  SimProvider.prototype.drawDataLabels = function (ctx, view, p, style, roads) {
    var v = view.getView();
    var count = 0;
    var boxes = [];
    var self = this;

    function overlaps(b) {
      for (var i = 0; i < boxes.length; i++) {
        var o = boxes[i];
        if (b.x - 2 < o.x + o.w && b.x + b.w + 2 > o.x &&
            b.y - 1 < o.y + o.h && b.y + b.h + 1 > o.y) return true;
      }
      return false;
    }
    function label(text, x, y, size, weight, align) {
      if (!text || count >= 20) return false;
      if (text.length > 13) text = text.slice(0, 12) + '…';
      var font = mapFont(size, weight);
      ctx.font = font;
      var w = ctx.measureText ? ctx.measureText(text).width : text.length * size * 0.9;
      var h = size + 2;
      var bx = align === 'left' ? x : (align === 'right' ? x - w : x - w / 2);
      var by = y - h + 2;
      var box = { x: bx, y: by, w: w, h: h };
      if (overlaps(box)) return false;
      boxes.push(box);
      ctx.textAlign = align || 'center';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = p.bg;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = p.text;
      ctx.fillText(text, x, y);
      count++;
      return true;
    }
    function screenMid(pts) {
      var best = null, bestLen = 0;
      for (var i = 1; i < pts.length; i++) {
        var a = view.worldToScreen(pts[i - 1].x, pts[i - 1].y);
        var b = view.worldToScreen(pts[i].x, pts[i].y);
        var len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
        if (len > bestLen) { bestLen = len; best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
      }
      return bestLen >= 90 ? best : null;
    }

    ctx.textBaseline = 'middle';
    roads.forEach(function (f) {
      if (count >= 7 || !f.name) return;
      var rank = roadRank(f.class);
      if (rank > 2 && !(rank === 3 && v.scale > 1.15)) return;
      var m = screenMid(f.pts);
      if (m) label(f.name, m.x, m.y - 4, 9, '600');
    });

    self.data.parks.concat(self.data.water).forEach(function (f) {
      if (count >= 12 || !f.name) return;
      var a = view.worldToScreen(f.bbox.minX, f.bbox.minY);
      var b = view.worldToScreen(f.bbox.maxX, f.bbox.maxY);
      if (Math.abs(b.x - a.x) < 60 && Math.abs(b.y - a.y) < 36) return;
      label(f.name, (a.x + b.x) / 2, (a.y + b.y) / 2, 10, '600');
    });

    // 大型建筑名称（只在放大后显示，避免小字满屏）
    if (v.scale >= 0.8) {
      self.data.buildings.forEach(function (f) {
        if (count >= 16 || !f.name) return;
        var a = view.worldToScreen(f.bbox.minX, f.bbox.minY);
        var b = view.worldToScreen(f.bbox.maxX, f.bbox.maxY);
        if (Math.abs(b.x - a.x) < 44 && Math.abs(b.y - a.y) < 30) return;
        label(f.name, (a.x + b.x) / 2, (a.y + b.y) / 2, 8, '500');
      });
    }

    var typeLabel = {
      parking: '停车场', station: '地铁站', bike_parking: '自行车停放',
      cafe: '咖啡', bank: '银行'
    };
    self.data.pois.forEach(function (poi) {
      if (count >= 18 || v.scale < 0.45 || !typeLabel[poi.type]) return;
      var s = view.worldToScreen(poi.pt.x, poi.pt.y);
      if (s.x < -20 || s.x > v.width + 20 || s.y < -20 || s.y > v.height + 20) return;
      ctx.fillStyle = p.teal;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2, 0, Math.PI * 2); ctx.fill();
      var text = poi.name || tr(typeLabel[poi.type]);
      label(text, s.x + 5, s.y - 4, 8, '500', 'left');
    });
    ctx.textBaseline = 'alphabetic';
  };

  SimProvider.prototype.drawRoute = function (ctx, view, segments, points) {
    if (!points || points.length < 2 || !segments) return;
    var p = palette();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // 先画外描边，再画彩色芯线，复杂底图上更清楚
    ctx.strokeStyle = p.routeCasing; ctx.lineWidth = 9;
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var a = view.worldToScreen(points[seg.fromIdx].x, points[seg.fromIdx].y);
      var b = view.worldToScreen(points[seg.toIdx].x, points[seg.toIdx].y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.lineWidth = 5.5;
    for (var j = 0; j < segments.length; j++) {
      var sg = segments[j];
      var sa = view.worldToScreen(points[sg.fromIdx].x, points[sg.fromIdx].y);
      var sb = view.worldToScreen(points[sg.toIdx].x, points[sg.toIdx].y);
      ctx.strokeStyle = colorHex(sg.color);
      ctx.setLineDash(sg.color === '红' ? [6, 4] : (sg.color === '灰' ? [2, 5] : []));
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // 方向箭头：每 3 段画一个，明确骑行方向
    for (var k = 2; k < segments.length; k += 3) {
      var arrowSeg = segments[k];
      var aa = view.worldToScreen(points[arrowSeg.fromIdx].x, points[arrowSeg.fromIdx].y);
      var ab = view.worldToScreen(points[arrowSeg.toIdx].x, points[arrowSeg.toIdx].y);
      var adx = ab.x - aa.x, ady = ab.y - aa.y;
      if (Math.sqrt(adx * adx + ady * ady) < 18) continue;
      var ang = Math.atan2(ady, adx);
      ctx.save();
      ctx.translate((aa.x + ab.x) / 2, (aa.y + ab.y) / 2);
      ctx.rotate(ang);
      ctx.fillStyle = colorHex(arrowSeg.color);
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3.5); ctx.lineTo(-4, 3.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  };

  // 起点/终点标记：起点=绿色圆+“起”，终点=红色圆+“终”
  SimProvider.prototype.drawStartEnd = function (ctx, view, start, end) {
    function dot(pos, fill, label) {
      var s = view.worldToScreen(pos.x, pos.y);
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = mapFont(10, '700'); ctx.textAlign = 'center';
      ctx.fillText(label, s.x, s.y + 4);
    }
    if (start) dot(start, '#27ae60', '起');
    if (end) dot(end, '#e74c3c', '终');
  };

  SimProvider.prototype.drawUser = function (ctx, view, pos, accuracy) {
    if (!pos) return;
    var s = view.worldToScreen(pos.x, pos.y);
    if (accuracy > 0) {
      var metersPerUnit = (typeof window !== 'undefined' && window.BikeApp && window.BikeApp.Core)
        ? window.BikeApp.Core.KM_PER_UNIT * 1000 : 3;
      var radius = Math.max(12, Math.min(90, (accuracy / metersPerUnit) * view.getView().scale));
      ctx.save();
      ctx.fillStyle = 'rgba(41,128,185,.10)';
      ctx.strokeStyle = 'rgba(41,128,185,.42)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // 蓝点 + 淡蓝光晕，表示"我的位置"
    ctx.save();
    var g = ctx.createRadialGradient(s.x, s.y, 6, s.x, s.y, 34);
    g.addColorStop(0, 'rgba(41,128,185,0.45)');
    g.addColorStop(1, 'rgba(41,128,185,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, 34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2980b9';
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = mapFont(10, '700'); ctx.textAlign = 'center';
    ctx.fillText('我', s.x, s.y + 4);
  };

  SimProvider.prototype.drawBike = function (ctx, view, pos, glow) {
    var s = view.worldToScreen(pos.x, pos.y);
    if (glow) {
      var pulse = 0.92 + 0.08 * Math.sin(Date.now() / 160);
      ctx.save();
      var g = ctx.createRadialGradient(s.x, s.y, 5, s.x, s.y, 42 * pulse);
      g.addColorStop(0, 'rgba(245,197,24,0.85)');
      g.addColorStop(1, 'rgba(245,197,24,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, 42 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#f39c12';
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7d3c00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y - 3, 3, 0, Math.PI * 2); ctx.fill();
  };

  SimProvider.prototype.drawDirection = function (ctx, view, from, to, distanceText) {
    var p = palette();
    var a = view.worldToScreen(from.x, from.y), b = view.worldToScreen(to.x, to.y);
    var dx = b.x - a.x, dy = b.y - a.y;
    var ang = Math.atan2(dy, dx);
    var len = Math.sqrt(dx * dx + dy * dy);
    var ex = a.x + Math.cos(ang) * Math.min(70, len), ey = a.y + Math.sin(ang) * Math.min(70, len);
    ctx.strokeStyle = '#2980b9'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath();
    ctx.fillStyle = '#2980b9'; ctx.fill(); ctx.restore();
    if (distanceText) {
      ctx.fillStyle = p.text; ctx.font = mapFont(11, '700'); ctx.textAlign = 'center';
      ctx.fillText('距你 ' + distanceText, (a.x + b.x) / 2, (a.y + b.y) / 2 - 18);
    }
  };

  SimProvider.prototype.drawLegend = function (ctx, view) {
    var p = palette();
    var x = 12, y = 16;
    var items = [['#f5c518', '快(<3min/km)'], ['#2ecc71', '正常(3-9)'], ['#e74c3c', '慢(>9min/km)'], ['#95a5a6', '静止/无数据']];
    ctx.font = mapFont(10, '600'); ctx.textAlign = 'left';
    items.forEach(function (it) {
      ctx.fillStyle = it[0]; ctx.fillRect(x, y, 16, 12);
      ctx.fillStyle = p.text; ctx.fillText(tr(it[1]), x + 22, y + 11);
      y += 20;
    });
  };

  // 比例尺 + 模拟地图徽标 + 指北针：左下角/右下角
  SimProvider.prototype.drawScaleBar = function (ctx, view) {
    var p = palette();
    var v = view.getView();
    var bar = view.scaleBar();
    var x = 12, y = v.height - 14;
    ctx.strokeStyle = p.text; ctx.fillStyle = p.text;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + bar.px, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + bar.px, y - 5); ctx.lineTo(x + bar.px, y + 5); ctx.stroke();
    ctx.font = mapFont(10); ctx.textAlign = 'center';
    ctx.fillText(bar.meters >= 1000 ? (bar.meters / 1000) + ' 公里' : bar.meters + ' 米', x + bar.px / 2, y + 16);

    // 底图徽标：有离线数据时显示风格 + OSM
    var badge = this.data
      ? (this.style === 'realistic' ? '真实 · OSM' : 'P09 · OSM')
      : tr('模拟地图');
    var bw = this.data ? 72 : 68;
    ctx.fillStyle = p.panel;
    ctx.fillRect(v.width - bw - 10, v.height - 27, bw, 17);
    ctx.fillStyle = p.text; ctx.font = mapFont(9, '600'); ctx.textAlign = 'center';
    ctx.fillText(badge, v.width - bw / 2 - 10, v.height - 15);

    // 指北针
    var nx = v.width - 20, ny = v.height - 70;
    ctx.strokeStyle = p.compass; ctx.fillStyle = p.compass; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(nx, ny + 10); ctx.lineTo(nx, ny - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nx, ny - 10); ctx.lineTo(nx - 4, ny - 3); ctx.lineTo(nx + 4, ny - 3); ctx.closePath(); ctx.fill();
    ctx.font = mapFont(9, '600'); ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny + 20);
  };

  function colorHex(color) {
    return color === '黄' ? '#f5c518' : (color === '绿' ? '#2ecc71' : (color === '红' ? '#e74c3c' : '#95a5a6'));
  }

  var SUPPORTED = ['sim'];
  var PLANNED = ['amap', 'system']; // 后续接入高德地图 / 系统内置地图

  function createProvider(kind, opts) {
    if (kind === 'sim') return new SimProvider(opts);
    if (PLANNED.indexOf(kind) >= 0) {
      throw new Error('地图提供方 "' + kind + '"（高德地图/系统地图）尚未实现，请先用 "sim"；后续接入时实现 ' + INTERFACE_METHODS.join(',') + ' 即可接入。');
    }
    throw new Error('未知地图提供方：' + kind);
  }

  return { createProvider: createProvider, INTERFACE_METHODS: INTERFACE_METHODS, SUPPORTED: SUPPORTED, PLANNED: PLANNED };
});
