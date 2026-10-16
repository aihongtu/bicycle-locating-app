/* state.js — 应用状态与纯逻辑操作（资料、车、骑行、骑友、聊天）。UMD，可在 Node 测试。
 * 不依赖 DOM，所有可测试的业务规则集中于此。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./core'), require('./services/sim-bike'), require('./services/sim-nearby')); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.State = factory(root.BikeApp.Core, root.BikeApp.SimBike, root.BikeApp.SimNearby); }
})(typeof self !== 'undefined' ? self : this, function (Core, SimBike, SimNearby) {
  'use strict';

  function createState(initial) {
    initial = initial || {};
    // 车辆：每个用户仅一辆车。兼容旧数据({list,activeId} 或单辆 bike)迁移为单车。
    // 区分"明确无车(已删除)"与"首次启动(给默认车)"：bikeProvided=true 且 bike 为 null 表示已删除。
    var hasExplicit = (initial.bike !== undefined) || (initial.bikes !== undefined);
    var bikeInit = null;
    if (initial.bike) { bikeInit = initial.bike; if (!bikeInit.id) bikeInit.id = Core.makeId('bike'); }
    else if (initial.bikes && initial.bikes.list && initial.bikes.list.length) { bikeInit = initial.bikes.list[0]; }
    else if (hasExplicit || initial.bikeProvided) { bikeInit = null; }  // 明确为无车（已删除）
    else { bikeInit = Core.defaultBike(); }                              // 首次启动，给默认车
    var s = {
      profile: initial.profile || Core.defaultProfile(),
      bike: bikeInit,               // 唯一车辆；可为 null（已删除）
      rides: initial.rides || { today: [], history: [] },
      social: initial.social || { nearby: [], requests: [], friends: [], messages: {} },
      activeRide: null
    };

    function persistHooks() { s.onChange = s.onChange || []; }
    function emit() { persistHooks(); for (var i = 0; i < s.onChange.length; i++) s.onChange[i](s); }
    function onChange(fn) { persistHooks(); s.onChange.push(fn); }

    // ---------- 个人资料 ----------
    function updateProfile(patch) { Object.assign(s.profile, patch); emit(); return s.profile; }
    function setAvatar(avatar) { s.profile.avatar = avatar; emit(); return s.profile; }

    // ---------- 自行车（单车：添加/删除 + 发光/响铃模拟状态） ----------
    function hasBike() { return !!s.bike; }
    function getBike() { return s.bike; }
    function addBike(name, position, opts) {
      var id = Core.makeId('bike');
      var bike = {
        id: id,
        bikeName: name || '我的车',
        source: (opts && opts.source) || 'manual',   // manual | bluetooth
        position: position || { x: 400 + Math.floor(Math.random() * 300), y: 200 + Math.floor(Math.random() * 200) },
        status: '在线',
        parkedAt: Core.now(),
        glow: { active: false, until: 0 }, ring: { active: false, count: 0, until: 0 }
      };
      s.bike = bike;
      emit();
      return bike;
    }
    function removeBike() {
      s.bike = null;
      emit();
      return { ok: true };
    }
    // 刷新车辆位置（真实蓝牙设备提供最新坐标时更新）
    function updateBikePosition(x, y) {
      if (!s.bike) return { ok: false, reason: 'no-bike' };
      if (!isFinite(x) || !isFinite(y)) return { ok: false, reason: 'invalid' };
      s.bike.position = { x: x, y: y };
      s.bike.parkedAt = Core.now();
      emit();
      return { ok: true };
    }
    function glowBike(seconds) {
      if (!s.bike) return null;
      var until = Core.now() + (seconds || 8) * 1000;
      s.bike.glow = { active: true, until: until };
      emit(); return s.bike.glow;
    }
    function ringBike(count) {
      if (!s.bike) return null;
      var until = Core.now() + 6000;
      s.bike.ring = { active: true, count: count || 3, until: until };
      emit(); return s.bike.ring;
    }
    function expireBikeFx(now) {
      now = now || Core.now();
      if (s.bike) {
        if (s.bike.glow && s.bike.glow.active && s.bike.glow.until <= now) s.bike.glow.active = false;
        if (s.bike.ring && s.bike.ring.active && s.bike.ring.until <= now) s.bike.ring.active = false;
      }
      return s.bike;
    }

    // ---------- 骑行 ----------
    function startRide(ts) {
      ts = ts || Core.now();
      s.activeRide = { id: Core.makeId('ride'), date: Core.formatDate(ts), startedAt: ts, points: [], paused: false };
      emit(); return s.activeRide;
    }
    function appendRidePoint(x, y, t, speedKmh) {
      if (!s.activeRide) throw new Error('当前没有进行中的骑行');
      if (s.activeRide.paused) throw new Error('记录已暂停，不能继续记录');
      s.activeRide.points.push({ x: x, y: y, t: t, speedKmh: speedKmh });
      emit(); return s.activeRide.points;
    }
    function pauseRide() {
      if (!s.activeRide) return { ok: false, reason: 'no-active' };
      s.activeRide.paused = true;
      emit(); return { ok: true };
    }
    function resumeRide() {
      if (!s.activeRide) return { ok: false, reason: 'no-active' };
      s.activeRide.paused = false;
      emit(); return { ok: true };
    }
    function finishRide(ts) {
      ts = ts || Core.now();
      if (!s.activeRide) throw new Error('当前没有进行中的骑行');
      var r = s.activeRide;
      var computed = Core.computeRideTotals(r.points);
      var session = { id: r.id, date: r.date, startedAt: r.startedAt, endedAt: ts,
        points: r.points, segments: computed.segments, totals: computed.totals };
      // 今日只保留当天；history 保留全部
      s.rides.today = [session];
      s.rides.history.push(session);
      s.activeRide = null;
      emit();
      return session;
    }
    function activeRidePoints() { return s.activeRide ? s.activeRide.points : []; }

    // ---------- 骑友 ----------
    // 附近用户仅来自真实数据；不再自动生成虚拟人。确保数组存在即可。
    function ensureNearby() {
      if (!s.social.nearby) s.social.nearby = [];
      return s.social.nearby;
    }
    function canAddFriend() { return s.social.friends.length < Core.FRIEND_LIMIT; }
    function sendFriendRequest(uid) {
      if (!canAddFriend()) return { ok: false, reason: 'limit' };
      var target = null;
      for (var i = 0; i < s.social.nearby.length; i++) if (s.social.nearby[i].id === uid) { target = s.social.nearby[i]; break; }
      if (!target) return { ok: false, reason: 'notfound' };
      if (target.relation === 'friend') return { ok: false, reason: 'already-friend' };   // 已是好友，不可再发
      if (target.relation === 'requested') return { ok: false, reason: 'already-requested' };
      // 冷却：一定时间内对同一人只可发送一次
      var now = Core.now();
      var since = target.lastRequestAt || 0;
      if (now - since < Core.REQUEST_COOLDOWN_MS) {
        return { ok: false, reason: 'cooldown', remainingMs: Core.REQUEST_COOLDOWN_MS - (now - since) };
      }
      target.relation = 'requested';
      target.lastRequestAt = now;
      emit();
      return { ok: true };
    }
    // 删除好友：从好友列表移除，并重置 nearby 关系（可重新添加）
    function removeFriend(friendId) {
      var idx = -1;
      for (var i = 0; i < s.social.friends.length; i++) if (s.social.friends[i].id === friendId) { idx = i; break; }
      if (idx < 0) return { ok: false, reason: 'notfound' };
      s.social.friends.splice(idx, 1);
      for (var j = 0; j < s.social.nearby.length; j++) {
        if (s.social.nearby[j].id === friendId) { s.social.nearby[j].relation = 'none'; s.social.nearby[j].lastRequestAt = 0; }
      }
      emit();
      return { ok: true };
    }
    // 模拟对方处理结果：decision='friend'|'rejected'
    function settleRequest(uid, decision) {
      var target = null;
      for (var i = 0; i < s.social.nearby.length; i++) if (s.social.nearby[i].id === uid) { target = s.social.nearby[i]; break; }
      if (!target) return { ok: false, reason: 'notfound' };
      if (decision === 'friend') {
        if (!canAddFriend()) { target.relation = 'none'; return { ok: false, reason: 'limit' }; }
        target.relation = 'friend';
        s.social.friends.push({ id: target.id, name: target.name, gender: target.gender, hobbies: target.hobbies, avatar: target.avatar, addedAt: Core.now() });
        emit();
        return { ok: true, result: 'friend' };
      }
      target.relation = 'rejected';
      emit();
      return { ok: true, result: 'rejected' };
    }
    function receiveFriendRequest(from) {
      // 模拟对方主动加我
      if (!canAddFriend()) return { ok: false, reason: 'limit' };
      s.social.requests.push({ id: Core.makeId('req'), fromId: from.id, fromName: from.name, fromAvatar: from.avatar, sentAt: Core.now(), status: 'pending' });
      emit();
      return { ok: true };
    }
    function acceptRequest(reqId) {
      for (var i = 0; i < s.social.requests.length; i++) {
        if (s.social.requests[i].id === reqId) {
          var rq = s.social.requests[i];
          if (rq.status !== 'pending') return { ok: false, reason: 'not-pending' };
          if (!canAddFriend()) return { ok: false, reason: 'limit' };
          rq.status = 'accepted';
          s.social.friends.push({ id: rq.fromId, name: rq.fromName, gender: '保密', hobbies: '', avatar: rq.fromAvatar, addedAt: Core.now() });
          // 同步 nearby relation
          for (var j = 0; j < s.social.nearby.length; j++) if (s.social.nearby[j].id === rq.fromId) s.social.nearby[j].relation = 'friend';
          emit();
          return { ok: true };
        }
      }
      return { ok: false, reason: 'notfound' };
    }
    function ignoreRequest(reqId) {
      for (var i = 0; i < s.social.requests.length; i++) {
        if (s.social.requests[i].id === reqId) { s.social.requests[i].status = 'ignored'; emit(); return { ok: true }; }
      }
      return { ok: false, reason: 'notfound' };
    }

    // ---------- 聊天 ----------
    function ensureThread(friendId) { if (!s.social.messages[friendId]) s.social.messages[friendId] = []; return s.social.messages[friendId]; }
    function sendMessage(friendId, text) {
      if (!text || !String(text).trim()) return { ok: false, reason: 'empty' };
      var t = ensureThread(friendId);
      t.push({ id: Core.makeId('msg'), fromMe: true, text: String(text).trim(), time: Core.now() });
      emit();
      return { ok: true };
    }
    function receiveMessage(friendId, text) {
      var t = ensureThread(friendId);
      t.push({ id: Core.makeId('msg'), fromMe: false, text: text, time: Core.now() });
      emit();
      return t;
    }

    return {
      get: function () { return s; },
      onChange: onChange, emit: emit,
      updateProfile: updateProfile, setAvatar: setAvatar,
      hasBike: hasBike, getBike: getBike, addBike: addBike, removeBike: removeBike, updateBikePosition: updateBikePosition,
      glowBike: glowBike, ringBike: ringBike, expireBikeFx: expireBikeFx,
      startRide: startRide, appendRidePoint: appendRidePoint, finishRide: finishRide, activeRidePoints: activeRidePoints,
      pauseRide: pauseRide, resumeRide: resumeRide, ensureNearby: ensureNearby, canAddFriend: canAddFriend, sendFriendRequest: sendFriendRequest,
      settleRequest: settleRequest, receiveFriendRequest: receiveFriendRequest,
      acceptRequest: acceptRequest, ignoreRequest: ignoreRequest, removeFriend: removeFriend,
      sendMessage: sendMessage, receiveMessage: receiveMessage
    };
  }

  return { createState: createState };
});
