/* backup.js — 备份导出 / 恢复导入（含头像）。UMD。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.Backup = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function exportBackup(storage, ts) {
    var data = {};
    storage.allKeys().forEach(function (k) {
      var v = storage.getJSON(k);
      if (v != null) data[k] = v;
    });
    var avatars = {};
    storage.avatarKeys().forEach(function (id) { avatars[id] = storage.getAvatar(id); });
    return { version: 1, exportedAt: (ts || Date.now()), data: data, avatars: avatars };
  }

  function importBackup(storage, json) {
    if (!json || typeof json !== 'object') throw new Error('备份数据无效');
    if (!json.data || typeof json.data !== 'object') throw new Error('备份缺少 data 数据');
    storage.allKeys().forEach(function (k) {
      storage.setJSON(k, (json.data[k] != null) ? json.data[k] : null);
    });
    var existing = storage.avatarKeys();
    existing.forEach(function (id) { storage.removeAvatar(id); });
    if (json.avatars) {
      Object.keys(json.avatars).forEach(function (id) {
        if (json.avatars[id] != null) storage.setAvatar(id, json.avatars[id]);
      });
    }
    return true;
  }

  return { exportBackup: exportBackup, importBackup: importBackup };
});
