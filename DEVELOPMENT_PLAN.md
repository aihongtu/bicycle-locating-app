# 自行车定位专属 APP — 第一版开发计划

| 项目 | 内容 |
|---|---|
| 依据文档 | PRD.md v1.0（定稿） |
| 编写日期 | 2026-09-26 |
| 交付形态 | 先在电脑浏览器本地运行（模拟手机屏幕），单页应用，数据存本地，刷新/关闭/重启不丢 |

---

## 1. 技术选型与理由

| 决策 | 选择 | 理由 |
|---|---|---|
| 应用形态 | 单页应用（SPA），纯 HTML/CSS/JS，**无构建工具、无服务器** | 双击即可在本地浏览器运行，符合"本地运行"；后续转手机可整体迁移 |
| 地图 | 自定义 Canvas 模拟地图（街道网格 + 地标），封装为 `MapEngine` 接口 | 第一版为虚拟定位、可离线运行、不依赖网络地图；留好接口，后续替换为真实地图/GPS |
| 结构化数据 | `localStorage`（JSON） | 存个人资料、好友、聊天、骑行记录、自行车状态等 |
| 图片类数据（上传头像） | `IndexedDB`（Blob/Base64） | 本地图片可持久化、容量更大，刷新重启不丢 |
| 全局状态 | 轻量状态管理器（单例 store + 发布订阅） | 让"改头像昵称后全局同步"简单可维护 |
| 反馈 | 统一 toast + 按钮按压态组件 | 满足"所有按钮有反馈"的验收项 |
| 模拟数据 | 独立 `SimService` 层 | 虚拟自行车、虚拟骑友、自动回复集中管理，便于将来替换真实连接 |

---

## 2. 项目文件结构（预计）

```
bike-app/
├── index.html            # 单页入口（模拟手机屏幕容器 + 底部4Tab）
├── css/
│   └── app.css           # 全局样式、Tab、卡片、按钮、toast
├── js/
│   ├── store.js          # 全局状态管理器（发布订阅）
│   ├── storage.js        # 本地持久化服务（localStorage + IndexedDB）
│   ├── backup.js         # 导出/导入备份
│   ├── map-engine.js     # 地图引擎接口 + Canvas 实现
│   ├── services/
│   │   ├── sim-bike.js   # 虚拟自行车（位置、移动、发光/响铃模拟）
│   │   ├── sim-nearby.js # 虚拟骑友（擦肩、加好友模拟、自动回复）
│   │   └── calorie.js    # 卡路里估算
│   └── pages/
│       ├── tab-find.js   # 模块1 找车
│       ├── tab-ride.js   # 模块2 骑行记录
│       ├── tab-people.js # 模块3 骑友（C1/C1.5/C2/C3）
│       └── tab-me.js     # 模块4 我的（D1/D2）
└── assets/avatars/       # 预设头像图片
```

> 说明：代码量中等，保持零依赖、可直接在浏览器打开；如后续转手机可套用容器（如 Capacitor/PWA），页面结构无需重写。

---

## 3. 数据模型设计（第一版必要数据）

> 全部字段对应 PRD 第 5 节，存储于本地，刷新/重启不丢。

### 3.1 个人资料（`profile`）
```
userId, username,
avatar: { type: 'preset' | 'upload', presetId?: string, imageData?: string(B64) },
gender: '男' | '女' | '保密',
birthday: 'YYYY-MM-DD',
hobbies: string,
intro: string
```

### 3.2 虚拟自行车（`bike`）
```
bikeName, position: { x, y }, status: '在线' | '离线',
parkedAt: timestamp,
glow: { active: bool, until: timestamp },
ring: { active: bool, count: number, until: timestamp }
```

