/* 局域网访问 — server 监听所有接口 + 局域网 IP 可达 测试 */
'use strict';
const { test, eq, ok } = require('./harness');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SERVER = path.join(__dirname, '..', 'server.js');

function allLanIPv4() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const n of ifs[name] || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

test('server.js 监听所有接口（无 host 限制），局域网设备可访问', () => {
  const src = fs.readFileSync(SERVER, 'utf8');
  ok(/\.listen\(\s*port\b/.test(src), 'listen 应使用 port 而无 host 参数（node 默认监听所有接口）');
  ok(!/\.listen\(\s*['"]localhost/.test(src), '不应限制为 localhost');
});

test('局域网 IP 可访问 index.html（HTTP 200，需服务器运行）', () => {
  const ips = allLanIPv4();
  ok(ips.length > 0, '本机应存在非回环 IPv4，实际=' + JSON.stringify(ips));
  let okAny = false, last = '';
  for (const ip of ips) {
    const script = "const h=require('http');h.get({host:'" + ip + "',port:8080,path:'/index.html',timeout:5000},r=>{console.log(r.statusCode);process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(2))";
    let code = '';
    try { code = execSync('node -e "' + script + '"', { encoding: 'utf8', timeout: 10000 }).trim(); }
    catch (e) { code = 'ERR'; }
    last = ip + ':' + code;
    if (code === '200') { okAny = true; break; }
  }
  ok(okAny, '至少一个局域网 IP 应返回 200（实际检查：' + last + '）');
});
