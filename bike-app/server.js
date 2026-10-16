/* server.js — 本地静态服务器（零依赖，Node 内置 http/https）
 * 用途：让 App 通过 http://localhost 运行，满足高德 JS API 加载要求；
 *       并额外启用 HTTPS（自签名证书），使局域网/VPN 设备访问时也能用定位与蓝牙。
 * 启动：在 bike-app 目录执行 `node server.js`。
 * 端口：HTTP 默认 8080，HTTPS 默认 8443，可用环境变量 PORT / HTTPS_PORT 覆盖。 */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 8080;
const httpsPort = Number(process.env.HTTPS_PORT) || 8443;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

function handler(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const fp = path.normalize(path.join(root, p));
  if (fp.indexOf(root) !== 0) { res.writeHead(403); return res.end('403'); }
  fs.readFile(fp, function (err, data) {
    if (err) { res.writeHead(404); return res.end('404 Not Found'); }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer(handler).listen(port, function () {
  console.log('HTTP  已启动: http://localhost:' + port);
});

// HTTPS（自签名证书）：供局域网/VPN 设备访问，启用真实定位与蓝牙
const certPath = path.join(root, 'certs', 'cert.pem');
const keyPath = path.join(root, 'certs', 'key.local.pem');
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  try {
    https.createServer({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    }, handler).listen(httpsPort, function () {
      console.log('HTTPS 已启动: https://localhost:' + httpsPort + '  （自签名证书，供局域网/VPN 设备访问启用定位与蓝牙）');
    });
  } catch (e) { console.error('HTTPS 启动失败: ' + e.message); }
} else {
  console.log('未找到证书(certs/cert.pem 与 key.pem)，仅启用 HTTP。');
}
