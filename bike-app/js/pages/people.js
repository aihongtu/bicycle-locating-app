/* pages/people.js — 模块3 骑友：附近(C1)、新好友请求(C1.5)、好友列表(C2)、聊天(C3) */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.BikeApp) return;
  var Core = window.BikeApp.Core, ui = window.BikeApp.ui, el = ui.el;

  function create(store, root) {
    var state = store.state;
    var view = 'nearby';          // nearby | friends | requests | chat
    var chatFriendId = null;
    var subNav = el('div', { class: 'sub-nav' });
    var content = el('div', { class: 'people-content' });
    var pendingTimer = null;

    function redraw() {
      state.ensureNearby();
      renderSubNav();
      if (view === 'nearby') renderNearby();
      else if (view === 'friends') renderFriends();
      else if (view === 'requests') renderRequests();
      else if (view === 'chat') renderChat();
    }

    function renderSubNav() {
      var s = state.get();
      var pending = s.social.requests.filter(function (r) { return r.status === 'pending'; }).length;
      subNav.innerHTML = '';
      var mk = function (label, v, badge) {
        var b = el('button', { class: 'sub-tab' + (view === v ? ' active' : ''), onclick: function () { view = v; redraw(); } }, [el('span', { text: label })]);
        if (badge) b.appendChild(el('span', { class: 'badge', text: String(badge) }));
        return b;
      };
      subNav.appendChild(mk('附近的人', 'nearby'));
      subNav.appendChild(mk('好友', 'friends', s.social.friends.length + '/' + Core.FRIEND_LIMIT));
      subNav.appendChild(mk('好友请求', 'requests', pending || null));
    }

    function requestFriend(near) {
      var r = state.sendFriendRequest(near.id);
      if (!r.ok) {
        if (r.reason === 'limit') {
          ui.toast('好友数量已达上限（' + Core.FRIEND_LIMIT + '/' + Core.FRIEND_LIMIT + '），无法继续添加');
        } else if (r.reason === 'cooldown') {
          ui.toast('冷却中，约 ' + Math.ceil(r.remainingMs / 60000) + ' 分钟后可再次申请');
        } else {
          ui.toast('无法添加');
        }
        return;
      }
      ui.toast('请求已发送，等待对方同意…');
      redraw();
    }

    function friendButton(near) {
      if (near.relation === 'friend') return el('span', { class: 'rel friend', text: '✓ 好友' });
      if (near.relation === 'requested') return el('span', { class: 'rel pending', text: '请求已发送' });
      if (near.relation === 'rejected') {
        return el('button', { class: 'mini-btn add', text: '重新申请', onclick: function () { requestFriend(near); } });
      }
      return el('button', { class: 'mini-btn add', text: '＋加好友', onclick: function () { requestFriend(near); } });
    }

    function renderNearby() {
      content.innerHTML = '';
      var list = state.get().social.nearby;
      if (!list.length) { content.appendChild(el('p', { class: 'empty', text: '附近暂无真实骑友（真实用户共享位置后才会出现）' })); return; }
      list.forEach(function (n) {
        content.appendChild(el('div', { class: 'row' }, [
          ui.avatarNode(n.avatar, 44),
          el('div', { class: 'row-main' }, [
            el('div', { class: 'row-name', text: n.name }),
            el('div', { class: 'row-sub', text: '擦肩时间 ' + Core.formatTime(n.meetTime) + ' · 当时距你 ' + n.distanceAtMeet + ' 米' })
          ]),
          friendButton(n)
        ]));
      });
    }

    function renderFriends() {
      content.innerHTML = '';
      var list = state.get().social.friends;
      content.appendChild(el('div', { class: 'hint', text: '好友 ' + list.length + '/' + Core.FRIEND_LIMIT }));


      if (!list.length) { content.appendChild(el('p', { class: 'empty', text: '还没有好友，去"附近的人"加一个吧' })); return; }
      list.forEach(function (f) {
        content.appendChild(el('div', { class: 'row clickable', onclick: function () { chatFriendId = f.id; view = 'chat'; redraw(); } }, [
          ui.avatarNode(f.avatar, 44),
          el('div', { class: 'row-main' }, [el('div', { class: 'row-name', text: f.name }), el('div', { class: 'row-sub', text: '点击进入聊天 →' })]),
          el('button', { class: 'mini-btn no', text: '删除', onclick: function (e) {
            e.stopPropagation();
            var res = state.removeFriend(f.id);
            if (res.ok) { ui.toast('已删除好友 ' + f.name); redraw(); }
            else ui.toast('删除失败');
          } })
        ]));
      });
    }

    function renderRequests() {
      content.innerHTML = '';
      var list = state.get().social.requests.filter(function (r) { return r.status === 'pending'; });
      if (!list.length) { content.appendChild(el('p', { class: 'empty', text: '没有待处理的好友请求' })); return; }
      list.forEach(function (rq) {
        content.appendChild(el('div', { class: 'row' }, [
          ui.avatarNode(rq.fromAvatar, 44),
          el('div', { class: 'row-main' }, [
            el('div', { class: 'row-name', text: rq.fromName }),
            el('div', { class: 'row-sub', text: '想加你为好友' })
          ]),
          el('div', { class: 'req-actions' }, [
            el('button', { class: 'mini-btn ok', text: '同意', onclick: function () {
              var res = state.acceptRequest(rq.id);
              if (!res.ok) { ui.toast(res.reason === 'limit' ? '好友数量已达上限' : '操作失败'); return; }
              ui.toast('已添加 ' + rq.fromName + ' 为好友'); redraw();
            } }),
            el('button', { class: 'mini-btn no', text: '忽略', onclick: function () { state.ignoreRequest(rq.id); redraw(); } })
          ])
        ]));
      });
    }

    function renderChat() {
      var s = state.get();
      var friend = s.social.friends.find(function (f) { return f.id === chatFriendId; });
      content.innerHTML = '';
      if (!friend) { content.appendChild(el('p', { class: 'empty', text: '请先选择好友' })); view = 'friends'; redraw(); return; }
      var msgs = state.get().social.messages[friend.id] || [];
      var listEl = el('div', { class: 'chat-list' });
      msgs.forEach(function (msg) {
        listEl.appendChild(el('div', { class: 'msg ' + (msg.fromMe ? 'me' : 'other') }, [el('div', { class: 'bubble', text: msg.text })]));
      });
      var input = el('input', { type: 'text', placeholder: '输入消息…' });
      var sendBtn = el('button', { class: 'mini-btn primary', text: '发送', onclick: function () { send(); } });
      function send() {
        var text = input.value;
        if (!text.trim()) return;
        state.sendMessage(friend.id, text);
        input.value = '';
        renderChat();

      }
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });

      content.appendChild(el('div', { class: 'chat-wrap' }, [
        el('div', { class: 'chat-head' }, [
          el('button', { class: 'mini-btn back', text: '← 返回', onclick: function () { view = 'friends'; redraw(); } }),
          el('span', { text: friend.name })
        ]),
        listEl,
        el('div', { class: 'chat-input' }, [input, sendBtn])
      ]));
      listEl.scrollTop = listEl.scrollHeight;
    }

    root.innerHTML = '';
    root.appendChild(el('div', { class: 'page people-page' }, [subNav, content]));
    state.onChange(function () { redraw(); });
    redraw();
  }

  window.BikeApp.Pages = window.BikeApp.Pages || {};
  window.BikeApp.Pages.People = { create: create };
})();
