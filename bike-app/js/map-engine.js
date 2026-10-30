/* map-engine.js — 地图引擎控制器：视口变换(MapView) + 绘制(MapProvider) + 交互(拖拽/缩放/触摸)。
 * 页面只调用引擎 API，底层地图(provider)可替换为高德/系统地图。 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.BikeApp) return;
  var MapView = window.BikeApp.MapView;
  var MapProvider = window.BikeApp.MapProvider;

  function MapEngine(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    opts = opts || {};
    this.view = MapView.createView({
      width: canvas.width, height: canvas.height,
      worldW: opts.worldW || 1000, worldH: opts.worldH || 800,
      minScale: opts.minScale || 0.01, maxScale: opts.maxScale || 8
    });
    var self = this;
    this.provider = MapProvider.createProvider(opts.provider || 'sim', opts);
    if (this.provider && this.provider.onReady !== undefined) {
      this.provider.onReady = function () { self._requestRedraw(); };
    }
    this._drag = null;
    this._pointers = {};
    this._pinch = null;
    this._lastDragMoved = false;
    this._lastTapAt = 0;
    this._lastTapPos = null;
    this._userAccuracy = 0;
    this._rafPending = false;
    this._attachInteraction();

    window.addEventListener('resize', function () { self.resize(); });
    window.addEventListener('bikeapp:theme', function () { self._requestRedraw(); });
  }

  // 用 rAF 合并高频重绘，避免拖拽时每个 pointermove 都重画整张底图。
  MapEngine.prototype._requestRedraw = function () {
    if (this._rafPending) return;
    this._rafPending = true;
    var self = this;
    var schedule = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame
      : function (fn) { setTimeout(fn, 16); };
    schedule(function () {
      self._rafPending = false;
      if (self._redrawHook) self._redrawHook();
    });
  };

  // 按 CSS 尺寸 × DPR 设置画布，保证高清屏上线条/文字清晰。
  MapEngine.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    // 页面在非当前 Tab 时 display:none，尺寸为 0；等切回可见时再按真实尺寸重算。
    if (!rect.width || !rect.height) return;
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.max(1, Math.round(rect.height));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view.setSize(cssW, cssH);
    this._requestRedraw();
  };

  MapEngine.prototype.clear = function () {
    var v = this.view.getView();
    this.ctx.clearRect(0, 0, v.width, v.height);
  };

  MapEngine.prototype.drawBase = function () { this.provider.drawBase(this.ctx, this.view); };
  MapEngine.prototype.drawRoute = function (segments, points) { this.provider.drawRoute(this.ctx, this.view, segments, points); };
  MapEngine.prototype.drawBike = function (pos, glow) { this.provider.drawBike(this.ctx, this.view, pos, glow); };
  MapEngine.prototype.drawDirection = function (from, to, text) { this.provider.drawDirection(this.ctx, this.view, from, to, text); };
  MapEngine.prototype.drawLegend = function () { this.provider.drawLegend(this.ctx, this.view); };
  MapEngine.prototype.drawScaleBar = function () { this.provider.drawScaleBar(this.ctx, this.view); };
  MapEngine.prototype.drawStartEnd = function (start, end) { this.provider.drawStartEnd(this.ctx, this.view, start, end); };
  MapEngine.prototype.drawUser = function () { this.provider.drawUser(this.ctx, this.view, this._userGeo, this._userAccuracy); };
  MapEngine.prototype.setUserGeo = function (geo) { this._userGeo = geo; };
  MapEngine.prototype.getUserGeo = function () { return this._userGeo; };
  MapEngine.prototype.setUserAccuracy = function (meters) { this._userAccuracy = isFinite(meters) ? meters : 0; };
  MapEngine.prototype.setMapStyle = function (style) {
    if (this.provider && this.provider.setStyle) this.provider.setStyle(style);
    this._requestRedraw();
  };
  MapEngine.prototype.getMapStyle = function () { return (this.provider && this.provider.style) || 'p09'; };
  MapEngine.prototype.hasMapData = function () {
    return !!(this.provider && this.provider.hasData && this.provider.hasData());
  };

  // 视口操作（供页面/按钮调用）
  MapEngine.prototype.centerOn = function (wx, wy) { this.view.centerOn(wx, wy); };
  MapEngine.prototype.panPx = function (dx, dy) { this.view.panPx(dx, dy); };
  MapEngine.prototype.zoomAt = function (factor, sx, sy) { this.view.zoomAt(factor, sx, sy); };
  MapEngine.prototype.zoomIn = function () {
    var v = this.view.getView(); this.view.zoomAt(1.4, v.width / 2, v.height / 2);
  };
  MapEngine.prototype.zoomOut = function () {
    var v = this.view.getView(); this.view.zoomAt(1 / 1.4, v.width / 2, v.height / 2);
  };
  MapEngine.prototype.setBounds = function (minX, minY, maxX, maxY) { return this.view.setBounds(minX, minY, maxX, maxY); };
  MapEngine.prototype.getBounds = function () { return this.view.getBounds(); };
  MapEngine.prototype.setBoundsFromPoints = function (points, padding) { return this.view.setBoundsFromPoints(points, padding); };
  MapEngine.prototype.fitBounds = function (points, padding) { return this.view.fitBounds(points, padding); };
  MapEngine.prototype.isPointVisible = function (wx, wy) { return this.view.isVisible(wx, wy, 10); };

  // 交互：单指/鼠标拖拽 + 滚轮/双指缩放 + 双击放大。
  MapEngine.prototype._attachInteraction = function () {
    var self = this;
    var canvas = this.canvas;

    function toCanvasPos(e) {
      var r = canvas.getBoundingClientRect();
      var v = self.view.getView();
      return {
        x: (e.clientX - r.left) * (v.width / (r.width || 1)),
        y: (e.clientY - r.top) * (v.height / (r.height || 1))
      };
    }

    function pointerList() {
      return Object.keys(self._pointers).map(function (k) { return self._pointers[k]; });
    }
    function pinchState() {
      var pts = pointerList();
      if (pts.length < 2) return null;
      var a = pts[0], b = pts[1];
      var dx = b.x - a.x, dy = b.y - a.y;
      return {
        dist: Math.sqrt(dx * dx + dy * dy) || 1,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      };
    }

    canvas.addEventListener('pointerdown', function (e) {
      self._lastDragMoved = false;
      try {
        if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      } catch (err) { /* 某些浏览器/触控场景会抛错，不能因此中断拖拽 */ }
      var p = toCanvasPos(e);
      self._pointers[e.pointerId] = { x: p.x, y: p.y, sx: e.clientX, sy: e.clientY };
      if (pointerList().length >= 2) {
        self._pinch = pinchState();
        self._drag = null;
      } else {
        self._drag = { sx: e.clientX, sy: e.clientY, ox: 0, oy: 0, moved: false };
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!self._pointers[e.pointerId]) return;
      var p = toCanvasPos(e);
      self._pointers[e.pointerId].x = p.x;
      self._pointers[e.pointerId].y = p.y;

      if (self._pinch && pointerList().length >= 2) {
        var next = pinchState();
        if (next) {
          var factor = next.dist / self._pinch.dist;
          self.view.zoomAt(factor, next.mid.x, next.mid.y);
          self.view.panPx(next.mid.x - self._pinch.mid.x, next.mid.y - self._pinch.mid.y);
          self._pinch = next;
          self._lastDragMoved = true;
          self._requestRedraw();
        }
        return;
      }

      if (!self._drag) return;
      var dx = e.clientX - self._drag.sx, dy = e.clientY - self._drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) self._drag.moved = true;
      if (self._drag.moved) {
        self.view.panPx(dx - self._drag.ox, dy - self._drag.oy);
        self._drag.ox = dx; self._drag.oy = dy;
        self._lastDragMoved = true;
        self._requestRedraw();
      }
    });

    function endPointer(e) {
      var wasDrag = self._drag && self._drag.moved;
      delete self._pointers[e.pointerId];
      if (pointerList().length < 2) self._pinch = null;
      if (pointerList().length === 0) self._drag = null;

      // 双击放大（两次点击间隔 < 320ms 且位移 < 24px）
      if (!wasDrag && !self._lastDragMoved) {
        var now = Date.now();
        var pos = toCanvasPos(e);
        if (self._lastTapAt && now - self._lastTapAt < 320 && self._lastTapPos &&
            Math.abs(pos.x - self._lastTapPos.x) < 24 && Math.abs(pos.y - self._lastTapPos.y) < 24) {
          self.view.zoomAt(1.6, pos.x, pos.y);
          self._lastTapAt = 0; self._lastTapPos = null;
          self._requestRedraw();
        } else {
          self._lastTapAt = now; self._lastTapPos = pos;
        }
      }
    }

    canvas.addEventListener('pointerup', function (e) {
      self._lastDragMoved = (self._drag && self._drag.moved) || !!self._pinch;
      endPointer(e);
    });
    canvas.addEventListener('pointercancel', function (e) {
      delete self._pointers[e.pointerId];
      if (pointerList().length < 2) self._pinch = null;
      if (pointerList().length === 0) self._drag = null;
    });
    canvas.addEventListener('pointerleave', function () {
      if (self._drag) self._lastDragMoved = self._drag.moved;
      self._drag = null;
      self._pinch = null;
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = toCanvasPos(e);
      var factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      self.view.zoomAt(factor, p.x, p.y);
      self._requestRedraw();
    }, { passive: false });

    // 拖拽/捏合结束后抑制一次点击，避免误触页面按钮判定
    canvas.addEventListener('click', function (e) {
      if (self._lastDragMoved) { self._lastDragMoved = false; e.stopImmediatePropagation(); }
    });

    // 键盘无障碍：方向键平移，+/- 缩放
    canvas.addEventListener('keydown', function (e) {
      var v = self.view.getView();
      var step = 40, handled = true;
      if (e.key === 'ArrowLeft') self.view.panPx(-step, 0);
      else if (e.key === 'ArrowRight') self.view.panPx(step, 0);
      else if (e.key === 'ArrowUp') self.view.panPx(0, -step);
      else if (e.key === 'ArrowDown') self.view.panPx(0, step);
      else if (e.key === '+' || e.key === '=') self.view.zoomAt(1.2, v.width / 2, v.height / 2);
      else if (e.key === '-' || e.key === '_') self.view.zoomAt(1 / 1.2, v.width / 2, v.height / 2);
      else handled = false;
      if (handled) {
        e.preventDefault();
        self._requestRedraw();
      }
    });
  };

  MapEngine.prototype.onRedraw = function (fn) { this._redrawHook = fn; };

  window.BikeApp.MapEngine = MapEngine;
})();
