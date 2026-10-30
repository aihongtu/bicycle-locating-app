/* ui.js — 浏览器 DOM 工具：el 构造、toast、头像渲染、常用格式化 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.BikeApp) return;
  var I18n = window.BikeApp.I18n;

  // P09 line-icon set: monochrome SVGs use the current UI color and preserve text labels.
  var ICON_PATHS = {
    bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="m6 16 4-8 4 8H6m4-8h4m1-3h3"/>',
    signal: '<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="6.7" stroke-dasharray="1.5 2.2" opacity=".72"/><path d="M12 1.8v2.8m0 14.8v2.8M1.8 12h2.8m14.8 0h2.8M4.8 4.8l2 2m10.4 10.4 2 2m0-14.4-2 2M6.8 17.2l-2 2"/>',
    bell: '<path d="M7 16.5h10l-1.4-2.1V9a3.6 3.6 0 0 0-7.2 0v5.4L7 16.5Z"/><path d="M10 19.5h4M3.8 8.5 2.5 7M20.2 8.5 21.5 7"/>',
    target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.4"/><path d="M12 1.5v3m0 15v3m10.5-10.5h-3m-15 0h-3"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3"/>',
    walk: '<circle cx="13" cy="4.5" r="2"/><path d="m11 8-3 4 3 2 1 6m-4-8-3 5m9-7 3 3 3 1m-8-4 3 4-2 4"/>',
    check: '<path d="m5 12 4.2 4.2L19 6.5"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    minus: '<path d="M4 12h16"/>',
    link: '<path d="M10 13.5 8.5 15a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M14 10.5l1.5-1.5a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0M8.5 12h7"/>',
    unlink: '<path d="m9 15-1.5 1.5a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0M15 9l1.5-1.5a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0M4 4l16 16"/>',
    trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="1.5"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h2m4 0h2M8 17h2"/>',
    flame: '<path d="M12 22c4.2 0 7-2.9 7-6.6 0-3.1-1.7-5.1-4.1-7.4-.1 2-1.1 3.2-2.1 3.8C13 7.5 10.9 4.5 8 2 8.4 6.7 5 9.2 5 14.8 5 19 7.9 22 12 22Z"/><path d="M12 19c1.5 0 2.5-1.1 2.5-2.5 0-1-.6-1.8-1.5-2.7-.2 1-.6 1.4-1.1 1.7-.2-1.2-.8-2.2-1.8-3.2-.1 1.8-1.1 2.5-1.1 4.1C9 17.9 10.1 19 12 19Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="1"/>',
    route: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3h1"/>',
    gender: '<circle cx="10" cy="14" r="5"/><path d="m14 10 6-6m-5 0h5v5M10 19v4m-3-2h6"/>',
    cake: '<path d="M4 12h16v9H4zM3 12c0-2 2-3 4-3s4 1 5 3c1-2 3-3 5-3s4 1 4 3M8 5v2m4-4v3m4-1v2"/>',
    mountain: '<path d="m2.5 20 7.2-13 3.1 5 2.3-3.5L22 20H2.5Z"/><path d="m7 12 2 1.5 1.8-1.5m4 1 1.5 1 1.6-1"/>',
    edit: '<path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z"/><path d="m13.5 7 3.5 3.5M4 21h16"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 20h16"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-3l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.5-2.6 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h3l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.5 2.6-1.4 1.1a8 8 0 0 1 0 2Z"/>',
    privacy: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1H3Zm12-12a3 3 0 1 1 2.5 3M18 14a4 4 0 0 1 3 4v2h-3"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M4 21a8 8 0 0 1 16 0M12 2v2"/>',
    chart: '<path d="M4 20V11m5 9V5m5 15v-7m5 7V3"/><path d="M2 21h20"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.5 5.1-5.1 2.5 2.5-5.1 5.1-2.5Z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 18 9 5 9-5"/>'
  };

  function iconNode(name) {
    var span = document.createElement('span');
    span.className = 'ui-icon ui-icon-' + name;
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + (ICON_PATHS[name] || ICON_PATHS.compass) + '</svg>';
    return span;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    var iconName = null;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = I18n ? I18n.translate(attrs[k]) : attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'style') node.style.cssText = attrs[k];
        else if (k === 'icon') iconName = attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else node.setAttribute(k, (I18n && (k === 'title' || k === 'aria-label' || k === 'placeholder')) ? I18n.translate(attrs[k]) : attrs[k]);
      });
    }
    if (iconName) node.insertBefore(iconNode(iconName), node.firstChild);
    (children || []).forEach(function (ch) {
      if (ch == null) return;
      node.appendChild(typeof ch === 'string' ? document.createTextNode(I18n ? I18n.translate(ch) : ch) : ch);
    });
    return node;
  }

  function toast(msg) {
    var box = document.getElementById('toast-box');
    if (!box) return;
    var t = el('div', { class: 'toast', text: msg });
    box.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }

  // P09 original vector portrait set: preserve concept IDs 01, 03, 04, 05, 06.
  // p2 is a compatibility alias for retired preset 02 and displays preset 01.
  var PRESET_PORTRAITS = {
    p1: { gender:'男', skin:'#f0cfbc', hair:'#7a7c6a', style:'part', coat:'#263c3c', bg:'#d6e2df', face:'oval', accessory:'无配件', eye:'#27342e' },
    p3: { gender:'男', skin:'#d4a17d', hair:'#3d4540', style:'side', coat:'#34454b', bg:'#d1dad3', face:'narrow', accessory:'细框眼镜', eye:'#27342e' },
    p4: { gender:'女', skin:'#f4d4b5', hair:'#8d6254', style:'braid', coat:'#30433e', bg:'#bfd0ca', face:'oval', accessory:'发夹', eye:'#37483d', freckles:true, highCollar:true },
    p5: { gender:'男', skin:'#bd886b', hair:'#252e2a', style:'cap', coat:'#43534a', bg:'#d0d6ca', face:'long', accessory:'骑行镜', eye:'#27342e', highCollar:true },
    p6: { gender:'女', skin:'#e8c3a1', hair:'#b7aa8b', style:'pixie', coat:'#263c3c', bg:'#cad7d2', face:'narrow', accessory:'耳麦', eye:'#385055', freckles:true, highCollar:true }
  };

  function presetHair(p) {
    var shapes = {
      side: '<path d="M18 29Q17 8 36 8Q54 10 50 29L44 25Q40 19 39 16 32 24 19 26Z" fill="' + p.hair + '"/><path d="M32 12Q26 21 25 30" fill="none" stroke="#ffffff55" stroke-width="1.4"/>',
      part: '<path d="M17 30Q15 8 35 7Q55 9 51 30L46 26 43 17Q34 22 31 17 27 25 19 26Z" fill="' + p.hair + '"/>',
      braid: '<path d="M17 30Q14 8 34 7Q54 8 52 30L50 50 46 51 44 33 22 31 21 49 16 49Z" fill="' + p.hair + '"/><path d="M49 31q8 4 4 10t2 10q-5 3-2 8" fill="none" stroke="' + p.hair + '" stroke-width="5" stroke-linecap="round"/><path d="M48 40l7 2m-7 7 7 1" stroke="#ffffff55" stroke-width="1.2"/>',
      cap: '<path d="M18 28Q17 13 30 10L32 4 39 10Q51 13 50 29L44 25 41 18Q32 24 20 25Z" fill="' + p.hair + '"/><path d="M20 19q16-9 31 1l8 5q-19 5-39-1z" fill="#39443e"/><path d="M29 14q8-4 15 0" fill="none" stroke="#b7d94a" stroke-width="1.3"/>',
      pixie: '<path d="M18 31Q14 12 30 8L28 14 36 8Q51 10 50 29L44 25 41 17Q33 23 20 26Z" fill="' + p.hair + '"/>'
    };
    return (p.gender === '女' && p.style === 'braid'
      ? '<path d="M17 32Q12 8 34 7Q57 8 52 34L50 54Q47 61 44 57L43 35 25 34 23 57Q17 57 16 50Z" fill="' + p.hair + '"/>'
      : '') + (shapes[p.style] || shapes.part);
  }

  function presetPortraitSvg(p) {
    var faceRx = p.face === 'narrow' ? 12.5 : p.face === 'long' ? 13.5 : 14.5;
    var faceRy = p.face === 'long' ? 20 : 18.5;
    var accessory = '';
    if (p.accessory === '细框眼镜') accessory = '<g fill="none" stroke="#28322e" stroke-width="1.2"><rect x="22" y="26" width="10" height="7" rx="2"/><rect x="36" y="26" width="10" height="7" rx="2"/><path d="M32 29h4"/></g>';
    if (p.accessory === '耳麦') accessory = '<path d="M18 31Q17 12 34 12Q51 12 50 31M17 29v8h4v-8m27 0v8h-4v-8" fill="none" stroke="#26332f" stroke-width="2"/>';
    if (p.accessory === '发夹') accessory = '<path d="M43 18l7 3-4 5-7-3z" fill="#90b919"/>';
    if (p.accessory === '骑行镜') accessory = '<path d="M21 27q5-4 11 0v6q-6 3-11-1zm15 0q5-4 11 0v5q-6 4-11 1z" fill="#26332f" opacity=".85"/><path d="M32 29h4" stroke="#90b919" stroke-width="1.4"/>';
    var freckles = p.freckles ? '<g fill="#a87961" opacity=".7"><circle cx="25" cy="35" r=".65"/><circle cx="28" cy="36" r=".55"/><circle cx="43" cy="35" r=".65"/><circle cx="40" cy="36" r=".55"/></g>' : '';
    var collar = p.highCollar ? '<path d="M15 49l7-7 7 11-7 8zm38 0-7-7-7 11 7 8z" fill="#202727"/><path d="M20 50l4 4m24-4-4 4" stroke="#90b919" stroke-width="1.3"/>' : '';
    return '<svg viewBox="0 0 68 68" aria-hidden="true"><rect width="68" height="68" fill="' + p.bg + '"/><path d="M3 68Q6 43 34 42Q62 43 65 68Z" fill="' + p.coat + '"/><path d="M23 51l11 9 11-9" fill="none" stroke="#90b919" stroke-width="2"/><path d="M28 37h12v12H28z" fill="' + p.skin + '"/><ellipse cx="34" cy="28" rx="' + faceRx + '" ry="' + faceRy + '" fill="' + p.skin + '"/><path d="M21 36q-4-1-4-6 0-4 4-3m26 9q4-1 4-6 0-4-4-3" fill="' + p.skin + '" stroke="#a87961" stroke-width=".7"/><path d="M24 30h5m10 0h5" stroke="' + p.eye + '" stroke-width="1.8" stroke-linecap="round"/><path d="M34 31l-1 6 3 1" fill="none" stroke="#b17f68" stroke-width="1.1"/><path d="M30 41q4 2 8 0" fill="none" stroke="#9e6659" stroke-width="1.4"/>' + freckles + presetHair(p) + accessory + collar + '<path d="M8 17h7M53 50h7" stroke="#ffffff6b" stroke-width="1"/><circle cx="56" cy="12" r="1.5" fill="#159eae"/></svg>';
  }

  // 渲染矢量预设头像；上传头像仍使用原有图片路径。
  function avatarNode(avatar, size) {
    size = size || 40;
    if (avatar && avatar.type === 'upload' && avatar.imageData) {
      var img = el('img', { style: 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;' });
      img.src = avatar.imageData;
      return img;
    }
    var id = (avatar && avatar.presetId) || 'p1';
    if (id === 'p2' || !PRESET_PORTRAITS[id]) id = 'p1';
    return el('div', {
      class: 'avatar avatar-portrait',
      style: 'width:' + size + 'px;height:' + size + 'px;',
      html: presetPortraitSvg(PRESET_PORTRAITS[id])
    });
  }

  // 上传头像前压缩：最长边限制到 maxSide，避免 base64 撑爆 localStorage。
  function compressImage(dataUrl, maxSide, cb) {
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      if (scale >= 1) { cb(dataUrl); return; }
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try { cb(canvas.toDataURL('image/jpeg', 0.82)); }
      catch (e) { cb(dataUrl); }
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }

  // 真实定位隐私授权：已同意则直接回调 true；未同意弹说明框，由用户选择。
  // 同一时间只允许一个弹窗，后续请求排队，避免 locateNow/tryAmap 叠加两个框。
  var privacyOpen = false;
  var privacyPending = [];

  function confirmPrivacy(cb) {
    var Privacy = window.BikeApp.Privacy;
    if (Privacy.consented(localStorage)) { cb(true); return; }
    if (privacyOpen) { privacyPending.push(cb); return; }

    privacyOpen = true;
    var mask = el('div', { class: 'modal-mask', style: 'display:flex;' });
    var card = el('div', { class: 'modal-card privacy-card' }, [
      el('h3', { icon: 'privacy', text: '定位与隐私说明' }),
      el('p', { text: '为提供以下功能，本应用会请求您的位置信息：' }),
      el('ul', { class: 'privacy-list' }, [
        el('li', { text: '① 在地图上标记您的自行车位置；' }),
        el('li', { text: '② 记录骑行轨迹、速度与卡路里；' }),
        el('li', { text: '③ 查找附近的骑友。' })
      ]),
      el('p', { class: 'privacy-note', text: '所有位置数据仅保存在您的本机（浏览器本地存储），不会上传到任何服务器，可随时停止使用。' }),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'mini-btn primary', text: '同意并继续', onclick: function () {
          Privacy.grant(localStorage);
          finish(true);
        } }),
        el('button', { class: 'mini-btn', text: '暂不授权', onclick: function () {
          finish(false);
        } })
      ])
    ]);
    function finish(ok) {
      privacyOpen = false;
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      cb(ok);
      var pending = privacyPending.splice(0);
      pending.forEach(function (fn) { fn(ok); });
    }
    mask.appendChild(card);
    document.body.appendChild(mask);
  }

  window.BikeApp.ui = { el: el, icon: iconNode, toast: toast, avatarNode: avatarNode, PRESET_PORTRAITS: PRESET_PORTRAITS, confirmPrivacy: confirmPrivacy, compressImage: compressImage };
})();
