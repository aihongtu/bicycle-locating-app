/* pages/find.js — 模块1 找车：地图标注、发光/响铃、车信息卡、步行导航、车辆管理(连接/添加/删除/切换)
 * 地图：高德真实地图（若可用），否则回退 Canvas 模拟地图。功能逻辑不变。 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.BikeApp) return;
  var Core = window.BikeApp.Core, ui = window.BikeApp.ui, el = ui.el;
  var MapEngine = window.BikeApp.MapEngine;
  var AmapAPI = window.BikeApp.AmapEngine;   // 静态工具（load/canUse/geoFromSim/haversine）
  var AmapEngine = AmapAPI.AmapEngine;        // 构造函数
  var SimDevice = window.BikeApp.SimDevice;
  var BleDevice = window.BikeApp.BleDevice;

  var YOU = { x: 460, y: 250 }; // 模拟"你"的位置（sim 模式）
  var BASE_GEO = { lng: 121.4325, lat: 31.0290 }; // 演示区：上海交通大学闵行校区
  var simBaseGeo = null; // sim 模式首次真实定位后锚定，避免非上海用户坐标出界

  function mapStylePref() {
    try { return window.localStorage.getItem('bikeapp.mapStyle') === 'realistic' ? 'realistic' : 'p09'; }
    catch (e) { return 'p09'; }
  }

  function create(store, root) {
    var state = store.state;

    function triggerDeviceAction(kind) {
      var bike = state.get().bike;
      var isRealDevice = !!(bike && bike.source === 'bluetooth');
      var send = kind === 'ring' ? BleDevice.sendRing : BleDevice.sendGlow;
      Promise.resolve(send()).then(function (res) {
        if (res.ok) {
          ui.toast(kind === 'ring' ? '已向设备发送响铃指令' : '已向设备发送发光指令');
          if (kind === 'ring') state.ringBike(3); else state.glowBike(8);
          return;
        }
        // Keep the existing local demo behavior for non-hardware bikes.
        if (!isRealDevice) {
          ui.toast(kind === 'ring' ? '已模拟响铃' : '已模拟亮灯');
          if (kind === 'ring') state.ringBike(3); else state.glowBike(8);
          return;
        }
        ui.toast(res.reason === 'not-connected' ? '设备蓝牙已断开，请重新连接' : '设备未能执行该指令');
      }).catch(function () { ui.toast('蓝牙指令发送失败，请检查连接'); });
    }

    // ---- 地图引擎：先默认 sim，高德加载成功后切换为 amap ----
    var simCanvas = el('canvas', { width: 340, height: 420, role: 'img', tabindex: '0', 'aria-label': '模拟地图：显示自行车位置、方向和距离' });
    var simEngine = new MapEngine(simCanvas, {
      dataUrl: 'assets/map/sjtu-minhang.json',
      style: mapStylePref()
    });
    simEngine.kind = 'sim';
    simEngine.setUserGeo(YOU); // sim 模式："我的位置"标记
    var engine = simEngine;
    var canvasHolder = el('div', { class: 'canvas-holder' }, [simCanvas]);

    var statusBar = el('div', { class: 'status-bar' });
    var actionBar = el('div', { class: 'action-bar' });
    var infoModal = el('div', { class: 'modal-mask', style: 'display:none;' });
    var navView = el('div', { class: 'modal-mask nav-mask', style: 'display:none;' });
    var manageModal = el('div', { class: 'modal-mask', style: 'display:none;' });
    var connectModal = el('div', { class: 'modal-mask', style: 'display:none;' });
    var espHasCentered = false;
    var lastDeviceFixAt = 0;

    function isAmap() { return !!engine.map; }

    // 距离：amap 用真实经纬度(Haversine)，sim 用平面距离
    function distanceMeters(from, to) {
      if (isAmap()) {
        var toGeo = AmapAPI.geoFromSim(engine.base, to.x, to.y);
        return Math.round(AmapAPI.haversine(engine._userGeo, toGeo));
      }
      return Math.round(Core.dist2d(from, to) * Core.KM_PER_UNIT * 1000);
    }

    // 当前“我”的模拟坐标：sim 用 getUserGeo，amap 用真实经纬度反算
    function userSimPos() {
      if (isAmap()) {
        var g = engine._userGeo || engine.base;
        return AmapAPI.simFromGeo(engine.base, g.lng, g.lat);
      }
      return engine.getUserGeo ? engine.getUserGeo() : YOU;
    }

    function simBase() { return simBaseGeo || BASE_GEO; }

    function contentPoints() {
      var pts = [userSimPos()];
      var b = state.get().bike;
      if (b && b.position) pts.push(b.position);
      var ride = state.get().rides.today[0];
      if (ride && ride.points && ride.points.length) pts = pts.concat(ride.points);
      return pts;
    }

    function syncBounds() {
      if (!engine.setBoundsFromPoints) return;
      engine.setBoundsFromPoints(contentPoints(), 60);
    }

    function fitView() {
      if (!engine.fitBounds) return;
      if (engine.fitBounds(contentPoints(), 28)) ui.toast('已显示全部内容');
      draw();
    }

    function toggleMapStyle() {
      if (!engine.setMapStyle) { ui.toast('当前为高德地图，无法切换模拟风格'); return; }
      if (!engine.hasMapData()) { ui.toast('离线地图数据未加载，当前区域使用示意地图'); return; }
      var next = engine.getMapStyle() === 'realistic' ? 'p09' : 'realistic';
      try { window.localStorage.setItem('bikeapp.mapStyle', next); } catch (e) {}
      engine.setMapStyle(next);
      draw();
      ui.toast(next === 'realistic' ? '已切换为真实地图风格' : '已切换为 P09 仪器风格');
    }

    function renderStatus() {
      var b = state.get().bike;
      statusBar.innerHTML = '';
      var left;
      if (b) {
        var statusText = b.status;
        if (b.source === 'bluetooth') {
          statusText = BleDevice.isConnected()
            ? (lastDeviceFixAt ? '蓝牙已连接 · GNSS 定位有效' : '蓝牙已连接 · 等待 GNSS 定位')
            : '蓝牙已断开';
        }
        left = el('div', { class: 'status-left' }, [
          el('span', { icon: 'bike', text: b.bikeName }),
          el('span', { class: 'dot ' + (b.status === '在线' && (b.source !== 'bluetooth' || BleDevice.isConnected()) ? 'on' : 'off') }),
          el('span', { class: 'status-text', text: statusText })
        ]);
      } else {
        left = el('div', { class: 'status-left' }, [el('span', { icon: 'bike', text: '未连接车辆' })]);
      }
      statusBar.appendChild(left);
      statusBar.appendChild(el('button', { class: 'mini-btn', icon: 'gear', text: '车辆管理', onclick: showManage }));
    }

    function renderActionBar() {
      var b = state.get().bike;
      actionBar.innerHTML = '';
      if (!b) {
        actionBar.appendChild(el('button', { class: 'big-btn start', icon: 'signal', text: '寻找并连接设备', onclick: showConnect }));
        return;
      }
      actionBar.appendChild(el('button', { class: 'big-btn glow', text: '发光', 'aria-label': '发光', onclick: function () { triggerDeviceAction('glow'); } }));
      actionBar.appendChild(el('button', { class: 'big-btn ring', text: '响铃', 'aria-label': '响铃', onclick: function () { triggerDeviceAction('ring'); } }));
    }

    function draw() {
      syncBounds();
      var b = state.get().bike;
      engine.clear(); engine.drawBase();
      var ride = state.get().rides.today[0];
      if (ride) engine.drawRoute(ride.segments, ride.points);
      if (b) {
        var me = userSimPos();
        engine.drawDirection(me, b.position, distanceMeters(me, b.position) + ' 米');
        engine.drawBike(b.position, b.glow && b.glow.active);
      } else {
        engine.drawBike({ x: 500, y: 400 }, false);
      }
      engine.drawUser(); // 标注"我的位置"（sim:YOU / 高德:getUserGeo）
      engine.drawLegend();
      engine.drawScaleBar();
    }

    function makeControls() {
      var c = el('div', { class: 'map-controls' }, [
        el('button', { class: 'mc-btn icon-only', icon: 'refresh', text: '刷新位置', title: '刷新位置', 'aria-label': '刷新位置', onclick: function () { locateNow(); } }),
        el('button', { class: 'mc-btn icon-only', icon: 'target', text: '定位车', title: '定位车', 'aria-label': '定位车', onclick: function () {
          var b = state.get().bike;
          if (!b) { ui.toast('尚未连接车辆'); return; }
          engine.centerOn(b.position.x, b.position.y); ui.toast('已回到车的位置');
        } }),
        el('button', { class: 'mc-btn icon-only', icon: 'compass', text: '看全', title: '显示全部内容', 'aria-label': '显示全部内容', onclick: fitView }),
        el('button', { class: 'mc-btn icon-only', icon: 'layers', text: '风格', title: '切换地图风格', 'aria-label': '切换地图风格', onclick: toggleMapStyle }),
        el('button', { class: 'mc-btn icon-only', icon: 'plus', text: '放大', title: '放大地图', 'aria-label': '放大地图', onclick: function () { engine.zoomIn(); } }),
        el('button', { class: 'mc-btn icon-only', icon: 'minus', text: '缩小', title: '缩小地图', 'aria-label': '缩小地图', onclick: function () { engine.zoomOut(); } })
      ]);
      return c;
    }

    function applyDevicePosition(geo) {
      var base;
      if (isAmap()) {
        base = engine.base || BASE_GEO;
      } else {
        if (!simBaseGeo) simBaseGeo = geo;
        base = simBase();
      }
      var p = AmapAPI.simFromGeo(base, geo.lng, geo.lat);
      var firstFix = !espHasCentered;
      espHasCentered = true;
      lastDeviceFixAt = Date.now();
      var currentBike = state.get().bike;
      if (!currentBike || currentBike.source !== 'bluetooth') {
        state.addBike(currentBike ? currentBike.bikeName : 'ESP32 车辆', p, { source: 'bluetooth' });
      } else {
        state.updateBikePosition(p.x, p.y);
      }
      if (firstFix) {
        if (isAmap()) engine.map.setCenter([geo.lng, geo.lat]);
        else engine.centerOn(p.x, p.y);
        ui.toast('已收到 ESP32 GNSS 定位');
      }
    }

    function handleDevicePosition(rawGeo) {
      var geo = { lat: rawGeo.lat, lng: rawGeo.lng };
      // GNSS 使用 WGS-84；高德底图使用 GCJ-02，沿用原有坐标转换。
      if (isAmap() && window.AMap && window.AMap.convertFrom) {
        window.AMap.convertFrom([geo.lng, geo.lat], 'gps', function (status, result) {
          if (status === 'complete' && result && result.locations && result.locations.length) {
            var converted = result.locations[0];
            applyDevicePosition({ lng: converted.getLng(), lat: converted.getLat() });
          } else {
            ui.toast('高德坐标转换失败，暂按 GNSS 原始坐标显示');
            applyDevicePosition(geo);
          }
        });
      } else {
        applyDevicePosition(geo);
      }
    }

    function showInfoCard() {
      var b = state.get().bike;
      if (!b) return;
      infoModal.innerHTML = '';
      infoModal.appendChild(el('div', { class: 'modal-card' }, [
        el('h3', { text: b.bikeName }),
        el('p', { text: '停放时间：' + Core.formatTime(b.parkedAt) + ' · ' + Core.formatDate(b.parkedAt) }),
        el('p', { text: '位置描述：附近停车场 / 路边（' + (isAmap() ? '高德真实地图' : '模拟') + '）' }),
        el('p', { text: '距你：' + distanceMeters(userSimPos(), b.position) + ' 米' }),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'mini-btn', icon: 'signal', text: '发光', onclick: function () {
            triggerDeviceAction('glow');
          } }),
          el('button', { class: 'mini-btn', icon: 'bell', text: '响铃', onclick: function () {
            triggerDeviceAction('ring');
          } }),
          el('button', { class: 'mini-btn primary', icon: 'walk', text: '步行导航', onclick: function () { infoModal.style.display = 'none'; showNav(); } })
        ]),
        el('button', { class: 'mini-btn close', text: '关闭', onclick: function () { infoModal.style.display = 'none'; } })
      ]));
      infoModal.style.display = 'flex';
    }

    function showNav() {
      var b = state.get().bike; if (!b) return;
      navView.innerHTML = '';
      navView.appendChild(el('div', { class: 'modal-card nav-card' }, [
        el('h3', { icon: 'walk', text: '步行导航（' + (isAmap() ? '高德真实地图' : '模拟') + '）' }),
        el('div', { class: 'nav-arrow', icon: 'route' }),
        el('p', { text: '直行 60 米，右转' }),
        el('p', { text: '再直行 120 米，到达停车点' }),
        el('p', { class: 'nav-target', text: '目标：' + b.bikeName + '（距你 ' + distanceMeters(userSimPos(), b.position) + ' 米）' }),
        el('button', { class: 'mini-btn primary', icon: 'check', text: '我已到达', onclick: function () { navView.style.display = 'none'; ui.toast('到达，车就在身边'); } }),
        el('button', { class: 'mini-btn close', text: '返回', onclick: function () { navView.style.display = 'none'; } })
      ]));
      navView.style.display = 'flex';
    }

    // ---- 车辆管理（每用户仅一辆车） ----
    function showManage() {
      var b = state.get().bike;
      manageModal.innerHTML = '';
      var bodyEl;
      if (b) {
        var bleConnected = BleDevice.isConnected();
        bodyEl = el('div', { class: 'bike-list' }, [
          el('section', { class: 'vehicle-current-card' }, [
            el('div', { class: 'vehicle-card-main' }, [
              el('div', { class: 'vehicle-mark' }, [ui.icon('bike')]),
              el('div', { class: 'vehicle-copy' }, [
                el('div', { class: 'vehicle-code', text: 'BIKE / 001' }),
                el('div', { class: 'bike-name cur', text: b.bikeName }),
                el('div', { class: 'vehicle-status-line' }, [
                  el('span', { class: 'dot ' + (b.status === '在线' ? 'on' : 'off') }),
                  el('span', { class: 'vehicle-status-text', text: b.status }),
                  bleConnected ? el('span', { class: 'vehicle-connection', text: '蓝牙已连接' }) : null
                ])
              ]),
              el('span', { class: 'vehicle-current-chip', text: '当前使用' })
            ]),
            el('div', { class: 'vehicle-action-row' }, [
            (bleConnected ? el('button', { class: 'mini-btn', icon: 'unlink', text: '断开蓝牙', onclick: function () {
              BleDevice.disconnect(); ui.toast('已断开蓝牙连接'); renderStatus(); showManage();
            } }) : null),
            el('button', { class: 'mini-btn no', icon: 'trash', text: '删除车辆', onclick: function () {
              state.removeBike(); ui.toast('已删除车辆'); showManage(); renderStatus(); renderActionBar(); draw();
            } })
            ])
          ])
        ]);
      } else {
        bodyEl = el('div', { class: 'vehicle-empty' }, [
          el('div', { class: 'vehicle-empty-mark' }, [ui.icon('bike')]),
          el('div', { class: 'vehicle-empty-title', text: '暂无已登记车辆' }),
          el('p', { text: '连接附近设备，或输入名称手动添加。' })
        ]);
      }
      var nameInput = el('input', { class: 'vehicle-name-input', type: 'text', placeholder: '为手动添加的车辆命名' });
      manageModal.appendChild(el('div', { class: 'modal-card' }, [
        el('div', { class: 'vehicle-manage-head' }, [
          el('div', { class: 'vehicle-head-copy' }, [
            el('div', { class: 'vehicle-modal-kicker', text: 'VEHICLE DOSSIER / 01' }),
            el('h3', { text: '车辆管理' })
          ]),
          el('button', { class: 'mini-btn close vehicle-close', icon: 'close', text: '关闭', title: '关闭车辆管理', 'aria-label': '关闭车辆管理', onclick: function () { manageModal.style.display = 'none'; } })
        ]),
        el('div', { class: 'vehicle-section-label', text: '当前车辆　/　CURRENT VEHICLE' }),
        bodyEl,
        el('div', { class: 'vehicle-section-label vehicle-setup-label', text: '连接或添加　/　CONNECT OR REGISTER' }),
        el('div', { class: 'vehicle-field-head' }, [
          el('span', { text: '车辆名称' }),
          el('span', { class: 'vehicle-optional', text: '可选' })
        ]),
        nameInput,
        el('div', { class: 'vehicle-setup-actions' }, [
          el('button', { class: 'mini-btn primary', icon: 'signal', text: '寻找并连接设备', onclick: function () { manageModal.style.display = 'none'; showConnect(); } }),
          el('button', { class: 'mini-btn ok', icon: 'plus', text: '添加车辆', onclick: function () { state.addBike(nameInput.value.trim() || undefined); ui.toast('已添加车辆'); showManage(); renderStatus(); renderActionBar(); draw(); } })
        ])
      ]));
      manageModal.querySelector('.modal-card').classList.add('vehicle-manage-card');
      manageModal.style.display = 'flex';
    }

    // ---- 寻找并连接设备（模拟扫描） ----
    function showConnect() {
      connectModal.innerHTML = '';
      connectModal.appendChild(el('div', { class: 'modal-card' }, [
        el('h3', { icon: 'signal', text: '寻找并连接设备' }),
        el('p', { class: 'scan-line', text: BleDevice.isSupported() ? '正在扫描附近真实蓝牙设备…' : '正在搜索附近设备…' })
      ]));
      connectModal.style.display = 'flex';
      if (BleDevice.isSupported()) {
        // 真实蓝牙：系统选择器只列出提供本 App 自定义服务的 ESP32 设备。
        BleDevice.scanForDevice().then(function (dev) {
          var card = connectModal.querySelector('.modal-card');
          card.innerHTML = '';
          card.appendChild(el('h3', { icon: 'signal', text: '找到设备' }));
          var row = el('div', { class: 'bike-row' }, [
            el('span', { class: 'bike-name', icon: 'link', text: dev.name }),
            el('button', { class: 'mini-btn primary', text: '连接设备', onclick: function () {
              var button = card.querySelector('.mini-btn.primary');
              button.disabled = true; button.textContent = '正在连接…';
              BleDevice.connect(dev.device, {
                onPosition: handleDevicePosition,
                onDisconnect: function () { renderStatus(); }
              }).then(function () {
                espHasCentered = false;
                lastDeviceFixAt = 0;
                var currentBike = state.get().bike;
                if (!currentBike || currentBike.source !== 'bluetooth') {
                  state.addBike(dev.name, userSimPos(), { source: 'bluetooth' });
                }
                ui.toast('已连接 ' + dev.name + '，等待车载 GNSS 定位');
                connectModal.style.display = 'none';
                renderStatus(); renderActionBar(); draw();
              }).catch(function (e) {
                button.disabled = false; button.textContent = '重试连接';
                var note = card.querySelector('.connect-error');
                if (!note) { note = el('p', { class: 'privacy-note connect-error' }); card.appendChild(note); }
                note.textContent = '连接失败：' + ((e && e.message) ? e.message : '请确认设备已上电并运行固件');
              });
            } })
          ]);
          card.appendChild(row);
          card.appendChild(el('button', { class: 'mini-btn', icon: 'refresh', text: '重新扫描', onclick: showConnect }));
        }).catch(function (e) {
          var card = connectModal.querySelector('.modal-card');
          card.innerHTML = '';
          card.appendChild(el('h3', { icon: 'signal', text: '未选择设备' }));
          card.appendChild(el('p', { class: 'privacy-note', text: '已取消或未找到设备：' + ((e && e.message) ? e.message : '未选择') }));
          card.appendChild(el('button', { class: 'mini-btn close', text: '关闭', onclick: function () { connectModal.style.display = 'none'; } }));
        });
      } else {
        // 浏览器不支持 Web Bluetooth：回退模拟设备扫描
        setTimeout(function () {
          var devices = SimDevice.listDevices();
          var card = connectModal.querySelector('.modal-card');
          card.innerHTML = '';
          card.appendChild(el('h3', { icon: 'signal', text: '发现 ' + devices.length + ' 个设备' }));
          var dl = el('div', { class: 'device-list' });
          devices.forEach(function (dev) {
            dl.appendChild(el('div', { class: 'bike-row' }, [
              el('span', { class: 'bike-name', text: dev.name + '（' + dev.rssi + ' dBm）' }),
              el('button', { class: 'mini-btn primary', text: '连接', onclick: function () {
                state.addBike(dev.name);
                ui.toast('已连接 ' + dev.name);
                connectModal.style.display = 'none';
                renderStatus(); renderActionBar(); draw();
              } })
            ]));
          });
          card.appendChild(dl);
          card.appendChild(el('button', { class: 'mini-btn close', text: '关闭', onclick: function () { connectModal.style.display = 'none'; } }));
        }, 1500);
      }
    }

    // ---- 地图点击：sim 用 canvas 坐标换算，amap 用引擎回传 ----
    function bindClick() {
      if (engine.map) {
        engine.onClick(function (p) {
          var b = state.get().bike;
          if (b && Core.dist2d(p, b.position) < 20) showInfoCard();
        });
      } else {
        simCanvas.addEventListener('click', function (e) {
          var rect = simCanvas.getBoundingClientRect();
          var sx = (e.clientX - rect.left) * (simCanvas.width / rect.width);
          var sy = (e.clientY - rect.top) * (simCanvas.height / rect.height);
          var w = engine.view.screenToWorld(sx, sy);
          var b = state.get().bike;
          var hit = 20 / engine.view.getView().scale;
          if (b && Core.dist2d(w, b.position) < hit) showInfoCard();
        });
      }
    }

    // ---- 统一真实定位：sim/高德都请求定位权限，更新"我的位置"，刷新后保证精确 ----
    function locateNow() {
      if (!navigator.geolocation) { ui.toast('当前浏览器不支持定位'); return; }
      ui.confirmPrivacy(function (ok) {
        if (!ok) { ui.toast('未授权定位，无法刷新位置'); return; }
        navigator.geolocation.getCurrentPosition(function (pos) {
          var geo = { lng: pos.coords.longitude, lat: pos.coords.latitude };
          if (isAmap()) {
            engine.setUserGeo(geo);
            engine.map.setCenter([geo.lng, geo.lat]); // 我的位置蓝点可见
          } else {
            if (!simBaseGeo) simBaseGeo = geo; // 首次定位锚定本地坐标原点
            var p = AmapAPI.simFromGeo(simBase(), geo.lng, geo.lat);
            simEngine.setUserGeo(p);
            simEngine.setUserAccuracy(pos.coords.accuracy);
            engine.centerOn(p.x, p.y);
            syncBounds();
          }
          draw();
          ui.toast('位置已刷新：' + Core.accuracyLabel(pos.coords.accuracy));
        }, function () { ui.toast('定位失败：请检查定位权限或网络'); }, Core.geoOptions());
      });
    }

    // ---- 尝试接入高德真实地图（含真实定位） ----
    function tryAmap() {
      if (window.location.search.indexOf('sim=1') >= 0) return; // ?sim=1 强制查看模拟地图
      AmapAPI.load(function (ok) {
        if (!ok || !AmapAPI.canUse()) return; // 保持 sim
        var div = el('div', { class: 'amap-box' });
        canvasHolder.innerHTML = ''; canvasHolder.appendChild(div);
        engine = new AmapEngine(div, { zoom: 15, base: BASE_GEO });
        engine.kind = 'amap';
        engine.onRedraw(draw);
        bindClick();
        // 立即以默认基准绘制，定位成功后更新
        var b = state.get().bike; if (b) engine.centerOn(b.position.x, b.position.y);
        draw();
        if (navigator.geolocation) {
          ui.confirmPrivacy(function (ok) {
            if (!ok) return; // 未授权：保持默认基准（不真实定位）
            navigator.geolocation.getCurrentPosition(function (pos) {
              engine.setUserGeo({ lng: pos.coords.longitude, lat: pos.coords.latitude });
              if (isAmap()) {
                // 定位成功后把地图中心移到"我的位置"，蓝点标记可见
                engine.map.setCenter([pos.coords.longitude, pos.coords.latitude]);
              } else {
                var b2 = state.get().bike; if (b2) engine.centerOn(b2.position.x, b2.position.y);
              }
              draw();
              ui.toast('已定位：' + Core.accuracyLabel(pos.coords.accuracy));
            }, function () {}, Core.geoOptions());
          });
        }
      });
    }

    root.innerHTML = '';
    root.appendChild(el('div', { class: 'page find-page' }, [
      statusBar, el('div', { class: 'map-wrap' }, [canvasHolder, makeControls()]), actionBar, infoModal, navView, manageModal, connectModal
    ]));

    simEngine.resize();
    setInterval(function () { state.expireBikeFx(); }, 1000); // 发光/响铃到期后自动重绘

    (function () { var b = state.get().bike; if (b) engine.centerOn(b.position.x, b.position.y); })();
    engine.onRedraw(draw);
    bindClick();
    tryAmap();
    locateNow(); // 初始化即请求真实定位（手机无论高德还是 sim 都会问权限并定位）

    state.onChange(function () { renderStatus(); renderActionBar(); draw(); });
    renderStatus(); renderActionBar(); draw();
  }

  window.BikeApp.Pages = window.BikeApp.Pages || {};
  window.BikeApp.Pages.Find = { create: create };
})();
