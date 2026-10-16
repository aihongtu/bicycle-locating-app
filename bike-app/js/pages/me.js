/* pages/me.js — 模块4 我的：资料页(D1)、编辑表单(D2)、头像(预设+上传)、备份/恢复 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.BikeApp) return;
  var Core = window.BikeApp.Core, ui = window.BikeApp.ui, el = ui.el;
  var Backup = window.BikeApp.Backup;
  var Login = window.BikeApp.Login;
  var I18n = window.BikeApp.I18n;

  function create(store, root) {
    var state = store.state;
    var view = 'profile'; // profile | edit
    var activePanel = null;
    var content = el('div', { class: 'people-content' });

    function redraw() { if (view === 'profile') renderProfile(); else renderEdit(); }

    function renderProfile() {
      var snapshot = state.get();
      var p = snapshot.profile;
      content.innerHTML = '';
      var rides = snapshot.rides && snapshot.rides.history ? snapshot.rides.history : [];
      var friends = snapshot.social && snapshot.social.friends ? snapshot.social.friends.length : 0;
      var totalKm = 0, days = {};
      rides.forEach(function (ride) {
        totalKm += ride.totals && Number(ride.totals.distanceKm) || 0;
        if (ride.date) days[ride.date] = true;
      });
      var distance = totalKm < 10 ? totalKm.toFixed(1) : String(Math.round(totalKm));

      content.appendChild(el('div', { class: 'p09-profile-heading' }, [
        el('h3', { text: '骑行者档案' }),
        el('span', { text: 'PROFILE / 04' })
      ]));
      content.appendChild(el('section', { class: 'p09-profile' }, [
        el('div', { class: 'p09-profile-person' }, [
          el('div', { class: 'p09-profile-avatar' }, [ui.avatarNode(p.avatar, 56)]),
          el('div', { class: 'p09-profile-copy' }, [
            el('div', { class: 'p09-profile-name', text: p.username }),
            el('div', { class: 'p09-profile-meta', text: p.hobbies || '骑行者' }),
            el('div', { class: 'p09-profile-meta', text: p.intro || ('性别：' + p.gender) })
          ])
        ]),
        el('div', { class: 'p09-profile-stats' }, [
          el('div', {}, [el('b', { text: distance }), el('span', { text: '累计公里' })]),
          el('div', {}, [el('b', { text: String(Object.keys(days).length) }), el('span', { text: '骑行天数' })]),
          el('div', {}, [el('b', { text: String(friends).padStart(2, '0') }), el('span', { text: '好友' })])
        ])
      ]));

      var menu = el('div', { class: 'p09-menu' });
      [
        ['01', '个人资料与头像', 'edit'],
        ['02', '游客 / 微信登录', 'login'],
        ['03', '我的车辆', 'bike'],
        ['04', '应用语言', 'language'],
        ['05', '数据备份 / 恢复', 'backup']
      ].forEach(function (item) {
        menu.appendChild(el('button', {
          class: 'p09-menu-item' + (activePanel === item[2] ? ' selected' : ''),
          type: 'button', onclick: function () {
            if (item[2] === 'edit') { view = 'edit'; activePanel = null; redraw(); return; }
            if (item[2] === 'bike') { var tab = document.getElementById('tab-find'); if (tab) tab.click(); return; }
            activePanel = activePanel === item[2] ? null : item[2];
            renderProfile();
          }
        }, [
          el('span', { class: 'p09-menu-index', text: item[0] }),
          el('span', { class: 'p09-menu-label', text: item[1] }),
          el('span', { class: 'p09-menu-arrow', text: activePanel === item[2] ? '−' : '↗' })
        ]));
      });
      content.appendChild(menu);

      if (activePanel === 'login') renderLoginPanel();
      if (activePanel === 'language') renderLanguagePanel();
      if (activePanel === 'backup') renderBackupPanel();
    }

    function panelCard(title, children) {
      return el('section', { class: 'p09-detail-card' }, [
        el('div', { class: 'p09-detail-heading' }, [
          el('h4', { text: title }),
          el('button', { type: 'button', class: 'p09-back', text: '返回档案', onclick: function () { activePanel = null; renderProfile(); } })
        ])
      ].concat(children));
    }

    function renderLoginPanel() {
      var lg = Login.current(window.localStorage);
      content.appendChild(panelCard('登录方式', [
        el('p', { class: 'row-sub', text: lg.mode === 'wechat' ? ('微信用户：' + lg.wechatNick) : '当前：游客访问' }),
        el('div', { class: 'modal-actions' }, [
          lg.mode === 'wechat'
            ? el('button', { class: 'mini-btn', icon: 'refresh', text: '切换为游客', onclick: function () {
                Login.loginGuest(window.localStorage); ui.toast('已切换为游客访问'); renderProfile();
              } })
            : el('button', { class: 'mini-btn primary', text: '微信登录', onclick: showWechatLogin })
        ])
      ]));
    }

    function renderLanguagePanel() {
      var activeLanguage = I18n ? I18n.language() : 'zh';
      content.appendChild(panelCard('语言 / Language', [
        el('p', { class: 'row-sub', text: '选择应用显示语言。' }),
        el('div', { class: 'language-switch', role: 'group', 'aria-label': '语言 / Language' }, [
          el('button', { class: 'language-option' + (activeLanguage === 'zh' ? ' active' : ''), type: 'button', 'aria-pressed': activeLanguage === 'zh' ? 'true' : 'false', text: '中文', onclick: function () { if (I18n) I18n.setLanguage('zh'); } }),
          el('button', { class: 'language-option' + (activeLanguage === 'en' ? ' active' : ''), type: 'button', 'aria-pressed': activeLanguage === 'en' ? 'true' : 'false', text: 'English', onclick: function () { if (I18n) I18n.setLanguage('en'); } })
        ])
      ]));
    }

    function renderBackupPanel() {
      content.appendChild(panelCard('数据备份与恢复', [
        el('p', { class: 'row-sub', text: '所有数据保存在本机浏览器，刷新/重启不丢；可导出备份或导入恢复。' }),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'mini-btn ok', icon: 'download', text: '导出备份', onclick: doExport }),
          el('button', { class: 'mini-btn no', icon: 'upload', text: '导入恢复', onclick: function () { fileInput.click(); } })
        ]),
        fileInput
      ]));
    }

    // 微信登录（本地版模拟授权；真实微信登录需配置开放平台 AppID 与服务端）
    function showWechatLogin() {
      var mask = el('div', { class: 'modal-mask', style: 'display:flex;' });
      var nick = el('input', { type: 'text', value: '微信用户' });
      function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
      mask.appendChild(el('div', { class: 'modal-card' }, [
        el('h3', { text: '微信登录' }),
        el('p', { class: 'privacy-note', text: '本地版为模拟微信授权，登录信息仅保存在本机；真实微信登录需配置微信开放平台 AppID 与服务端。' }),
        field('微信昵称', nick),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'mini-btn primary', text: '授权登录', onclick: function () {
            Login.loginWechat(window.localStorage, nick.value.trim() || '微信用户');
            close(); ui.toast('已通过微信登录'); redraw();
          } }),
          el('button', { class: 'mini-btn close', text: '取消', onclick: close })
        ])
      ]));
      document.body.appendChild(mask);
    }

    var fileInput = el('input', { type: 'file', accept: '.json', style: 'display:none;' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var json = JSON.parse(reader.result);
          Backup.importBackup(store.storage, json);
          ui.toast('备份恢复成功');
          setTimeout(function () { window.location.reload(); }, 600);
        } catch (e) { ui.toast('恢复失败：' + e.message); }
      };
      reader.readAsText(f);
      fileInput.value = '';
    });

    function doExport() {
      var bak = Backup.exportBackup(store.storage);
      var blob = new Blob([JSON.stringify(bak, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bikeapp-backup-' + Core.formatDate(Date.now()) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      ui.toast('备份已导出');
    }

    function renderEdit() {
      var p = state.get().profile;
      content.innerHTML = '';
      var fUser = el('input', { type: 'text', value: p.username });
      var fGender = el('div', { class: 'seg' });
      ['男', '女', '保密'].forEach(function (g) {
        var label = el('label', { class: 'seg-item' + (p.gender === g ? ' on' : '') }, [
          el('input', { type: 'radio', name: 'gender', value: g, checked: p.gender === g ? 'checked' : null }),
          el('span', { text: g })
        ]);
        fGender.appendChild(label);
      });
      var fBirth = el('input', { type: 'date', value: p.birthday });
      var fHobby = el('input', { type: 'text', value: p.hobbies });
      var fIntro = el('textarea', { text: p.intro });

      // 头像选择：预设 + 上传
      var avatarRow = el('div', { class: 'avatar-pick' });
      var selectedPreset = p.avatar && p.avatar.presetId === 'p2' ? 'p1' : (p.avatar && p.avatar.presetId);
      Core.PRESET_AVATARS.forEach(function (id) {
        avatarRow.appendChild(el('button', {
          class: 'avatar-opt' + (p.avatar.type === 'preset' && selectedPreset === id ? ' sel' : ''),
          onclick: function () { window.BikeApp.avatarApi.pickPresetAvatar(id); ui.toast('已选择预设头像'); renderEdit(); }
        }, [ui.avatarNode({ type: 'preset', presetId: id }, 40)]));
      });
      var upBtn = el('button', { class: 'mini-btn ok', text: '上传本地图片', onclick: function () { upInput.click(); } });
      var upInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
      upInput.addEventListener('change', function () {
        var f = upInput.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () { window.BikeApp.avatarApi.uploadAvatarAs(r.result); ui.toast('头像已上传'); renderEdit(); };
        r.readAsDataURL(f);
        upInput.value = '';
      });
      avatarRow.appendChild(upBtn);
      avatarRow.appendChild(upInput);

      function save() {
        var g = fGender.querySelector('input:checked');
        state.updateProfile({
          username: fUser.value.trim() || '骑行者',
          gender: g ? g.value : p.gender,
          birthday: fBirth.value || p.birthday,
          hobbies: fHobby.value.trim(),
          intro: fIntro.value.trim()
        });
        ui.toast('已保存');
        view = 'profile'; redraw();
      }

      content.appendChild(el('div', { class: 'form-card' }, [
        el('h4', { text: '编辑资料' }),
        field('头像', avatarRow),
        field('用户名', fUser),
        field('性别', fGender),
        field('生日', fBirth),
        field('爱好', fHobby),
        field('简介', fIntro),
        el('div', { class: 'modal-actions' }, [
          el('button', { class: 'mini-btn primary', text: '保存', onclick: save }),
          el('button', { class: 'mini-btn close', text: '取消', onclick: function () { view = 'profile'; redraw(); } })
        ])
      ]));
    }

    function field(label, input) {
      return el('div', { class: 'field' }, [el('label', { class: 'field-label', text: label }), input]);
    }

    root.innerHTML = '';
    root.appendChild(el('div', { class: 'page me-page' }, [content]));
    state.onChange(function () { redraw(); });
    redraw();
  }

  window.BikeApp.Pages = window.BikeApp.Pages || {};
  window.BikeApp.Pages.Me = { create: create };
})();
