/* pages/ride.js — 模块2 骑行记录：
 *  - 实时记录真实 GPS 轨迹（navigator.geolocation.watchPosition），生成今日骑行记录（分色路线/汇总/卡路里）
 *  - 只读展示今日已保存记录；地图用高德真实地图（若可用），否则回退 Canvas 模拟地图 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.BikeApp) return;
  var Core = window.BikeApp.Core, ui = window.BikeApp.ui, el = ui.el;
  var MapEngine = window.BikeApp.MapEngine;
  var AmapAPI = window.BikeApp.AmapEngine;   // 静态工具（load/canUse/geoFromSim/simFromGeo/haversine）
  var AmapEngine = AmapAPI.AmapEngine;        // 构造函数

  function create(store, root) {
    var state = store.state;

    var simCanvas = el('canvas', { width: 340, height: 320 });
    var simEngine = new MapEngine(simCanvas);
    simEngine.kind = 'sim';
    var engine = simEngine;
    var canvasHolder = el('div', { class: 'canvas-holder' }, [simCanvas]);

    var recordBar = el('div', { class: 'record-bar' });
    var summaryEl = el('div', { class: 'summary-card' });
    var emptyEl = el('div', { class: 'empty', style: 'display:none;' });
    var mapWrap = el('div', { class: 'map-wrap' }, [canvasHolder, makeControls()]);
    var segModal = el('div', { class: 'modal-mask', style: 'display:none;' });
    var selectedId = null;       // 选中的历史记录 id；null=今日最新/当前
    var histList = el('div', { class: 'hist-list' });

    // 真实 GPS 记录状态
    var watchId = null;      // navigator.geolocation watch 句柄
    var startedGeo = null;   // 记录起点（真实经纬度），作为模拟坐标换算基准
    var gpsSupported = (typeof navigator !== 'undefined') && !!navigator.geolocation;

    function isAmap() { return !!engine.map; }
    function recording() { return !!state.get().activeRide; }

    // 全部历史记录（含今日），最近优先
    function allRides() {
      var h = state.get().rides.history || [];
      return h.slice().reverse();
    }
    function findRideById(id) {
      var found = null;
      allRides().forEach(function (x) { if (x.id === id) found = x; });
      return found;
    }
    function redraw() { renderSummary(); renderEmpty(); renderRecordBar(); renderHistList(); draw(); }

    // 当前要展示的骑行数据：进行中(active) 优先，其次选中的历史记录，否则今日已保存记录
    function currentRide() {
      if (recording()) {
        var pts = state.activeRidePoints();
        if (!pts || pts.length === 0) return null;
        var c = Core.computeRideTotals(pts);
        return { live: true, points: pts, segments: c.segments, totals: c.totals };
      }
      if (selectedId) {
        var sel = findRideById(selectedId);
        if (sel) return { live: false, id: sel.id, date: sel.date, points: sel.points, segments: sel.segments, totals: sel.totals };
        selectedId = null; // 选中记录已不存在，回退当前
      }
      return state.get().rides.today[0] || null;
    }

    function renderSummary() {
      var ride = currentRide();
      var totals = ride ? ride.totals : { distanceKm: 0, durationMin: 0, avgSpeedKmh: 0, caloriesKcal: 0 };
      summaryEl.innerHTML = '';
      var dateLabel = ride && ride.date ? ride.date : (ride && ride.live ? '今日（记录中）' : '今日');
      summaryEl.appendChild(el('div', { class: 'sum-head', icon: 'calendar', text: dateLabel }));
      var cell = function (kicker, val, unit, label) {
        return el('div', { class: 'sum-cell' }, [
          el('div', { class: 'sum-kicker', text: kicker }),
          el('div', { class: 'sum-val', text: val }),
          el('div', { class: 'sum-unit', text: unit }),
          el('div', { class: 'sum-label', text: label })
        ]);
      };
      summaryEl.appendChild(el('div', { class: 'sum-row' }, [
        cell('DISTANCE', totals.distanceKm, 'km', '累计里程'),
        cell('DURATION', Math.round(totals.durationMin), 'min', '骑行时长'),
        cell('AVG. SPEED', totals.avgSpeedKmh, 'km/h', '平均速度'),
        cell('ENERGY', totals.caloriesKcal, 'kcal', '消耗热量')
      ]));
    }

    function renderHistList() {
      histList.innerHTML = '';
      var rides = allRides();
      if (!rides.length) { histList.appendChild(el('p', { class: 'hint', text: '还没有骑行记录，点下方按钮开始记录' })); return; }
      var mk = function (ride, id, label) {
        var t = ride.totals || {};
        return el('button', { class: 'hist-item' + (selectedId === id ? ' sel' : ''), onclick: function () {
          selectedId = id; redraw();
        } }, [
          el('span', { class: 'hist-date', text: label || ride.date }),
          el('span', { class: 'hist-main' }, [
            document.createTextNode((t.distanceKm || 0) + ' km · ' + Core.formatDuration(t.durationMin || 0) + ' · ' + (t.avgSpeedKmh || 0) + ' km/h'),
            el('span', { class: 'hist-calories', icon: 'flame', text: (t.caloriesKcal || 0) + ' 千卡' })
          ])
        ]);
      };
      var today = state.get().rides.today[0];
      if (today) histList.appendChild(mk(today, null, '今日最新'));
      rides.forEach(function (r) { histList.appendChild(mk(r, r.id, r.date)); });
    }

    function renderEmpty() {
      var ride = currentRide();
      emptyEl.style.display = ride ? 'none' : 'block';
      emptyEl.innerHTML = '';
      if (!ride) emptyEl.appendChild(el('p', { text: '今天还没有骑行记录，点下方按钮开始记录真实轨迹' }));
    }

    function renderRecordBar() {
      recordBar.innerHTML = '';
      var ar = state.get().activeRide;
      if (ar) {
        var secs = Math.round((Date.now() - ar.startedAt) / 1000);
        var paused = ar.paused;
        recordBar.appendChild(el('div', { class: 'rec-state' }, [
          el('span', { class: 'rec-dot' }),
          el('span', { icon: paused ? 'pause' : 'route', text: (paused ? '已暂停 ' : '正在记录真实轨迹… ') + Core.formatDuration(secs / 60) })
        ]));
        recordBar.appendChild(el('button', { class: 'mini-btn', icon: paused ? 'play' : 'pause', text: paused ? '继续' : '暂停', onclick: paused ? resumeRecording : pauseRecording }));
        recordBar.appendChild(el('button', { class: 'mini-btn no', icon: 'stop', text: '结束并保存', onclick: stopRecording }));
      } else {
        recordBar.appendChild(el('span', { class: 'rec-hint', text: '骑行时点击开始，用真实 GPS 记录轨迹' }));
        recordBar.appendChild(el('button', { class: 'mini-btn primary', icon: 'route', text: '开始记录', onclick: startRecording }));
      }
    }

    // ---- 真实 GPS 记录 ----
    function startRecording() {
      ui.confirmPrivacy(function (ok) {
        if (!ok) { ui.toast('未授权定位，无法记录真实轨迹'); return; }
        doStartRecording();
      });
    }

    function startWatch() {
      // 继续记录时沿用已有起点（startedGeo 不清空），保持轨迹连续
      // 统一用高精度定位参数，避免浏览器粗定位(城市级)导致轨迹漂移
      watchId = navigator.geolocation.watchPosition(onGpsPos, onGpsErr, Core.geoOptions());
    }
    function doStartRecording() {
      if (!gpsSupported) { ui.toast('当前浏览器不支持定位'); return; }
      if (recording()) return;
      state.startRide();
      startedGeo = null;
      startWatch();
      renderRecordBar(); renderSummary(); renderEmpty();
      ui.toast('已开始记录真实轨迹');
    }
    function pauseRecording() {
      state.pauseRide();
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      ui.toast('已暂停记录'); renderRecordBar();
    }
    function resumeRecording() {
      if (!gpsSupported) { ui.toast('当前浏览器不支持定位'); return; }
      if (!recording()) return;
      state.resumeRide();
      startWatch();
      ui.toast('已继续记录'); renderRecordBar();
    }

    function onGpsPos(pos) {
      var lng = pos.coords.longitude, lat = pos.coords.latitude;
      var t = pos.timestamp || Date.now();
      var sp = pos.coords.speed || 0; // m/s
      if (!startedGeo) {
        startedGeo = { lng: lng, lat: lat };
        if (isAmap()) engine.setUserGeo(startedGeo); // 高德：以起点为地图基准
      }
      var p = AmapAPI.simFromGeo(startedGeo, lng, lat);
      var pts = state.activeRidePoints();
      // 记录节流（省电/续航）：短间隔内位移很小(静止/微动)则跳过，减少点量
      if (pts.length && !Core.shouldSamplePoint(pts[pts.length - 1], p)) {
        return;
      }
      // GPS 异常点过滤：与前一点跳跃过大视为漂移，丢弃本次点
      if (pts.length && !Core.isSaneStep(pts[pts.length - 1], p)) {
        ui.toast('已过滤一个 GPS 漂移点');
        return;
      }
      var speedKmh;
      if (sp > 0) speedKmh = Math.round(sp * 3.6 * 10) / 10;
      else if (pts.length) {
        var prev = pts[pts.length - 1];
        var dt = (t - prev.t) / 3600000;
        var km = Core.dist2d(prev, p) * Core.KM_PER_UNIT;
        speedKmh = dt > 0 ? Math.round(km / dt * 10) / 10 : 0;
      } else speedKmh = 0;
      state.appendRidePoint(p.x, p.y, t, speedKmh); // emit → 刷新汇总/轨迹
      try { engine.centerOn(p.x, p.y); } catch (e) {}
    }

    function onGpsErr(err) {
      var kind = Core.rideErrorKind(err);
      if (kind === 'denied') {
        ui.toast('定位权限被拒绝，无法记录真实轨迹');
        stopRecording();
        return;
      }
      // 定位丢失/超时：暂停记录，等待用户点"继续"重新获取
      if (state.get().activeRide) state.pauseRide();
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      ui.toast(kind === 'timeout' ? '定位超时，已暂停记录（点继续可重新获取）' : '定位丢失，已暂停记录（点继续可重新获取）');
      renderRecordBar();
    }

    function stopRecording() {
      if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
      if (state.get().activeRide && state.activeRidePoints().length >= 2) {
        state.finishRide();
        ui.toast('已保存今日骑行记录');
      } else if (state.get().activeRide) {
        state.finishRide(); // 点过少也落库（仅 0~1 点，空态回退）
        ui.toast('记录点过少，未生成有效轨迹');
      }
      startedGeo = null;
      renderRecordBar(); renderSummary(); renderEmpty(); draw();
    }

    function makeControls() {
      return el('div', { class: 'map-controls' }, [
        el('button', { class: 'mc-btn icon-only', icon: 'target', text: '定位', title: '定位路线', 'aria-label': '定位路线', onclick: function () {
          var ride = currentRide();
          var t = (ride && ride.points.length) ? ride.points[0] : { x: 200, y: 380 };
          engine.centerOn(t.x, t.y); draw();
        } }),
        el('button', { class: 'mc-btn icon-only', icon: 'plus', text: '放大', title: '放大地图', 'aria-label': '放大地图', onclick: function () { engine.zoomIn(); } }),
        el('button', { class: 'mc-btn icon-only', icon: 'minus', text: '缩小', title: '缩小地图', 'aria-label': '缩小地图', onclick: function () { engine.zoomOut(); } })
      ]);
    }

    function draw() {
      var ride = currentRide();
      engine.clear(); engine.drawBase();
      if (ride && ride.segments && ride.segments.length) engine.drawRoute(ride.segments, ride.points);
      if (ride && ride.points && ride.points.length) {
        engine.drawStartEnd(ride.points[0], ride.points[ride.points.length - 1]);
      }
      engine.drawLegend();
      engine.drawScaleBar();
    }

    function pointSegDist(px, py, a, b) {
      var dx = b.x - a.x, dy = b.y - a.y;
      var len2 = dx * dx + dy * dy;
      if (len2 === 0) return Core.dist2d({ x: px, y: py }, a);
      var t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return Core.dist2d({ x: px, y: py }, { x: a.x + t * dx, y: a.y + t * dy });
    }

    function showSeg(seg) {
      segModal.innerHTML = '';
      segModal.appendChild(el('div', { class: 'modal-card' }, [
        el('h3', { text: '路段详情' }),
        el('p', { text: '里程：' + seg.distanceKm + ' km' }),
        el('p', { text: '均速：' + seg.avgSpeedKmh + ' km/h' }),
        el('p', { text: '用时：' + Core.formatDuration(seg.durationMin) }),
        el('p', { text: '配速：' + seg.paceMinPerKm + ' 分钟/公里（颜色：' + seg.color + '）' }),
        el('button', { class: 'mini-btn close', text: '关闭', onclick: function () { segModal.style.display = 'none'; } })
      ]));
      segModal.style.display = 'flex';
    }

    // 点击路段看详情
    function bindClick() {
      if (engine.map) {
        engine.onClick(function (p) {
          var ride = currentRide();
          if (!ride || !ride.segments) return;
          for (var i = 0; i < ride.segments.length; i++) {
            var a = ride.points[ride.segments[i].fromIdx], b = ride.points[ride.segments[i].toIdx];
            if (pointSegDist(p.x, p.y, a, b) < 12) { showSeg(ride.segments[i]); return; }
          }
        });
      } else {
        simCanvas.addEventListener('click', function (e) {
          var ride = currentRide();
          if (!ride || !ride.segments) return;
          var rect = simCanvas.getBoundingClientRect();
          var sx = (e.clientX - rect.left) * (simCanvas.width / rect.width);
          var sy = (e.clientY - rect.top) * (simCanvas.height / rect.height);
          var w = engine.view.screenToWorld(sx, sy);
          for (var i = 0; i < ride.segments.length; i++) {
            var a = ride.points[ride.segments[i].fromIdx], b = ride.points[ride.segments[i].toIdx];
            if (pointSegDist(w.x, w.y, a, b) < 12) { showSeg(ride.segments[i]); return; }
          }
        });
      }
    }

    // 接入高德真实地图（含真实定位基准）
    function tryAmap() {
      AmapAPI.load(function (ok) {
        if (!ok || !AmapAPI.canUse()) return;
        var div = el('div', { class: 'amap-box' });
        canvasHolder.innerHTML = ''; canvasHolder.appendChild(div);
        engine = new AmapEngine(div, { zoom: 14 });
        engine.kind = 'amap';
        bindClick();
        function centerOnRide() {
          var ride = currentRide();
          var t = (ride && ride.points.length) ? ride.points[0] : { x: 200, y: 380 };
          engine.centerOn(t.x, t.y);
        }
        centerOnRide(); draw(); // 立即绘制，定位成功后更新
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(function (pos) {
            engine.setUserGeo({ lng: pos.coords.longitude, lat: pos.coords.latitude });
            centerOnRide(); draw();
          }, function () {}, { timeout: 6000 });
        }
      });
    }

    root.innerHTML = '';
    root.appendChild(el('div', { class: 'page ride-page' }, [
      el('div', { class: 'page-title', icon: 'route', text: '骑行记录' }),
      summaryEl,
      histList,
      recordBar,
      mapWrap,
      emptyEl,
      segModal
    ]));

    (function () { var ride = currentRide(); var t = (ride && ride.points.length) ? ride.points[0] : { x: 200, y: 380 }; engine.centerOn(t.x, t.y); })();
    engine.onRedraw(draw);
    bindClick();
    tryAmap();

    state.onChange(function () { redraw(); });
    redraw();
  }

  window.BikeApp.Pages = window.BikeApp.Pages || {};
  window.BikeApp.Pages.Ride = { create: create };
})();
