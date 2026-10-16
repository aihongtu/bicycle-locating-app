/*
 * 本地高德地图配置模板。
 * 复制为 amap-config.local.js，填入自己的 Key 和安全密钥；真实配置文件已加入 .gitignore。
 * 在高德控制台为 Key 设置允许的来源域名。
 */
(function (root) {
  root.BikeApp = root.BikeApp || {};
  root.BikeApp.AMapConfig = {
    key: '',
    securityJsCode: '',
    provider: 'amap'
  };
})(typeof self !== 'undefined' ? self : this);
