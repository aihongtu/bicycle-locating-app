/* privacy.js — 真实定位隐私授权的同意状态（本地持久化，不涉及展示 UI）。
 * 用可注入的 storage（浏览器 localStorage / 测试 mock）记录用户是否已同意使用定位。
 * UI 展示在 ui.confirmPrivacy；本模块只负责状态判定与写入。UMD。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.Privacy = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'bikeapp.privacyConsent';

  // 是否已同意定位隐私（默认未同意）
  function consented(storage) {
    try { return !!(storage && storage.getItem && storage.getItem(KEY) === '1'); }
    catch (e) { return false; }
  }

  // 写入同意（持久化），失败返回 false
  function grant(storage) {
    try { if (storage && storage.setItem) { storage.setItem(KEY, '1'); return true; } }
    catch (e) { }
    return false;
  }

  return { KEY: KEY, consented: consented, grant: grant };
});
