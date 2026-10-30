/* core.js — 纯逻辑：配速分色、卡路里、骑行分段/总计、工具函数、默认数据
 * 浏览器 + Node 双端可用（UMD）。测试可直接 require。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.Core = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FRIEND_LIMIT = 100;              // 好友上限
  var REQUEST_COOLDOWN_MS = 3600000;   // 好友请求冷却：同一人一定时间内(默认1小时)只可发送一次
  var KM_PER_UNIT = 0.003;             // 地图单位 -> 公里 的换算（1 单位 ≈ 3 米）
  var DEFAULT_MAX_STEP_KM = 1.5;       // GPS 异常点过滤：相邻两点跳跃超过该公里数视为漂移
  var CLOSE_GAP_KM = 0.25;             // 轨迹闭合兜底：终点距起点小于该公里数视为环线，补回程里程
  var RIDE_MIN_INTERVAL_MS = 10000;    // 记录节流：最短采样间隔（10 秒）
  var RIDE_MIN_MOVE_KM = 0.01;         // 记录节流：间隔内位移小于该公里数(10m)则视为微动/静止，跳过

  function makeId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function now() { return Date.now(); }

  // 配速(每公里分钟) -> 颜色：<3 黄，3~9 绿，>9 红；0/无效表示静止或无数据，用灰色
  function paceToColor(paceMinPerKm) {
    if (!isFinite(paceMinPerKm) || paceMinPerKm <= 0) return '灰';
    if (paceMinPerKm < 3) return '黄';
    if (paceMinPerKm <= 9) return '绿';
    return '红';
  }
  function paceColorHex(paceMinPerKm) {
    var c = paceToColor(paceMinPerKm);
    return c === '黄' ? '#f5c518' : (c === '绿' ? '#2ecc71' : (c === '红' ? '#e74c3c' : '#95a5a6'));
  }

  // 由均速估算 MET
  function metForSpeed(speedKmh) {
    if (speedKmh < 12) return 4;
    if (speedKmh < 16) return 6;
    if (speedKmh < 20) return 8;
    return 10;
  }
  // 每分钟消耗千卡（默认体重 70kg）
  function calPerMin(speedKmh, weightKg) {
    weightKg = weightKg || 70;
    if (!isFinite(speedKmh) || speedKmh <= 0) return 0; // 无效速度不计卡路里
    return metForSpeed(speedKmh) * 3.5 * weightKg / 200;
  }
  // 估算消耗卡路里
  function estimateCalories(distanceKm, avgSpeedKmh, weightKg) {
    if (!isFinite(distanceKm) || distanceKm <= 0) return 0;
    if (!avgSpeedKmh || avgSpeedKmh <= 0) return 0;
    var durationMin = distanceKm / avgSpeedKmh * 60;
    return Math.round(durationMin * calPerMin(avgSpeedKmh, weightKg));
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function dist2d(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function pointKm(a, b) { return dist2d(a, b) * KM_PER_UNIT; }
  // GPS 异常点过滤：相邻两点跳跃超过 maxKm（默认 1.5km）视为漂移点；首点恒为正常
  function isSaneStep(prev, cur, maxKm) {
    if (!prev) return true;
    return pointKm(prev, cur) <= (maxKm || DEFAULT_MAX_STEP_KM);
  }
  // 记录节流（省电/续航）：首点必记；距上次记录时间足够则必记；
  // 时间不足但位移明显则仍记；时间不足且位移很小(静止/微动)则跳过。
  function shouldSamplePoint(prev, cur, opts) {
    if (!prev) return true;
    opts = opts || {};
    var minInt = opts.minIntervalMs || RIDE_MIN_INTERVAL_MS;
    var minMove = opts.minMoveKm || RIDE_MIN_MOVE_KM;
    var dt = cur.t - prev.t;
    if (dt >= minInt) return true;
    return pointKm(prev, cur) >= minMove;
  }

  // 由采样点构造分段。point: {x,y,t,speedKmh}
  function buildRideSegments(points) {
    var segments = [];
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i], b = points[i + 1];
      var durationMin = (b.t - a.t) / 60000;
      var avgSpeedKmh = (a.speedKmh + b.speedKmh) / 2;
      var distanceKm = durationMin > 0 ? avgSpeedKmh * (durationMin / 60) : 0;
      var pace = avgSpeedKmh > 0 ? (60 / avgSpeedKmh) : 0;
      segments.push({
        fromIdx: i, toIdx: i + 1,
        distanceKm: round2(distanceKm),
        durationMin: round2(durationMin),
        avgSpeedKmh: round2(avgSpeedKmh),
        paceMinPerKm: round2(pace),
        color: paceToColor(pace)
      });
    }
    return segments;
  }

  // 卡路里更准：按每个分段各自的速度强度(MET)累加，而非整段取单一均速；
  // 可传体重(kg)提升精度，默认 70kg。
  function computeRideTotals(points, weightKg) {
    var segments = buildRideSegments(points);
    var distanceKm = 0, durationMin = 0, calories = 0;
    for (var i = 0; i < segments.length; i++) {
      distanceKm += segments[i].distanceKm;
      durationMin += segments[i].durationMin;
      calories += segments[i].durationMin * calPerMin(segments[i].avgSpeedKmh, weightKg);
    }
    // 轨迹闭合兜底：若终点距起点很近（环线骑行），只补“缺口距离”，
    // 时长按“缺口 / 最后一段均速”估算，避免把最后一段整段时长重复计入。
    if (points && points.length >= 3) {
      var gapKm = pointKm(points[0], points[points.length - 1]);
      if (gapKm < CLOSE_GAP_KM) {
        var lastSeg = segments[segments.length - 1];
        var extraMin = (lastSeg && lastSeg.avgSpeedKmh > 0)
          ? gapKm / lastSeg.avgSpeedKmh * 60 : 0;
        distanceKm += gapKm;
        durationMin += extraMin;
        if (lastSeg) calories += extraMin * calPerMin(lastSeg.avgSpeedKmh, weightKg);
      }
    }
    var avgSpeedKmh = durationMin > 0 ? distanceKm / (durationMin / 60) : 0;
    return {
      segments: segments,
      totals: {
        distanceKm: round2(distanceKm),
        durationMin: round2(durationMin),
        avgSpeedKmh: round2(avgSpeedKmh),
        caloriesKcal: Math.round(calories)
      }
    };
  }

  function formatTime(ts) {
    var d = new Date(ts), hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
    return hh + ':' + mm;
  }
  function formatDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function formatDuration(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? (h + '小时' + m + '分') : (m + '分钟');
  }

  function defaultProfile() {
    return { userId: 'me', username: '骑行者', avatar: { type: 'preset', presetId: 'p1' },
      gender: '保密', birthday: '2000-01-01', hobbies: '骑行、露营、摄影', intro: '热爱周末骑行' };
  }
  function defaultBike() {
    return { id: 'b1', bikeName: '我的小黄车', position: { x: 520, y: 300 }, status: '在线', parkedAt: now(),
      glow: { active: false, until: 0 }, ring: { active: false, count: 0, until: 0 } };
  }

  // 定位错误分类：denied(权限拒绝) | unavailable(位置不可用) | timeout(超时) | unknown
  function rideErrorKind(err) {
    var code = err && err.code;
    if (code === 1 || code === 'PERMISSION_DENIED') return 'denied';
    if (code === 2 || code === 'POSITION_UNAVAILABLE') return 'unavailable';
    if (code === 3 || code === 'TIMEOUT') return 'timeout';
    return 'unknown';
  }

  var PRESET_AVATARS = ['p1', 'p3', 'p4', 'p5', 'p6'];

  // Geolocation 统一参数：强制高精度 + 不取缓存位置，避免浏览器粗定位(城市级)
  function geoOptions() {
    return { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 };
  }
  // 定位精度分级（accuracy 为浏览器返回的误差半径，单位米）
  function accuracyLabel(accuracyMeters) {
    var a = accuracyMeters;
    if (!isFinite(a) || a <= 0) return '定位精度未知';
    if (a < 50) return '高精度(±' + Math.round(a) + ' 米)';
    if (a < 200) return '较精确(±' + Math.round(a) + ' 米)';
    if (a < 1000) return '一般(±' + Math.round(a / 1000) + ' 公里)';
    return '粗略(城市级，±' + Math.round(a / 1000) + ' 公里)';
  }

  return {
    FRIEND_LIMIT: FRIEND_LIMIT,
    REQUEST_COOLDOWN_MS: REQUEST_COOLDOWN_MS,
    KM_PER_UNIT: KM_PER_UNIT,
    geoOptions: geoOptions, accuracyLabel: accuracyLabel,
    FRIEND_LIMIT: FRIEND_LIMIT,
    REQUEST_COOLDOWN_MS: REQUEST_COOLDOWN_MS,
    KM_PER_UNIT: KM_PER_UNIT,
    makeId: makeId, now: now,
    paceToColor: paceToColor, paceColorHex: paceColorHex,
    metForSpeed: metForSpeed, calPerMin: calPerMin, estimateCalories: estimateCalories,
    buildRideSegments: buildRideSegments, computeRideTotals: computeRideTotals,
    round2: round2, dist2d: dist2d, pointKm: pointKm, isSaneStep: isSaneStep, shouldSamplePoint: shouldSamplePoint, DEFAULT_MAX_STEP_KM: DEFAULT_MAX_STEP_KM, CLOSE_GAP_KM: CLOSE_GAP_KM, RIDE_MIN_INTERVAL_MS: RIDE_MIN_INTERVAL_MS, RIDE_MIN_MOVE_KM: RIDE_MIN_MOVE_KM,
    formatTime: formatTime, formatDate: formatDate, formatDuration: formatDuration,
    defaultProfile: defaultProfile, defaultBike: defaultBike, rideErrorKind: rideErrorKind,
    PRESET_AVATARS: PRESET_AVATARS
  };
});
