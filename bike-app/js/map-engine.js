/* map-engine.js — 地图引擎控制器：视口变换(MapView) + 绘制(MapProvider) + 交互(拖拽/缩放)。
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
      minScale: opts.minScale || 0.3, maxScale: opts.maxScale || 4
    });
    this.provider = MapProvider.createProvider(opts.provider || 'sim');
    this._drag = null;
    this._lastDragMoved = false;
    this._attachInteraction();
  }

  MapEngine.prototype.clear = function () { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); };

  MapEngine.prototype.drawBase = function () { this.provider.drawBase(this.ctx, this.view); };
  MapEngine.prototype.drawRoute = function (segments, points) { this.provider.drawRoute(this.ctx, this.view, segments, points); };
  MapEngine.prototype.drawBike = function (pos, glow) { this.provider.drawBike(this.ctx, this.view, pos, glow); };
  MapEngine.prototype.drawDirection = function (from, to, text) { this.provider.drawDirection(this.ctx, this.view, from, to, text); };
  MapEngine.prototype.drawLegend = function () { this.provider.drawLegend(this.ctx, this.view); };
  MapEngine.prototype.drawScaleBar = function () { this.provider.drawScaleBar(this.ctx, this.view); };
  MapEngine.prototype.drawStartEnd = function (start, end) { this.provider.drawStartEnd(this.ctx, this.view, start, end); };
  MapEngine.prototype.drawUser = function () { this.provider.drawUser(this.ctx, this.view, this._userGeo); };
  MapEngine.prototype.setUserGeo = function (geo) { this._userGeo = geo; };
  MapEngine.prototype.getUserGeo = function () { return this._userGeo; };

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
  MapEngine.prototype.isPointVisible = function (wx, wy) { return this.view.isVisible(wx, wy, 10); };

  // 交互：拖拽平移 + 滚轮缩放；拖拽结束后抑制页面点击
  MapEngine.prototype._attachInteraction = function () {
    var self = this;
    var canvas = this.canvas;

    function toCanvasPos(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height)
      };
    }

    canvas.addEventListener('pointerdown', function (e) {
      self._drag = { sx: e.clientX, sy: e.clientY, ox: 0, oy: 0, moved: false };
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!self._drag) return;
      var dx = e.clientX - self._drag.sx, dy = e.clientY - self._drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) self._drag.moved = true;
      if (self._drag.moved) { self.view.panPx(dx - self._drag.ox, dy - self._drag.oy); self._drag.ox = dx; self._drag.oy = dy; self._redrawHook && self._redrawHook(); }
    });
    canvas.addEventListener('pointerup', function () {
      if (self._drag) { self._lastDragMoved = self._drag.moved; self._drag = null; }
    });
    canvas.addEventListener('pointerleave', function () { self._drag = null; });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = toCanvasPos(e);
      var factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      self.view.zoomAt(factor, p.x, p.y);
      self._redrawHook && self._redrawHook();
    }, { passive: false });

    // 拖拽结束后抑制一次点击（避免误触页面按钮判定）
    canvas.addEventListener('click', function (e) {
      if (self._lastDragMoved) { self._lastDragMoved = false; e.stopImmediatePropagation(); }
    });
  };

  MapEngine.prototype.onRedraw = function (fn) { this._redrawHook = fn; };

  window.BikeApp.MapEngine = MapEngine;
})();
