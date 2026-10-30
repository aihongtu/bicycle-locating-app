/* store.js — 浏览器端：将 State 与本地存储打通，加载/保存 + 订阅触发重渲染 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.BikeApp) return;
  var Core = window.BikeApp.Core, State = window.BikeApp.State, Storage = window.BikeApp.Storage;

  // ---- 浏览器后端 ----
  function localStorageBackend() {
    return {
      getItem: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
      setItem: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
      removeItem: function (k) { try { window.localStorage.removeItem(k); } catch (e) {} }
    };
  }
  function idbBackend() {
    var storeName = 'bikeapp.avatars';
    var dbp = null;
    function open() {
      if (dbp) return dbp;
      return new Promise(function (resolve, reject) {
        var req = window.indexedDB.open('bikeapp', 1);
        req.onupgradeneeded = function () { if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName); };
        req.onsuccess = function () { dbp = req.result; resolve(dbp); };
        req.onerror = function () { reject(req.error); };
      });
    }
    function tx(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction(storeName, mode);
          var store = t.objectStore(storeName);
          var out = fn(store);
          t.oncomplete = function () { resolve(out && out.result); };
          t.onerror = function () { reject(t.error); };
        });
      });
    }
    return {
      get: function (id) { return tx('readonly', function (s) { return s.get(id); }); },
      set: function (id, data) { return tx('readwrite', function (s) { return s.put(data, id); }); },
      remove: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); },
      keys: function () { return tx('readonly', function (s) { return s.getAllKeys(); }); }
    };
  }

  // ---- 创建应用 ----
  var storage = Storage.createStorage(localStorageBackend(), idbBackend());
  var rawBike = storage.getJSON(storage.KEYS.BIKE);
  var hasStoredBike = false;
  try { hasStoredBike = window.localStorage.getItem(storage.KEYS.BIKE) !== null; } catch (e) {}
  var initial = {
    profile: storage.getJSON(storage.KEYS.PROFILE) || Core.defaultProfile(),
    // 兼容：旧格式为单辆对象，或 {list,activeId}
    // 没有存储时传 undefined，让 State 给默认车；存储里是 null 才表示“已删除”
    bike: hasStoredBike ? (rawBike && !rawBike.list ? rawBike : null) : undefined,
    bikes: (hasStoredBike && rawBike && rawBike.list) ? rawBike : undefined,
    bikeProvided: hasStoredBike,
    rides: storage.getJSON(storage.KEYS.RIDES) || { today: [], history: [] },
    social: storage.getJSON(storage.KEYS.SOCIAL) || { nearby: [], requests: [], friends: [], messages: {} }
  };
  var state = State.createState(initial);

  var saveTimer = null;
  state.onChange(function (s) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      storage.setJSON(storage.KEYS.PROFILE, s.profile);
      storage.setJSON(storage.KEYS.BIKE, s.bike);
      storage.setJSON(storage.KEYS.RIDES, s.rides);
      storage.setJSON(storage.KEYS.SOCIAL, s.social);
    }, 50);
  });

  // 头像存 IndexedDB（异步）
  function persistAvatar(avatar) {
    if (avatar && avatar.type === 'upload' && avatar.imageData) {
      storage.setAvatar('upload.' + avatar.key, avatar.imageData).then(function () {
        avatar.persisted = true; state.emit();
      }).catch(function () {});
    }
  }

  window.BikeApp.store = { state: state, storage: storage, persistAvatar: persistAvatar };

  // 上传头像转存为带 key 的对象
  function uploadAvatarAs(dataUrl) {
    var avatar = { type: 'upload', key: Core.makeId('up').replace('up_', ''), imageData: dataUrl, persisted: false };
    state.setAvatar(avatar);
    persistAvatar(avatar);
    return avatar;
  }
  function pickPresetAvatar(presetId) { state.setAvatar({ type: 'preset', presetId: presetId }); return state.get().profile.avatar; }

  window.BikeApp.avatarApi = { uploadAvatarAs: uploadAvatarAs, pickPresetAvatar: pickPresetAvatar };
})();
