/* amap-config.js — 可安全提交的默认地图配置。
 * 本地高德凭据放在被 .gitignore 忽略的 amap-config.local.js 中。 */
(function (root) {
  var config = { key: '', securityJsCode: '', provider: 'amap' };
  if (typeof module === 'object' && module.exports) { module.exports = config; }
  else {
    root.BikeApp = root.BikeApp || {};
    root.BikeApp.AMapConfig = config;
  }
})(typeof self !== 'undefined' ? self : this);
