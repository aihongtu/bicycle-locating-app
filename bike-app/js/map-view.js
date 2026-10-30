/* map-view.js — 地图视口模型：世界坐标<->屏幕坐标、动态边界、平移钳制、缩放、比例尺。
 * 纯逻辑（不依赖 Canvas），可在 Node 测试；MapEngine 据此渲染。UMD。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./core')); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.MapView = factory(root.BikeApp.Core); }
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function createView(opts) {
    opts = opts || {};
    var width = opts.width || 340;
    var height = opts.height || 420;
    var minX = (opts.minX != null) ? opts.minX : 0;
    var minY = (opts.minY != null) ? opts.minY : 0;
    var maxX = (opts.maxX != null) ? opts.maxX : (minX + (opts.worldW || 1000));
    var maxY = (opts.maxY != null) ? opts.maxY : (minY + (opts.worldH || 800));
    var minScale = opts.minScale || 0.3;
    var maxScale = opts.maxScale || 4;
    var scale = opts.scale || 1;
    var offsetX = 0, offsetY = 0;

    function ensureBounds() {
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        minX = 0; minY = 0; maxX = 1000; maxY = 800;
      }
      if (maxX <= minX) maxX = minX + 1;
      if (maxY <= minY) maxY = minY + 1;
    }

    function clampOffset() {
      function clampAxis(o, size, lo, hi) {
        var max = hi - size / scale;
        if (max < lo) return (lo + hi) / 2 - size / (2 * scale);
        return clamp(o, lo, max);
      }
      offsetX = clampAxis(offsetX, width, minX, maxX);
      offsetY = clampAxis(offsetY, height, minY, maxY);
    }

    function worldToScreen(wx, wy) { return { x: (wx - offsetX) * scale, y: (wy - offsetY) * scale }; }
    function screenToWorld(sx, sy) { return { x: sx / scale + offsetX, y: sy / scale + offsetY }; }

    function centerOn(wx, wy) {
      offsetX = wx - width / (2 * scale);
      offsetY = wy - height / (2 * scale);
      clampOffset();
    }
    function panPx(dxPx, dyPx) {
      offsetX -= dxPx / scale;
      offsetY -= dyPx / scale;
      clampOffset();
    }
    function zoomAt(factor, sx, sy) {
      var w = screenToWorld(sx, sy);
      scale = clamp(scale * factor, minScale, maxScale);
      offsetX = w.x - sx / scale;
      offsetY = w.y - sy / scale;
      clampOffset();
    }
    function zoomBy(factor) { scale = clamp(scale * factor, minScale, maxScale); clampOffset(); }

    function isVisible(wx, wy, margin) {
      margin = margin || 0;
      var s = worldToScreen(wx, wy);
      return s.x >= -margin && s.x <= width + margin && s.y >= -margin && s.y <= height + margin;
    }

    // 尺寸变化时保持当前中心点，避免切换 tab / resize 后地图跳走。
    function setSize(w, h) {
      w = Math.max(1, w || 1);
      h = Math.max(1, h || 1);
      var cx = offsetX + width / (2 * scale);
      var cy = offsetY + height / (2 * scale);
      width = w; height = h;
      offsetX = cx - width / (2 * scale);
      offsetY = cy - height / (2 * scale);
      clampOffset();
    }

    function setBounds(nx, ny, xx, yy) {
      if (!isFinite(nx) || !isFinite(ny) || !isFinite(xx) || !isFinite(yy)) return false;
      if (xx <= nx) xx = nx + 1;
      if (yy <= ny) yy = ny + 1;
      minX = nx; minY = ny; maxX = xx; maxY = yy;
      clampOffset();
      return true;
    }

    function getBounds() { return { minX: minX, minY: minY, maxX: maxX, maxY: maxY }; }

    // 只扩展边界，不改变当前缩放/中心；用于路线变长时避免被裁掉。
    function setBoundsFromPoints(points, paddingPx) {
      if (!points || !points.length) return false;
      var minPx = Infinity, minPy = Infinity, maxPx = -Infinity, maxPy = -Infinity;
      points.forEach(function (p) {
        if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
        if (p.x < minPx) minPx = p.x;
        if (p.y < minPy) minPy = p.y;
        if (p.x > maxPx) maxPx = p.x;
        if (p.y > maxPy) maxPy = p.y;
      });
      if (!isFinite(minPx) || !isFinite(minPy)) return false;
      var pad = (paddingPx || 0) / scale;
      // 内容很小时也要留出至少 1.6 屏的可平移范围，否则 clamp 会把视图锁死、无法拖拽。
      var cx = (minPx + maxPx) / 2;
      var cy = (minPy + maxPy) / 2;
      var spanX = Math.max(maxPx - minPx, (width / scale) * 1.6);
      var spanY = Math.max(maxPy - minPy, (height / scale) * 1.6);
      minPx = cx - spanX / 2; maxPx = cx + spanX / 2;
      minPy = cy - spanY / 2; maxPy = cy + spanY / 2;
      var marginX = Math.max(spanX * 0.08, pad);
      var marginY = Math.max(spanY * 0.08, pad);
      return setBounds(minPx - marginX, minPy - marginY, maxPx + marginX, maxPy + marginY);
    }

    // 自动缩放到能看全所有点，并留出 padding 像素边距。
    function fitBounds(points, paddingPx) {
      if (!points || !points.length) return false;
      var minPx = Infinity, minPy = Infinity, maxPx = -Infinity, maxPy = -Infinity;
      points.forEach(function (p) {
        if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
        if (p.x < minPx) minPx = p.x;
        if (p.y < minPy) minPy = p.y;
        if (p.x > maxPx) maxPx = p.x;
        if (p.y > maxPy) maxPy = p.y;
      });
      if (!isFinite(minPx) || !isFinite(minPy)) return false;

      var pad = (paddingPx == null) ? 28 : paddingPx;
      var spanX = Math.max(maxPx - minPx, 1);
      var spanY = Math.max(maxPy - minPy, 1);
      var availW = Math.max(1, width - pad * 2);
      var availH = Math.max(1, height - pad * 2);
      var nextScale = Math.min(availW / spanX, availH / spanY, maxScale);
      nextScale = clamp(nextScale, minScale, maxScale);

      // 同样保证至少有 1.6 屏的可平移范围，避免 fit 后视图被 clamp 锁死。
      var cx = (minPx + maxPx) / 2;
      var cy = (minPy + maxPy) / 2;
      var viewSpanX = Math.max(spanX, (width / nextScale) * 1.6);
      var viewSpanY = Math.max(spanY, (height / nextScale) * 1.6);
      var marginX = Math.max(viewSpanX * 0.08, pad / nextScale);
      var marginY = Math.max(viewSpanY * 0.08, pad / nextScale);
      minX = cx - viewSpanX / 2 - marginX; maxX = cx + viewSpanX / 2 + marginX;
      minY = cy - viewSpanY / 2 - marginY; maxY = cy + viewSpanY / 2 + marginY;
      scale = nextScale;
      centerOn(cx, cy);
      return true;
    }

    // 比例尺：取"漂亮"长度（1/2/5/10/...米），像素最接近 70px
    function scaleBar() {
      var metersPerUnit = Core.KM_PER_UNIT * 1000;
      var nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
      var best = nice[0], bestDiff = Infinity;
      for (var i = 0; i < nice.length; i++) {
        var px = nice[i] / metersPerUnit * scale;
        var diff = Math.abs(px - 70);
        if (diff < bestDiff) { bestDiff = diff; best = nice[i]; }
      }
      return { meters: best, px: best / metersPerUnit * scale };
    }

    function getView() {
      return {
        width: width, height: height,
        worldW: maxX - minX, worldH: maxY - minY,
        minX: minX, minY: minY, maxX: maxX, maxY: maxY,
        scale: scale, offsetX: offsetX, offsetY: offsetY
      };
    }

    ensureBounds();
    clampOffset();

    return {
      worldToScreen: worldToScreen, screenToWorld: screenToWorld,
      centerOn: centerOn, panPx: panPx, zoomAt: zoomAt, zoomBy: zoomBy,
      setSize: setSize, setBounds: setBounds, getBounds: getBounds,
      setBoundsFromPoints: setBoundsFromPoints, fitBounds: fitBounds,
      isVisible: isVisible, scaleBar: scaleBar, getView: getView
    };
  }

  return { createView: createView, clamp: clamp };
});