### 3.3 今日骑行（`rideToday` + `rideSessions`）
```
session: { id, date, startedAt, endedAt,
  points: [ { x, y, t, speedKmh, paceMinPerKm } ],
  segments: [ { fromIdx, toIdx, distanceKm, durationMin,
                avgSpeedKmh, paceMinPerKm, color: '黄'|'绿'|'红' } ],
  totals: { distanceKm, durationMin, avgSpeedKmh, caloriesKcal } }
```
- 分色规则（PRD 10#6）：`paceMinPerKm < 3` → 黄；`3~9` → 绿；`>9` → 红。

### 3.4 骑友（`nearbyUsers` / `friends` / `friendRequests` / `messages`）
```
nearbyUsers: [ { id, name, avatar, gender, meetTime, distanceAtMeet,
                 relation: 'none'|'requested'|'friend'|'rejected' } ]
friendRequests: [ { id, fromId, fromName, fromAvatar, sentAt, status: 'pending'|'accepted'|'ignored' } ]
friends: [ { id, name, avatar, gender, addedAt } ]   // 上限 100
messages: { [friendId]: [ { id, fromMe: bool, text, time } ] }
```

### 3.5 存储键汇总
| 数据 | 存储 | 键 |
|---|---|---|
| 个人资料 | localStorage | `bikeapp.profile` |
| 自行车 | localStorage | `bikeapp.bike` |
| 今日骑行/历史 | localStorage | `bikeapp.rides` |
| 附近/好友/请求/消息 | localStorage | `bikeapp.social` |
| 上传头像图片 | IndexedDB | `bikeapp.avatars` |

---

## 4. 里程碑拆解（按依赖顺序，映射验收标准）

> 每个里程碑完成后做一次自测，对照 PRD 第 10 节对应验收项。

### M0 — 工程骨架与全局能力
**目标**：能跑起来的单页框架 + 全局基础能力。
- 建 index.html / app.css / store / storage / map-engine 骨架
- 底部 4 Tab 导航与页面切换、模拟手机屏幕容器
- 全局 toast 与按钮按压态组件
- localStorage + IndexedDB 读写封装；首次启动初始化默认数据（默认个人资料、默认虚拟自行车）
- SimService 目录占位

**验收对照**：10#1（主框架）、10#17（反馈）

### M1 — 模块4「我的」（最独立，先做）
**目标**：个人资料可看可改，头像支持预设+上传，全局同步。
- D1 资料页、D2 编辑表单（用户名、性别单选、生日、爱好、简介）
- 预设头像库选择 + 本地图片上传（存 IndexedDB）
- store 中维护当前 profile，全局订阅头像昵称变化

**验收对照**：10#12、10#13、10#14

### M2 — 模块1「找车」
**目标**：地图标注虚拟车 + 发光/响铃 + 信息卡 + 步行导航。
- Canvas 模拟地图（街道网格、地标、比例）
- 绘制车图标、方向箭头、距离文本
- 发光/响铃按钮与模拟反馈（倒计时、动效、toast）
- 车信息卡弹层（车名/停放时间/位置描述/距离 + 发光/响铃/步行导航）
- 模拟步行导航视图（方向箭头 + 指引 + 到达提示）

**验收对照**：10#2、10#3、10#4

### M3 — 模块2「骑行记录」
**目标**：今日汇总 + 模拟骑行实时生成 + 分速着色 + 分段详情 + 卡路里。
- 今日汇总卡（里程/时长/均速/卡路里）
- 【开始/结束模拟骑行】：虚拟车沿预设路线行驶，实时生成点与分段
- 路线分色绘制（黄<3 / 绿3~9 / 红>9）+ 速度图例
- 点击路段弹详情（里程/均速/用时）
- 卡路里估算（按里程与均速的换算函数，见 `calorie.js`）
- 结束骑行写入 rideToday

**验收对照**：10#5、10#6

### M4 — 模块3「骑友」
**目标**：附近 + 双向加好友 + 请求 + 好友上限 + 聊天。
- C1 附近的人列表（头像/昵称/擦肩时间/距离）
- 加好友：点击→"请求已发送"→模拟处理后提示通过/拒绝
- C1.5 新的好友请求（小红点、同意/忽略）
- C2 好友列表（显示 X/100，达 100 禁止添加并提示）
- C3 聊天页（发消息、模拟自动回复、本地保存）
- 好友/请求/消息联动 store，头像昵称全局一致

