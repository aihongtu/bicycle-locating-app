/* app.js — 启动与底部 Tab 切换 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  window.BikeApp.boot = function () {
    var store = window.BikeApp.store;
    var state = store.state;
    state.ensureNearby(); // 首次进入时初始化模拟骑友

    var pages = {
      find: document.getElementById('page-find'),
      ride: document.getElementById('page-ride'),
      people: document.getElementById('page-people'),
      me: document.getElementById('page-me')
    };
    var tabs = {
      find: document.getElementById('tab-find'),
      ride: document.getElementById('tab-ride'),
      people: document.getElementById('tab-people'),
      me: document.getElementById('tab-me')
    };

    window.BikeApp.Pages.Find.create(store, pages.find);
    window.BikeApp.Pages.Ride.create(store, pages.ride);
    window.BikeApp.Pages.People.create(store, pages.people);
    window.BikeApp.Pages.Me.create(store, pages.me);

    function switchTab(name) {
      Object.keys(pages).forEach(function (k) {
        pages[k].style.display = (k === name) ? 'block' : 'none';
        tabs[k].classList.toggle('active', k === name);
      });
      try { window.localStorage.setItem('bikeapp.activeTab', name); } catch (e) {}
    }
    Object.keys(tabs).forEach(function (k) {
      tabs[k].addEventListener('click', function () { switchTab(k); });
    });
    var returnTab = null;
    try {
      returnTab = window.localStorage.getItem('bikeapp.returnTab');
      window.localStorage.removeItem('bikeapp.returnTab');
    } catch (e) {}
    switchTab(returnTab && pages[returnTab] ? returnTab : 'find');
    initTheme();
  };

  /* 深浅色模式切换：读取已保存选择应用主题，并绑定切换按钮（仅此一处新增，不改功能） */
  function initTheme() {
    var saved = null;
    try { saved = window.localStorage.getItem('bikeapp.theme'); } catch (e) {}
    var isDark = saved === 'dark';
    document.body.classList.toggle('dark', isDark);
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var nowDark = document.body.classList.toggle('dark');
      try { window.localStorage.setItem('bikeapp.theme', nowDark ? 'dark' : 'light'); } catch (e) {}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.BikeApp.boot);
  else window.BikeApp.boot();
})();
