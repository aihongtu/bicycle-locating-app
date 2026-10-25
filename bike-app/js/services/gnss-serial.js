/* gnss-serial.js — read Quectel EC200U GNSS coordinates through the computer's USB serial port. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.BikeApp = root.BikeApp || {}; root.BikeApp.GnssSerial = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var port = null;
  var reader = null;
  var active = false;
  var readerTask = null;
  var pollTimer = null;
  var decoder = null;
  var lineBuffer = '';
  var callbacks = {};
  var lastStatus = '';
  var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

  function isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.serial && typeof navigator.serial.requestPort === 'function';
  }

  function notifyStatus(message) {
    if (message === lastStatus) return;
    lastStatus = message;
    if (callbacks.onStatus) callbacks.onStatus(message);
  }

  function emitLine(line) {
    line = line.trim();
    if (!line) return;
    if (callbacks.onLine) callbacks.onLine(line);
    var marker = line.indexOf('+QGPSLOC:');
    if (marker < 0) {
      if (/\+(?:CME|CMS) ERROR: 516/.test(line)) notifyStatus('GNSS 已开启，正在等待卫星定位；请把天线放到室外开阔处');
      return;
    }
    // Mode 2 is decimal degrees: UTC, latitude, longitude, HDOP, altitude, ...
    var fields = line.slice(marker + '+QGPSLOC:'.length).split(',');
    var lat = Number(String(fields[1] || '').replace(/["']/g, '').trim());
    var lng = Number(String(fields[2] || '').replace(/["']/g, '').trim());
    var hdop = Number(String(fields[3] || '').replace(/["']/g, '').trim());
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
      notifyStatus('GNSS 返回了数据，但经纬度格式无效');
      return;
    }
    if (callbacks.onPosition) callbacks.onPosition({ lat: lat, lng: lng, hdop: isFinite(hdop) ? hdop : null, receivedAt: Date.now(), raw: line });
  }

  function feedText(text) {
    lineBuffer += text;
    var lines = lineBuffer.split(/\r?\n/);
    lineBuffer = lines.pop() || '';
    lines.forEach(emitLine);
  }

  async function readLoop() {
    decoder = new TextDecoder();
    try {
      while (active && port && port.readable) {
        reader = port.readable.getReader();
        try {
          while (active) {
            var result = await reader.read();
            if (result.done) break;
            if (result.value) feedText(decoder.decode(result.value, { stream: true }));
          }
        } finally {
          try { reader.releaseLock(); } catch (e) {}
          reader = null;
        }
      }
    } catch (error) {
      if (active) notifyStatus('串口读取中断：' + (error && error.message ? error.message : '请检查 USB 连接'));
    }
  }

  async function send(command) {
    if (!port || !port.writable || !encoder) return;
    var writer = port.writable.getWriter();
    try { await writer.write(encoder.encode(command + '\r\n')); }
    finally { writer.releaseLock(); }
  }

  async function connect(options) {
    if (!isSupported()) throw new Error('当前浏览器不支持 USB 串口；请用 Chrome 或 Edge 打开 localhost 地址');
    if (active) return true;
    callbacks = options || {};
    lastStatus = '';
    notifyStatus('请选择 GNSS 模块对应的串口');
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    active = true;
    lineBuffer = '';
    readerTask = readLoop();
    notifyStatus('串口已连接，正在启动 GNSS…');
    await send('AT');
    await new Promise(function (resolve) { setTimeout(resolve, 250); });
    await send('AT+QGPS=1');
    pollTimer = setInterval(function () { send('AT+QGPSLOC=2').catch(function (e) { notifyStatus('读取 GNSS 失败：' + e.message); }); }, 3000);
    notifyStatus('GNSS 已启动，等待定位结果…');
    return true;
  }

  async function disconnect() {
    active = false;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (reader) { try { await reader.cancel(); } catch (e) {} }
    if (readerTask) { try { await readerTask; } catch (e) {} readerTask = null; }
    if (port) { try { await port.close(); } catch (e) {} port = null; }
    lineBuffer = '';
    notifyStatus('GNSS 串口已断开');
  }

  return { isSupported: isSupported, connect: connect, disconnect: disconnect, isConnected: function () { return active; } };
});
