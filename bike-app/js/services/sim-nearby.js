/* sim-nearby.js — 已移除虚拟骑友：不再生成虚拟人、不再自动通过/拒绝好友、不再自动回复。
 * 附近与好友仅来自真实用户数据（第一版无后端，真实用户由外部数据注入）。
 * buildNearby(riders) 仅用于把真实用户列表转为"附近项"结构（无任何默认虚拟数据）。UMD，可在 Node 测试。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.SimNearby = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 把给定的真实用户列表转为"今天擦肩"附近项；riders 为空则返回空（不生成虚拟人）
  function buildNearby(riders, ts) {
    ts = ts || Date.now();
    return (riders || []).map(function (r, i) {
      return {
        id: r.id, name: r.name, gender: r.gender || '保密', hobbies: r.hobbies || '',
        avatar: r.avatar || { type: 'preset', presetId: 'p1' },
        meetTime: ts - i * 3600000,       // 每人相隔1小时
        distanceAtMeet: (r.distanceAtMeet || 30) + i * 35,
        relation: 'none',                 // none|requested|friend|rejected
        lastRequestAt: 0
      };
    });
  }

  return { buildNearby: buildNearby };
});
