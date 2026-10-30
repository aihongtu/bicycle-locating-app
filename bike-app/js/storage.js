/* storage.js — 本地持久化服务：localStorage(结构化JSON) + IndexedDB(头像图片)
 * 支持注入 backend 以便在 Node 中测试。UMD。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.Storage = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEYS = {
    PROFILE: 'bikeapp.profile',
    BIKE: 'bikeapp.bike',
    RIDES: 'bikeapp.rides',
    SOCIAL: 'bikeapp.social',
    // 设置类数据也纳入备份/恢复；activeTab、returnTab 属于临时状态，不放进来。
    THEME: 'bikeapp.theme',
    LANGUAGE: 'bikeapp.language',
    PRIVACY: 'bikeapp.privacyConsent'
  };

  function createStorage(backend, avatarBackend) {
    // backend: {getItem,setItem,removeItem}  (localStorage 类似物)
    // avatarBackend: {get(id),set(id,data),keys(),remove(id)} (IndexedDB 类似物)
    if (!backend) backend = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
    if (!avatarBackend) avatarBackend = { get: function () { return null; }, set: function () {}, keys: function () { return []; }, remove: function () {} };

    function getJSON(key) {
      try {
        var raw = backend.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) { return null; }
    }
    function setJSON(key, val) {
      try {
        backend.setItem(key, JSON.stringify(val));
      } catch (e) {
        // localStorage 配额不足时不要静默失败：给用户一次可见提示。
        if (typeof window !== 'undefined' && window.BikeApp && window.BikeApp.ui) {
          window.BikeApp.ui.toast('本地存储空间不足，部分数据可能未保存');
        }
      }
    }

    function allKeys() { var k = []; for (var p in KEYS) { k.push(KEYS[p]); } return k; }
    function reset() {
      for (var p in KEYS) { backend.removeItem(KEYS[p]); }
      var avs = avatarBackend.keys(); for (var i = 0; i < avs.length; i++) { avatarBackend.remove(avs[i]); }
    }

    return {
      KEYS: KEYS,
      getJSON: getJSON, setJSON: setJSON,
      getAvatar: function (id) { return avatarBackend.get(id) || null; },
      setAvatar: function (id, data) { avatarBackend.set(id, data); },
      removeAvatar: function (id) { avatarBackend.remove(id); },
      avatarKeys: function () { return avatarBackend.keys(); },
      allKeys: allKeys,
      reset: reset
    };
  }

  return { createStorage: createStorage, KEYS: KEYS };
});
