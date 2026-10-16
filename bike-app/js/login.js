/* login.js — 登录方式：游客访问(guest) / 微信账号(wechat)。
 * 纯前端本地版无法做真实微信 OAuth（需微信开放平台 AppID + 服务端），
 * 微信登录为"模拟授权"（记录微信昵称并标记登录方式），真实接入时替换。
 * 状态持久化到可注入 storage。UMD，可在 Node 测试。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.Login = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'bikeapp.login';

  function defaults() { return { mode: 'guest', wechatNick: '' }; }

  function current(storage) {
    try {
      var raw = storage && storage.getItem ? storage.getItem(KEY) : null;
      if (raw) {
        var v = JSON.parse(raw);
        if (v && (v.mode === 'wechat' || v.mode === 'guest')) {
          v.wechatNick = typeof v.wechatNick === 'string' ? v.wechatNick : '';
          return v;
        }
      }
    } catch (e) { }
    return defaults();
  }

  function save(storage, info) {
    try { if (storage && storage.setItem) { storage.setItem(KEY, JSON.stringify(info)); return true; } } catch (e) { }
    return false;
  }

  // 游客访问
  function loginGuest(storage) {
    var s = { mode: 'guest', wechatNick: '' };
    save(storage, s); return s;
  }

  // 微信账号（模拟授权）登录
  function loginWechat(storage, nick) {
    var s = { mode: 'wechat', wechatNick: (nick && nick.trim()) || '微信用户' };
    save(storage, s); return s;
  }

  function isWechat(storage) { return current(storage).mode === 'wechat'; }

  return { KEY: KEY, current: current, loginGuest: loginGuest, loginWechat: loginWechat, isWechat: isWechat };
});
