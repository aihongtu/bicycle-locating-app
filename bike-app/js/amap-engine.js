/* amap-engine.js — 高德真实地图引擎（DOM 地图）
 * 将 Canvas 模拟地图的接口（centerOn/zoom/draw/onRedraw/onClick）映射到高德 AMap：
 *  - 模拟平面坐标 (x,y) 以 (500,400) 为原点、1单位≈KM_PER_UNIT 公里，换算成以 baseGeo 为中心的经纬度
 *  - 真实定位（Geolocation）作为"你"的位置
 * 若高德不可用（离线/未配置/加载失败），由页面回退到 Canvas 模拟地图。UMD。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.AmapEngine = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIM_CX = 500, SIM_CY = 400;   // 模拟坐标原点（对应 baseGeo）
  var M_PER_UNIT = 3;                // 1 模拟单位 ≈ 3 米（与 Core.KM_PER_UNIT=0.003 一致）

  // 静态：高德 JS API 加载状态
  var _loaded = false, _loading = false, _callbacks = [];
  // 高德脚本加载超时（毫秒）：弱网/蜂窝下脚本可能长时间不返回，超时移除脚本并回退 sim，避免页面一直等待
  var AMAP_LOAD_TIMEOUT_MS = 8000;

  function load(cb) {
    if (typeof window === 'undefined' || !window.BikeApp || !window.BikeApp.AMapConfig) { if (cb) cb(false); return; }
    if (!window.BikeApp.AMapConfig.key || !window.BikeApp.AMapConfig.securityJsCode) { if (cb) cb(false); return; }
    if (window.AMap) { _loaded = true; if (cb) cb(true); return; }
    if (cb) _callbacks.push(cb);
    if (_loading) return;
    _loading = true;
    var cfg = window.BikeApp.AMapConfig;
    window._AMapSecurityConfig = { securityJsCode: cfg.securityJsCode };
    var s = document.createElement('script');
    s.src = 'https://webapi.amap.com/maps?v=2.0&key=' + cfg.key;
    s.async = true;
    var timer = null;
    s.onload = function () { if (timer) clearTimeout(timer); _loaded = true; _loading = false; fire(true); };
    s.onerror = function () { if (timer) clearTimeout(timer); _loading = false; fire(false); };
    timer = setTimeout(function () {
      if (!_loaded && _loading) {
        _loading = false;
        try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) {}
        fire(false); // 超时回退到 sim 地图，避免页面一直等待
      }
    }, AMAP_LOAD_TIMEOUT_MS);
    document.head.appendChild(s);
  }
  function fire(ok) { var q = _callbacks; _callbacks = []; q.forEach(function (c) { try { c(ok); } catch (e) { if (window.console) console.error('[AmapEngine] load callback error', e); } }); }
  function canUse() { return typeof window !== 'undefined' && window.AMap ? true : false; }

  // 经纬度工具
  function geoFromSim(base, x, y) {
    var dx = (x - SIM_CX) * M_PER_UNIT;        // 东向米
    var dy = (y - SIM_CY) * M_PER_UNIT;        // 南向米（模拟 y 向下增大）
    var lat = base.lat - dy / 111320;
    var lng = base.lng + dx / (111320 * Math.cos(base.lat * Math.PI / 180));
    return { lng: lng, lat: lat };
  }
  function simFromGeo(base, lng, lat) {
    var latR = base.lat * Math.PI / 180;
    var dx = (lng - base.lng) * 111320 * Math.cos(latR);   // 东向米
    var dy = (base.lat - lat) * 111320;                    // 北向米，换算为模拟向南
    return { x: SIM_CX + dx / M_PER_UNIT, y: SIM_CY + dy / M_PER_UNIT };
  }
  function haversine(a, b) {
    var R = 6371000, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  var COLOR_HEX = { '黄': '#f5c518', '绿': '#2ecc71', '红': '#e74c3c' };

  function AmapEngine(container, opts) {
    opts = opts || {};
    this.el = container;            // 放置高德地图的容器（div）
    this.base = opts.base || { lng: 121.4737, lat: 31.2304 }; // 上海，缺省
    this.zoom = opts.zoom || 15;
    this._polylines = [];
    this._markers = [];
    this._overlays = [];
    this._glowEl = null;
    this._callbacks = [];
    this._userGeo = this.base;

    // 创建地图
    this.map = new AMap.Map(container, {
      zoom: this.zoom,
      center: [this.base.lng, this.base.lat],
      viewMode: '2D',
      resizeEnable: true,
      showLabel: true
    });
    var self = this;
    // 容器刚插入时高德可能读到 0 尺寸，延迟 resize 使其正常渲染
    setTimeout(function () { try { self.map.resize(); } catch (e) {} }, 300);
    var self = this;
    // 移动/缩放后触发重绘回调（供页面刷新叠加层）
    this.map.on('moveend', function () { self._fire('redraw'); });
    this.map.on('zoomend', function () { self._fire('redraw'); });
    // 地图点击 → 转模拟坐标回传
    this.map.on('click', function (e) {
      var geo = { lng: e.lnglat.getLng(), lat: e.lnglat.getLat() };
      var p = simFromGeo(self.base, geo.lng, geo.lat);
      self._fire('click', p);
    });
  }

  AmapEngine.prototype.on = function (ev, cb) { this._callbacks.push({ ev: ev, cb: cb }); };
  AmapEngine.prototype._fire = function (ev, data) {
    for (var i = 0; i < this._callbacks.length; i++) if (this._callbacks[i].ev === ev) this._callbacks[i].cb(data);
  };
  AmapEngine.prototype.onRedraw = function (cb) { this.on('redraw', cb); };
  AmapEngine.prototype.onClick = function (cb) { this.on('click', cb); };

  AmapEngine.prototype.setUserGeo = function (geo) { this._userGeo = geo; this.base = geo; };
  AmapEngine.prototype.getUserGeo = function () { return this._userGeo; };

  // 模拟坐标接口（与 Canvas MapEngine 对齐）
  AmapEngine.prototype.centerOn = function (x, y) { this.map.setCenter([geoFromSim(this.base, x, y).lng, geoFromSim(this.base, x, y).lat]); };
  AmapEngine.prototype.zoomIn = function () { this.map.zoomIn(); };
  AmapEngine.prototype.zoomOut = function () { this.map.zoomOut(); };

  AmapEngine.prototype.clear = function () { this._clearLayers(); };

  AmapEngine.prototype._clearLayers = function () {
    var self = this;
    this._polylines.forEach(function (p) { self.map.remove(p); }); this._polylines = [];
    this._markers.forEach(function (m) { self.map.remove(m); }); this._markers = [];
    if (this._glowEl) { this._glowEl.parentNode && this._glowEl.parentNode.removeChild(this._glowEl); this._glowEl = null; }
  };

  AmapEngine.prototype.drawBase = function () { /* 高德底图本身即为底图 */ };

  AmapEngine.prototype.drawRoute = function (segments, points) {
    if (!points || points.length < 2 || !segments) return;
    var self = this;
    segments.forEach(function (seg) {
      var a = geoFromSim(self.base, points[seg.fromIdx].x, points[seg.fromIdx].y);
      var b = geoFromSim(self.base, points[seg.toIdx].x, points[seg.toIdx].y);
      var pl = new AMap.Polyline({
        path: [[a.lng, a.lat], [b.lng, b.lat]],
        strokeColor: COLOR_HEX[seg.color] || '#2ecc71',
        strokeWeight: 6,
        strokeStyle: 'solid',
        lineJoin: 'round'
      });
      self.map.add(pl); self._polylines.push(pl);
    });
  };

  AmapEngine.prototype.drawBike = function (pos, glow) {
    var self = this;
    var geo = geoFromSim(this.base, pos.x, pos.y);
    var content = document.createElement('div');
    content.className = 'amap-bike' + (glow ? ' glow' : '');
    content.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="m6 16 4-8 4 8H6m4-8h4m1-3h3"/></svg>';
    var m = new AMap.Marker({ position: [geo.lng, geo.lat], content: content, anchor: 'center', zIndex: 20 });
    this.map.add(m); this._markers.push(m);
    m.on('click', function () { self._fire('bikeclick', { x: pos.x, y: pos.y }); });
  };

  // 起点/终点标记（加入 _markers，随 clear 一起清理）
  AmapEngine.prototype.drawStartEnd = function (start, end) {
    var self = this;
    if (start) {
      var sg = geoFromSim(this.base, start.x, start.y);
      var sc = document.createElement('div');
      sc.className = 'amap-se start'; sc.innerHTML = '起';
      var sm = new AMap.Marker({ position: [sg.lng, sg.lat], content: sc, anchor: 'center', zIndex: 19 });
      this.map.add(sm); this._markers.push(sm);
    }
    if (end) {
      var eg = geoFromSim(this.base, end.x, end.y);
      var ec = document.createElement('div');
      ec.className = 'amap-se end'; ec.innerHTML = '终';
      var em = new AMap.Marker({ position: [eg.lng, eg.lat], content: ec, anchor: 'center', zIndex: 19 });
      this.map.add(em); this._markers.push(em);
    }
  };

  // "我的位置"标记（蓝点 + 光晕），随 clear 一起清理
  AmapEngine.prototype.drawUser = function () {
    var g = this._userGeo || this.base;
    var content = document.createElement('div');
    content.className = 'amap-user';
    var m = new AMap.Marker({ position: [g.lng, g.lat], content: content, anchor: 'center', zIndex: 30 });
    this.map.add(m); this._markers.push(m);
  };

  AmapEngine.prototype.drawDirection = function (from, to, distanceText) {
    var self = this;
    var a = geoFromSim(this.base, from.x, from.y), b = geoFromSim(this.base, to.x, to.y);
    var pl = new AMap.Polyline({ path: [[a.lng, a.lat], [b.lng, b.lat]], strokeColor: '#2980b9', strokeWeight: 3, lineStyle: 'dashed' });
    this.map.add(pl); this._polylines.push(pl);
    // 文字浮层
    var lbl = document.createElement('div');
    lbl.className = 'amap-label';
    lbl.textContent = '距你 ' + distanceText;
    lbl.style.position = 'absolute';
    var overlay = new AMap.Marker({ position: [a.lng, a.lat], content: lbl, anchor: 'bottom-left', zIndex: 15 });
    this.map.add(overlay); this._markers.push(overlay);
  };

  AmapEngine.prototype.drawLegend = function () {
    if (this._legendEl) return; // 幂等：只创建一次
    var el = document.createElement('div');
    el.className = 'amap-legend';
    var items = [['#f5c518', '快(<3min/km)'], ['#2ecc71', '正常(3-9)'], ['#e74c3c', '慢(>9min/km)']];
    items.forEach(function (it) {
      var row = document.createElement('div'); row.className = 'amap-legend-row';
      var c = document.createElement('span'); c.className = 'amap-legend-swatch'; c.style.background = it[0];
      var t = document.createElement('span'); t.textContent = it[1];
      row.appendChild(c); row.appendChild(t); el.appendChild(row);
    });
    this.el.appendChild(el);
    this._legendEl = el;
  };

  // 比例尺：基于高德真实像素<->经纬度换算，选取"漂亮"米数，长度与实际距离严格一致。
  // （高德 v2.0 无 AMap.Scale 控件，故自画真实换算的比例尺）
  AmapEngine.prototype.drawScaleBar = function () {
    if (!this._scaleEl) {
      var el = document.createElement('div');
      el.className = 'amap-scale';
      el.innerHTML = '<span class="amap-scale-line"></span><span class="amap-scale-text"></span>';
      this.el.appendChild(el); this._scaleEl = el;
    }
    var self = this;
    var update = function () {
      var targetPx = 64;
      var c = self.map.getCenter();
      var p1 = self.map.lngLatToPixel(c);
      var g1 = self.map.pixelToLngLat(p1);
      var g2 = self.map.pixelToLngLat({ x: p1.x + targetPx, y: p1.y });
      var metersPerPx = haversine(g1, g2) / targetPx;
      if (!isFinite(metersPerPx) || metersPerPx <= 0) return;
      var nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
      var best = nice[0], bestDiff = Infinity;
      for (var i = 0; i < nice.length; i++) {
        var diff = Math.abs(nice[i] / metersPerPx - targetPx);
        if (diff < bestDiff) { bestDiff = diff; best = nice[i]; }
      }
      var barPx = best / metersPerPx;
      var line = self._scaleEl.querySelector('.amap-scale-line');
      var txt = self._scaleEl.querySelector('.amap-scale-text');
      if (line) line.style.width = Math.max(20, barPx) + 'px';
      if (txt) txt.textContent = best >= 1000 ? (best / 1000) + ' 公里' : best + ' 米';
    };
    update();
    this.map.on('zoomend', update); this.map.on('moveend', update);
  };

  return {
    load: load, canUse: canUse, AMAP_LOAD_TIMEOUT_MS: AMAP_LOAD_TIMEOUT_MS,
    geoFromSim: geoFromSim, simFromGeo: simFromGeo, haversine: haversine,
    AmapEngine: AmapEngine
  };
});
