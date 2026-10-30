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
  var BASE_GEO = { lng: 121.4325, lat: 31.0290 }; // 演示区：上海交通大学闵行校区

  function mapStylePref() {
    try { return window.localStorage.getItem('bikeapp.mapStyle') === 'realistic' ? 'realistic' : 'p09'; }
    catch (e) { return 'p09'; }
  }

  function create(store, root) {
    var state = store.state;

    var simCanvas = el('canvas', { width: 340, height: 320, role: 'img', tabindex: '0', 'aria-label': '模拟地图：显示骑行路线和分段速度' });
    var simEngine = new MapEngine(simCanvas, {
      dataUrl: 'assets/map/sjtu-minhang.json',
      style: mapStylePref()
    });
    simEngine.kind = 'sim';
    var engine = simEngine;
    var canvasHolder = el('div', { class: 'canvas-holder' }, [simCanvas]);

    var recordBar = el('div', { class: 'record-bar' });
    var summaryEl = el('div', { class: 'summary-card' });
    var emptyEl = el('div', { class: 'empty', style: 'display:none;' });
    var mapWrap = el('div', { class: 'map-wrap' }, [canvasHolder, makeControls()]);
    var segModal = el('div', { class: 'modal-mask', style: 'display:none;' });
    var selectedId = null;       // 选中的历史记录 id；null=今日聚合视图
    var histList = el('div', { class: 'hist-list' });
    var segPanel = el('div', { class: 'seg-panel' });

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
    function redraw() { renderSummary(); renderEmpty(); renderRecordBar(); renderHistList(); renderSegmentsPanel(); draw(); }

    function todaySessions() {
      var today = state.get().rides.today;
      return Array.isArray(today) ? today : (today ? [today] : []);
    }

    function visibleSegments(session) {
      var segs = (session && session.segments) || [];
      return segs.filter(function (seg, i) {
        return !state.isSegmentHidden(session.id, i);
      });
    }

    function visibleSegmentCount() {
      var n = 0;
      todaySessions().forEach(function (session) { n += visibleSegments(session).length; });
      return n;
    }

    function hiddenSegmentCount() {
      var n = 0;
      todaySessions().forEach(function (session) {
        (session.segments || []).forEach(function (seg, i) {
          if (state.isSegmentHidden(session.id, i)) n++;
        });
      });
      return n;
    }

    // 今日汇总：从每个 session 的总计出发，扣除被隐藏路段，保留闭环补距等总计项
    function aggregateToday() {
      var totals = { distanceKm: 0, durationMin: 0, avgSpeedKmh: 0, caloriesKcal: 0 };
      if (visibleSegmentCount() === 0) return totals;
      todaySessions().forEach(function (session) {
        var visible = visibleSegments(session);
        if (!visible.length) return; // 整次 session 都被隐藏时，连闭环补距也不计入
        var st = session.totals || {};
        totals.distanceKm += Number(st.distanceKm) || 0;
        totals.durationMin += Number(st.durationMin) || 0;
        totals.caloriesKcal += Number(st.caloriesKcal) || 0;
        (session.segments || []).forEach(function (seg, i) {
          if (state.isSegmentHidden(session.id, i)) {
            totals.distanceKm -= seg.distanceKm;
            totals.durationMin -= seg.durationMin;
            totals.caloriesKcal -= seg.durationMin * Core.calPerMin(seg.avgSpeedKmh);
          }
        });
      });
      totals.distanceKm = Core.round2(totals.distanceKm);
      totals.durationMin = Core.round2(totals.durationMin);
      totals.caloriesKcal = Math.max(0, Math.round(totals.caloriesKcal));
      totals.avgSpeedKmh = totals.durationMin > 0
        ? Core.round2(totals.distanceKm / (totals.durationMin / 60)) : 0;
      return totals;
    }

    // 当前要展示的骑行数据：进行中(active) 优先，其次选中的历史记录，否则今日聚合
    function currentRide() {
      if (recording()) {
        var pts = state.activeRidePoints();
        if (!pts || pts.length === 0) return null;
        var c = Core.computeRideTotals(pts);
        return { live: true, points: pts, segments: c.segments, totals: c.totals };
      }
      if (selectedId) {
        var sel = findRideById(selectedId);
        if (sel) {
          return { live: false, readOnly: true, id: sel.id, date: sel.date,
            points: sel.points, segments: sel.segments, totals: sel.totals };
        }
        selectedId = null; // 选中记录已不存在，回退今日
      }
      var sessions = todaySessions();
      if (!sessions.length) return null;
      return {
        live: false, today: true, sessions: sessions,
        totals: aggregateToday(),
        hiddenCount: hiddenSegmentCount(),
        segments: []
      };
    }

    function renderSummary() {
      var ride = currentRide();
      var totals = ride ? ride.totals : { distanceKm: 0, durationMin: 0, avgSpeedKmh: 0, caloriesKcal: 0 };
      summaryEl.innerHTML = '';
      var dateLabel;
      if (ride && ride.date) dateLabel = ride.date;
      else if (ride && ride.live) dateLabel = '今日（记录中）';
      else if (ride && ride.today) dateLabel = '今日（' + ride.sessions.length + ' 次）';
      else dateLabel = '今日';
      summaryEl.appendChild(el('div', { class: 'sum-head', icon: 'calendar', text: dateLabel }));
      if (ride && ride.today && ride.hiddenCount > 0) {
        summaryEl.appendChild(el('div', { class: 'sum-note', text: '已隐藏 ' + ride.hiddenCount + ' 段，汇总按剩余路段计算' }));
      }
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
      var mk = function (ride, id, label, selected) {
        var t = ride.totals || {};
        return el('button', { class: 'hist-item' + (selected ? ' sel' : ''), onclick: function () {
          selectedId = id; redraw();
        } }, [
          el('span', { class: 'hist-date', text: label || ride.date }),
          el('span', { class: 'hist-main' }, [
            document.createTextNode((t.distanceKm || 0) + ' km · ' + Core.formatDuration(t.durationMin || 0) + ' · ' + (t.avgSpeedKmh || 0) + ' km/h'),
            el('span', { class: 'hist-calories', icon: 'flame', text: (t.caloriesKcal || 0) + ' 千卡' })
          ])
        ]);
      };
      var today = todaySessions();
      var todayIds = {};
      today.forEach(function (r, i) {
        todayIds[r.id] = true;
        histList.appendChild(mk(r, null, i === today.length - 1 ? '今日最新' : '今日', selectedId === null && i === today.length - 1));
      });
      rides.forEach(function (r) {
        if (!todayIds[r.id]) histList.appendChild(mk(r, r.id, r.date, selectedId === r.id));
      });
    }

    function renderEmpty() {
      var ride = currentRide();
      var allHidden = !!(ride && ride.today && ride.sessions.length && visibleSegmentCount() === 0);
      emptyEl.style.display = (ride && !allHidden) ? 'none' : 'block';
      emptyEl.innerHTML = '';
      if (!ride) emptyEl.appendChild(el('p', { text: '今天还没有骑行记录，点下方按钮开始记录真实轨迹' }));
      else if (allHidden) emptyEl.appendChild(el('p', { text: '今日路段已全部隐藏，可在下方“路段管理”里恢复' }));
    }

    function segmentRow(session, seg, index, canHide, hidden) {
      var colorClass = seg.color === '黄' ? 'yellow' : (seg.color === '绿' ? 'green' : (seg.color === '红' ? 'red' : 'gray'));
      var row = el('div', { class: 'seg-row' + (hidden ? ' hidden' : '') }, [
        el('span', { class: 'seg-dot ' + colorClass }),
        el('span', { class: 'seg-main' }, [
          el('span', { class: 'seg-title', text: '第 ' + (index + 1) + ' 段' }),
          el('span', { class: 'seg-meta', text: seg.distanceKm + ' km · ' + Core.formatDuration(seg.durationMin) + ' · ' + seg.avgSpeedKmh + ' km/h' })
        ])
      ]);
      if (canHide) {
        row.appendChild(el('button', { class: 'mini-btn' + (hidden ? ' ok' : ''), text: hidden ? '恢复' : '隐藏', onclick: function () {
          if (hidden) state.restoreSegment(session.id, index);
          else state.hideSegment(session.id, index);
          redraw();
        } }));
      }
      return row;
    }

    function renderSegmentsPanel() {
      segPanel.innerHTML = '';
      var ride = currentRide();
      if (!ride || ride.live) { segPanel.style.display = 'none'; return; }

      if (ride.readOnly) {
        segPanel.style.display = 'block';
        segPanel.appendChild(el('div', { class: 'seg-head' }, [el('span', { text: '路段（历史，只读）' })]));
        (ride.segments || []).forEach(function (seg, i) {
          segPanel.appendChild(segmentRow(ride, seg, i, false, false));
        });
        return;
      }

      var sessions = ride.sessions || [];
      if (!sessions.length) { segPanel.style.display = 'none'; return; }
      segPanel.style.display = 'block';
      var head = el('div', { class: 'seg-head' }, [el('span', { text: '路段管理' })]);
      if (ride.hiddenCount > 0) {
        head.appendChild(el('button', { class: 'mini-btn', text: '恢复全部', onclick: function () {
          state.restoreAllSegments(); ui.toast('已恢复全部路段'); redraw();
        } }));
      }
      segPanel.appendChild(head);

      var hiddenRows = [];
      sessions.forEach(function (session, si) {
        var box = el('div', { class: 'seg-session' });
        box.appendChild(el('div', { class: 'seg-session-head' }, [
          el('span', { text: '第 ' + (si + 1) + ' 次 · ' + Core.formatTime(session.startedAt) }),
          el('span', { text: visibleSegments(session).length + '/' + (session.segments || []).length + ' 段可见' })
        ]));
        (session.segments || []).forEach(function (seg, i) {
          if (state.isSegmentHidden(session.id, i)) {
            hiddenRows.push({ session: session, seg: seg, index: i });
          } else {
            box.appendChild(segmentRow(session, seg, i, true, false));
          }
        });
        segPanel.appendChild(box);
      });

      if (hiddenRows.length) {
        segPanel.appendChild(el('div', { class: 'seg-hidden-head', text: '已隐藏 ' + hiddenRows.length + ' 段' }));
        hiddenRows.forEach(function (row) {
          segPanel.appendChild(segmentRow(row.session, row.seg, row.index, true, true));
        });
      }
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
      var ar = state.get().activeRide;
      if (!ar) return;
      if (state.activeRidePoints().length >= 2) {
        state.finishRide();
        ui.toast('已保存今日骑行记录');
      } else {
        state.cancelRide();
        ui.toast('记录点过少，本次不保存');
      }
      startedGeo = null;
      renderRecordBar(); renderSummary(); renderEmpty(); renderSegmentsPanel(); draw();
    }

    function makeControls() {
      return el('div', { class: 'map-controls' }, [
        el('button', { class: 'mc-btn icon-only', icon: 'target', text: '定位', title: '定位路线', 'aria-label': '定位路线', onclick: function () {
          var ride = currentRide();
          var t = rideAnchorPoint(ride);
          engine.centerOn(t.x, t.y); draw();
        } }),
        el('button', { class: 'mc-btn icon-only', icon: 'compass', text: '看全', title: '显示全部路线', 'aria-label': '显示全部路线', onclick: fitView }),
        el('button', { class: 'mc-btn icon-only', icon: 'layers', text: '风格', title: '切换地图风格', 'aria-label': '切换地图风格', onclick: toggleMapStyle }),
        el('button', { class: 'mc-btn icon-only', icon: 'plus', text: '放大', title: '放大地图', 'aria-label': '放大地图', onclick: function () { engine.zoomIn(); } }),
        el('button', { class: 'mc-btn icon-only', icon: 'minus', text: '缩小', title: '缩小地图', 'aria-label': '缩小地图', onclick: function () { engine.zoomOut(); } })
      ]);
    }

    function draw() {
      syncBounds();
      var ride = currentRide();
      engine.clear(); engine.drawBase();
      if (ride && ride.today) {
        (ride.sessions || []).forEach(function (session) {
          var segs = visibleSegments(session);
          if (segs.length && session.points && session.points.length) {
            engine.drawRoute(segs, session.points);
            engine.drawStartEnd(session.points[0], session.points[session.points.length - 1]);
          }
        });
      } else if (ride && ride.segments && ride.segments.length) {
        engine.drawRoute(ride.segments, ride.points);
        if (ride.points && ride.points.length) {
          engine.drawStartEnd(ride.points[0], ride.points[ride.points.length - 1]);
        }
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

    // 点击路段看详情（支持今日多 session 聚合与历史只读）
    function pickSegment(p) {
      var ride = currentRide();
      if (!ride) return null;
      var hitWorld = (engine.view && engine.view.getView)
        ? 12 / engine.view.getView().scale : 12;
      if (ride.today) {
        var sessions = ride.sessions || [];
        for (var s = 0; s < sessions.length; s++) {
          var session = sessions[s];
          var segs = visibleSegments(session);
          for (var i = 0; i < segs.length; i++) {
            var seg = segs[i];
            var a = session.points[seg.fromIdx], b = session.points[seg.toIdx];
            if (a && b && pointSegDist(p.x, p.y, a, b) < hitWorld) return seg;
          }
        }
        return null;
      }
      if (!ride.segments || !ride.points) return null;
      for (var j = 0; j < ride.segments.length; j++) {
        var sg = ride.segments[j];
        var pa = ride.points[sg.fromIdx], pb = ride.points[sg.toIdx];
        if (pa && pb && pointSegDist(p.x, p.y, pa, pb) < hitWorld) return sg;
      }
      return null;
    }

    function bindClick() {
      if (engine.map) {
        engine.onClick(function (p) {
          var seg = pickSegment(p);
          if (seg) showSeg(seg);
        });
      } else {
        simCanvas.addEventListener('click', function (e) {
          var rect = simCanvas.getBoundingClientRect();
          var sx = (e.clientX - rect.left) * (simCanvas.width / rect.width);
          var sy = (e.clientY - rect.top) * (simCanvas.height / rect.height);
          var w = engine.view.screenToWorld(sx, sy);
          var seg = pickSegment(w);
          if (seg) showSeg(seg);
        });
      }
    }

    function rideAnchorPoint(ride) {
      if (!ride) return { x: 200, y: 380 };
      if (ride.today) {
        var s = (ride.sessions && ride.sessions[0]) || null;
        return (s && s.points && s.points.length) ? s.points[0] : { x: 200, y: 380 };
      }
      return (ride.points && ride.points.length) ? ride.points[0] : { x: 200, y: 380 };
    }

    function ridePoints() {
      var ride = currentRide();
      if (!ride) return [];
      if (ride.today) {
        var pts = [];
        (ride.sessions || []).forEach(function (s) {
          if (s.points && s.points.length) pts = pts.concat(s.points);
        });
        return pts;
      }
      return ride.points || [];
    }

    function syncBounds() {
      if (!engine.setBoundsFromPoints) return;
      engine.setBoundsFromPoints(ridePoints(), 60);
    }

    function fitView() {
      if (!engine.fitBounds) return;
      if (engine.fitBounds(ridePoints(), 28)) ui.toast('已显示全部路线');
      draw();
    }

    function toggleMapStyle() {
      if (!engine.setMapStyle) { ui.toast('当前为高德地图，无法切换模拟风格'); return; }
      if (!engine.hasMapData()) { ui.toast('离线地图数据未加载，当前区域使用示意地图'); return; }
      var next = engine.getMapStyle() === 'realistic' ? 'p09' : 'realistic';
      try { window.localStorage.setItem('bikeapp.mapStyle', next); } catch (e) {}
      engine.setMapStyle(next);
      draw();
      ui.toast(next === 'realistic' ? '已切换为真实地图风格' : '已切换为 P09 仪器风格');
    }

    // 接入高德真实地图（含真实定位基准）
    function tryAmap() {
      if (window.location.search.indexOf('sim=1') >= 0) return; // ?sim=1 强制查看模拟地图
      AmapAPI.load(function (ok) {
        if (!ok || !AmapAPI.canUse()) return;
        var div = el('div', { class: 'amap-box' });
        canvasHolder.innerHTML = ''; canvasHolder.appendChild(div);
        engine = new AmapEngine(div, { zoom: 14, base: BASE_GEO });
        engine.kind = 'amap';
        engine.onRedraw(draw);
        bindClick();
        function centerOnRide() {
          var ride = currentRide();
          var t = rideAnchorPoint(ride);
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
      segPanel,
      emptyEl,
      segModal
    ]));

    simEngine.resize();

    (function () {
      var ride = currentRide();
      var pts = ridePoints();
      if (pts.length > 1 && engine.fitBounds) engine.fitBounds(pts, 28);
      else { var t = rideAnchorPoint(ride); engine.centerOn(t.x, t.y); }
    })();
    engine.onRedraw(draw);
    bindClick();
    tryAmap();

    state.onChange(function () { redraw(); });
    redraw();
  }

  window.BikeApp.Pages = window.BikeApp.Pages || {};
  window.BikeApp.Pages.Ride = { create: create };
})();