**验收对照**：10#7、10#8、10#9、10#10、10#11

### M5 — 数据持久化 + 备份恢复 + 集成自测
**目标**：全量数据可导出/导入，整体验收通过。
- 备份：导出全部数据（含头像）为一个 JSON 文件下载
- 恢复：选择备份文件导入，覆盖/合并本地数据
- 全流程集成自测（见第 6 节）

**验收对照**：10#15、10#16

---

## 5. 关键实现约定

- **中文界面**：所有文案中文；表单、按钮、toast 统一。
- **反馈**：任何可点击元素都有按下态或 toast；异步/模拟操作给明确结果提示。
- **分色规则硬编码**：集中在 `map-engine.js`/`calorie.js` 一处，便于改规则。
- **模拟延迟**：好友"对方处理"用 `setTimeout` 延迟几秒出结果，模拟真实感。
- **上限校验**：加好友、同意请求前都校验 `friends.length < 100`。
- **替换预留**：SimService 与 MapEngine 以接口隔离，将来接真实硬件/网络/地图时只替换实现，不改页面。

---

## 6. 验证与自测方案（对照 PRD 第 10 节）

| # | 自测动作 | 预期 |
|---|---|---|
| 1 | 双击打开 index.html | 出现底部 4 Tab，中文，可切换 |
| 2 | 找车 Tab | 地图显示车图标 + 方向箭头 + 距离 |
| 3 | 点发光/响铃 | 出现对应反馈 + 按钮动效 |
| 4 | 点车图标 → 信息卡 → 步行导航 | 弹层、操作、导航指引、到达提示均可用 |
| 5 | 开始模拟骑行 → 结束 | 汇总卡数值正确（用已知路程/速度核对） |
| 6 | 造一条含三配速的路线 | 路段颜色逐段为黄/绿/红；点路段显示里程/均速/用时 |
| 7 | 骑友 Tab | 附近列表显示模拟用户 |
| 8 | 加好友 | 请求已发送 → 延迟后提示通过/拒绝；通过者入好友列表 |
| 9 | 加到 100 好友 | 无法继续添加，提示已达上限 |
| 10 | 收到请求 | 可同意/忽略，同意后成为好友 |
| 11 | 聊天 | 发消息有模拟回复，消息本地保留 |
| 12 | 编辑资料并保存 | 资料页即时更新 |
| 13 | 选预设头像 / 上传图片 | 头像生效 |
| 14 | 改头像昵称 | 附近/好友/聊天同步更新 |
| 15 | 修改后刷新/关闭/重启浏览器 | 数据仍在 |
| 16 | 导出备份 → 清数据/新环境 → 导入 | 各模块数据完整恢复 |

**自测方式**：每里程碑完成后按上表实际点击验证；最终 M5 做一次完整回归。可用浏览器控制台读取 localStorage 抽样核对关键数据。

---

## 7. 交付方式

- 交付一个可双击打开的入口（index.html），以及配套 css/js 文件，放在用户项目目录。
- 交付后用浏览器实际打开验证可运行、数据可持久化，并对照验收表逐项检查。
- 完成后给出打开方式与自测结果。

---

## 8. 后续（暂不做，但预留）

- **接真实硬件**：替换 SimBike 为蓝牙定位追踪器连接，发光/响铃走真实指令。
- **转手机**：套用 PWA/Capacitor 打包，页面与数据层可直接复用。
- **真实用户网络**：附近的人/加好友/聊天接服务器，SimNearby 替换为真实数据源。
- **真实地图/GPS**：MapEngine 替换为真实地图 provider，虚拟坐标换真实 GPS。
- 云同步、账号登录、排行榜等（PRD 第 9 节范围内暂不做）。
