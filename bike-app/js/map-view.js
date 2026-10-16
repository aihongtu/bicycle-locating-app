/* map-view.js — 地图视口模型：世界坐标<->屏幕坐标、平移钳制、缩放、比例尺。
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
    var worldW = opts.worldW || 1000;
    var worldH = opts.worldH || 800;
    var minScale = opts.minScale || 0.3;
    var maxScale = opts.maxScale || 4;
    var scale = opts.scale || 1;
    var offsetX = 0, offsetY = 0;

    function clampOffset() {
      function clampAxis(o, size) {
        var min = 0, max = worldW - size / scale;
        if (max < min) return (worldW - size / scale) / 2;
        return clamp(o, min, max);
      }
      offsetX = clampAxis(offsetX, width);
      offsetY = clampAxis(offsetY, height);
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

    // 比例尺：取"漂亮"长度（1/2/5/10/...米），像素最接近 70px
    function scaleBar() {
      var metersPerUnit = Core.KM_PER_UNIT * 1000;
      var nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
      var best = nice[0], bestDiff = Infinity;
      for (var i = 0; i < nice.length; i++) {
        var px = nice[i] / metersPerUnit * scale;
        var diff = Math.abs(px - 70);
        if (diff < bestDiff) { bestDiff = diff; best = nice[i]; }
      }
      return { meters: best, px: best / metersPerUnit * scale };
    }

    function getView() {
      return { width: width, height: height, worldW: worldW, worldH: worldH, scale: scale, offsetX: offsetX, offsetY: offsetY };
    }

    clampOffset();

    return {
      worldToScreen: worldToScreen, screenToWorld: screenToWorld,
      centerOn: centerOn, panPx: panPx, zoomAt: zoomAt, zoomBy: zoomBy,
      isVisible: isVisible, scaleBar: scaleBar, getView: getView
    };
  }

  return { createView: createView, clamp: clamp };
});
