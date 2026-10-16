/* HTTPS 支持 — server.js 同时提供 HTTP 与 HTTPS（自签名证书，供局域网/VPN 设备访问） 测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const fs = require('fs');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'server.js');

test('server.js 同时支持 HTTP 与 HTTPS（自签名证书）', () => {
  const src = fs.readFileSync(SERVER, 'utf8');
  ok(src.includes("require('https')"), '应引入 https 模块');
  ok(/https\.createServer/.test(src), '应创建 HTTPS 服务器');
  ok(/certs[\\/]cert\.pem/.test(src), '应读取 certs 目录下的证书');
  ok(src.includes('certs'), '应引用 certs 目录');
  ok(/listen\(\s*httpsPort\b/.test(src), 'HTTPS 应有独立端口(HTTPS_PORT/8443)');
  ok(/listen\(\s*port\b/.test(src), 'HTTP 默认端口 8080 应保留');
  ok(src.includes('HTTPS_PORT'), '应支持 HTTPS_PORT 环境变量');
});

test('HTTPS 私钥使用本地忽略文件（避免提交）', () => {
  ok(fs.existsSync(path.join(__dirname, '..', 'certs', 'cert.pem')), 'cert.pem 应存在');
  const server = fs.readFileSync(SERVER, 'utf8');
  ok(server.includes("'key.local.pem'"), 'server.js 应读取本地 key.local.pem');
  const gitignore = fs.readFileSync(path.join(__dirname, '..', '..', '.gitignore'), 'utf8');
  ok(gitignore.includes('/bike-app/certs/key.local.pem'), '私钥文件应被 Git 忽略');
});
