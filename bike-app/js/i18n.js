/* i18n.js — application language preference and lightweight UI translation. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.BikeApp) return;

  var STORAGE_KEY = 'bikeapp.language';
  var EN = {
    '自行车定位助手':'Bicycle Locator','本地版 v1':'Local version 1','切换深色/浅色模式':'Toggle dark/light mode',
    '找车':'Find a bike','骑行':'Ride','骑友':'Riders','我的':'My',
    '里程':'Distance','时长':'Duration','均速':'Avg. speed','均速：':'Avg. speed: ','里程：':'Distance: ','配速：':'Pace: ','用时：':'Time: ','卡路里':'Calories','累计里程':'Total distance','骑行时长':'Ride duration','平均速度':'Average speed','消耗热量':'Calories burned',
    '骑行记录':'Ride log','路段详情':'Ride segment','定位':'Locate','今日':'Today','今日（记录中）':'Today (recording)','还没有骑行记录，点下方按钮开始记录':'No rides yet. Start recording below.','今天还没有骑行记录，点下方按钮开始记录真实轨迹':'No ride recorded today. Start below to record your GPS route.','骑行时点击开始，用真实 GPS 记录轨迹':'Tap Start while riding to record your GPS route.',
    '正在记录真实轨迹… ':'Recording GPS route… ','已暂停 ':'Paused ','继续':'Resume','暂停':'Pause','开始记录':'Start recording','结束并保存':'Finish and save','保存成功':'Saved successfully','骑行已暂停':'Ride paused','记录中':'Recording','已保存今日骑行记录':'Today’s ride saved',
    '附近的人':'Nearby','好友':'Friends','好友请求':'Requests','请求已发送':'Request sent','请求已发送，等待对方同意…':'Request sent. Waiting for approval…','已拒绝':'Declined','＋加好友':'+ Add friend','附近暂无真实骑友（真实用户共享位置后才会出现）':'No riders nearby yet. They appear when real users share their location.','还没有好友，去"附近的人"加一个吧':'No friends yet. Add someone from Nearby.','点击进入聊天 →':'Open chat →','删除':'Remove','删除失败':'Could not remove friend','已删除好友 ':'Removed friend ','没有待处理的好友请求':'No pending friend requests','想加你为好友':'Wants to add you','同意':'Accept','忽略':'Ignore','已添加 ':'Added ',' 为好友':' as a friend','请先选择好友':'Choose a friend first','输入消息…':'Type a message…','发送':'Send','← 返回':'← Back',
    '登录方式':'Sign-in method','微信用户：':'WeChat user: ','当前：游客访问':'Current: Guest','切换为游客':'Switch to Guest','微信登录':'WeChat sign-in','编辑资料':'Edit profile','性别：':'Gender: ','生日：':'Birthday: ','爱好：':'Interests: ','简介：':'About: ','数据备份与恢复':'Backup and restore','所有数据保存在本机浏览器，刷新/重启不丢；可导出备份或导入恢复。':'Your data stays in this browser. Export a backup or restore one at any time.','导出备份':'Export backup','导入恢复':'Import backup','上传本地图片':'Upload image','保存':'Save','取消':'Cancel','用户名':'Username','性别':'Gender','生日':'Birthday','爱好':'Interests','简介':'About','男':'Male','女':'Female','保密':'Prefer not to say','微信昵称':'WeChat name','授权登录':'Authorize sign-in','已通过微信登录':'Signed in with WeChat','已切换为游客访问':'Switched to Guest','本地版为模拟微信授权，登录信息仅保存在本机；真实微信登录需配置微信开放平台 AppID 与服务端。':'This demo simulates WeChat sign-in and stores the account locally. Real WeChat sign-in requires an Open Platform App ID and server.','已选择预设头像':'Preset avatar selected','头像已上传':'Avatar uploaded','已保存':'Saved',
    '骑行者档案':'Rider profile','累计公里':'Total km','骑行天数':'Ride days','个人资料与头像':'Profile and avatar','游客 / 微信登录':'Guest / WeChat sign-in','我的车辆':'My bike','应用语言':'App language','数据备份 / 恢复':'Backup / restore','返回档案':'Back to profile','骑行者':'Rider',
    '选择应用显示语言。':'Choose the app display language.','中文':'中文','恢复失败：':'Restore failed: ','恢复失败':'Restore failed','备份恢复成功':'Backup restored','备份已导出':'Backup exported','已保存':'Saved',
    '未连接车辆':'No bike connected','在线':'Online','离线':'Offline','蓝牙已连接':'Bluetooth connected','车辆管理':'Bike management','寻找并连接设备':'Find and connect a device','发光':'Flash light','响铃':'Ring bell','已向设备下发发光':'Light command sent','尚未连接真实设备，已模拟亮灯':'No device connected. Simulated the light.','该设备暂不支持真实控制，已模拟亮灯':'This device does not support light control. Simulated the light.','已向设备下发响铃':'Bell command sent','尚未连接真实设备，已模拟响铃':'No device connected. Simulated the bell.','该设备暂不支持真实控制，已模拟响铃':'This device does not support bell control. Simulated the bell.',
    '刷新位置':'Refresh location','定位车':'Center on bike','放大':'Zoom in','缩小':'Zoom out','响铃':'Ring','发光':'Flash','尚未连接真实设备，已模拟亮灯':'No device connected. Simulated the light.','该设备暂不支持真实控制，已模拟亮灯':'This device does not support light control. Simulated the light.','尚未连接真实设备，已模拟响铃':'No device connected. Simulated the bell.','该设备暂不支持真实控制，已模拟响铃':'This device does not support bell control. Simulated the bell.','尚未连接车辆':'No bike connected','已回到车的位置':'Centered on your bike','停放时间：':'Parked: ','位置描述：':'Location: ','距你：':'Distance: ','附近停车场 / 路边':'Nearby parking / roadside','高德真实地图':'Gaode map','模拟':'Simulation','步行导航':'Walking directions','直行 60 米，右转':'Go straight for 60 m, then turn right','再直行 120 米，到达停车点':'Continue for 120 m to the parking spot','目标：':'Destination: ',' 米':' m','我已到达':'I’m here','到达，车就在身边':'You’ve arrived. Your bike is nearby.','返回':'Back','VEHICLE DOSSIER / 01':'VEHICLE DOSSIER / 01','当前使用':'In use','断开蓝牙':'Disconnect Bluetooth','删除车辆':'Remove bike','暂无已登记车辆':'No registered bike','连接附近设备，或输入名称手动添加。':'Connect a nearby device or enter a name to add a bike.','为手动添加的车辆命名':'Name this bike','连接或添加　/　CONNECT OR REGISTER':'CONNECT OR REGISTER','当前车辆　/　CURRENT VEHICLE':'CURRENT VEHICLE','车辆名称':'Bike name','可选':'Optional','寻找并连接设备':'Find and connect a device','添加车辆':'Add bike','已添加车辆':'Bike added','正在扫描附近真实蓝牙设备…':'Scanning for nearby Bluetooth devices…','正在搜索附近设备…':'Searching for nearby devices…','找到设备':'Device found','确定为我的车':'Set as my bike','重新扫描':'Scan again','未选择设备':'No device selected','已取消或未找到设备：':'Cancelled or no device found: ','发现 ':'Found ',' 个设备':' device(s)','连接':'Connect','关闭':'Close','关闭车辆管理':'Close bike management','断开成功':'Disconnected',
    '同意':'Accept','操作失败':'Action failed','好友数量已达上限':'Friend limit reached','无法添加':'Could not add friend',
    '定位与隐私说明':'Location and privacy','为提供以下功能，本应用会请求您的位置信息：':'The app uses your location to provide these features:','① 在地图上标记您的自行车位置；':'① Show your bike on the map;','② 记录骑行轨迹、速度与卡路里；':'② Record routes, speed, and calories;','③ 查找附近的骑友。':'③ Find nearby riders.','所有位置数据仅保存在您的本机（浏览器本地存储），不会上传到任何服务器，可随时停止使用。':'Location data stays in this browser and is never uploaded. You can stop sharing at any time.','同意并继续':'Agree and continue','暂不授权':'Not now',
    '语言 / Language':'Language','应用语言':'App language','选择应用显示语言。':'Choose the app display language.'
  };

  function language() {
    try { return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh'; }
    catch (e) { return 'zh'; }
  }
  function translate(value) {
    if (value == null || typeof value !== 'string' || language() !== 'en') return value;
    if (Object.prototype.hasOwnProperty.call(EN, value)) return EN[value];
    var dynamic = [
      ['发现 ', 'Found '],
      ['微信用户：', 'WeChat user: '],
      ['性别：', 'Gender: '], ['生日：', 'Birthday: '], ['爱好：', 'Interests: '], ['简介：', 'About: '],
      ['停放时间：', 'Parked: '], ['位置描述：', 'Location: '], ['距你：', 'Distance: '], ['目标：', 'Destination: '],
      ['好友 ', 'Friends '], ['擦肩时间 ', 'Crossed paths at '], [' · 当时距你 ', ' · '], [' 米', ' m'],
      ['已删除好友 ', 'Removed friend '], ['已添加 ', 'Added '], [' 为好友', ' as a friend'],
      ['恢复失败：', 'Restore failed: '], ['删除失败：', 'Could not remove: ']
    ];
    for (var i = 0; i < dynamic.length; i++) {
      if (value.indexOf(dynamic[i][0]) === 0) return dynamic[i][1] + translate(value.slice(dynamic[i][0].length));
    }
    return value;
  }
  function setLanguage(code) {
    var next = code === 'en' ? 'en' : 'zh';
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      window.localStorage.setItem('bikeapp.returnTab', 'me');
    } catch (e) {}
    window.location.reload();
  }
  function applyStatic() {
    var lang = language();
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = translate(document.title);
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var trimmed = node.nodeValue.trim();
      if (!trimmed) continue;
      var translated = translate(trimmed);
      if (translated !== trimmed) node.nodeValue = node.nodeValue.replace(trimmed, translated);
    }
    Array.prototype.forEach.call(document.querySelectorAll('[title],[aria-label],[placeholder]'), function (node) {
      ['title','aria-label','placeholder'].forEach(function (key) {
        if (node.hasAttribute(key)) node.setAttribute(key, translate(node.getAttribute(key)));
      });
    });
  }

  document.documentElement.lang = language() === 'en' ? 'en' : 'zh-CN';
  window.BikeApp.I18n = { language: language, translate: translate, setLanguage: setLanguage, applyStatic: applyStatic };
  applyStatic();
})();
