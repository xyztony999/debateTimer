# PRD — 离线应用壳（P-03）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-11-11 |
| 模块编码 | P-03（平台支撑域，无子模块） |
| 状态 | 逆向归档（系统已上线，如实反映现有实现） |
| 关联 | C-01 比赛计时（离线时计时本地运行的能力归属方）、P-01 实时通信通道（离线时不可用的同步面）、部署面（GitHub Actions → Pages，SPA 404 回退） |
| 实现索引 | vite.config.js:33-56、src/index.jsx:15-23、src/components/PwaBits.jsx、src/App.jsx:6,23、src/TimerControlPage.jsx:413,492、src/locales/en.json:356-359、public/（图标资产）、src/styles/App.css:95 |

## 1. 业务目标与范围

### 1.1 业务目标（G1）

保证比赛现场「断网不中断」：**PWA 应用壳**预缓存后离线可用（计时页壳照常加载），**断网横幅**全局提示「计时可用、云同步不可用」，**可安装**到桌面/主屏。计时逻辑本身的离线运行归 C-01（本地引擎），本模块只负责壳与感知层。

### 1.2 功能范围（G2）

**做什么**：
- vite-plugin-pwa 应用壳：`autoUpdate` 自动更新 + Workbox 预缓存；SPA 导航回退 `/index.html`（`/display/:token` 深链经 404.html 兜底加载 SPA）；API 流量**永不缓存**（`navigateFallbackDenylist: /^\/api\//`，network-only，防计时同步/模板数据离线读旧）（vite.config.js:33-56 及注释）
- SW 注册自管：插件注入关闭（`injectRegister: null`），应用侧 `registerSW()` 并挂 `controllerchange`——已有 controller 的页面在新 SW 接管时**重载一次**（display 页常开数日，避免旧缓存 bundle 常驻；首次访问不重载）（src/index.jsx:11-23 D25 注释）
- 断网横幅：`useOffline`（navigator.onLine + offline/online 事件）驱动全局细条横幅，`role="status"`，三语文案「Offline: timer works, cloud sync unavailable」（src/components/PwaBits.jsx:5-34、src/App.jsx:23、src/locales/en.json:356-359）
- 安装入口：`InstallButton` 捕获 `beforeinstallprompt`，出现才渲染，点击 `prompt()` 并在用户选择后隐藏；计时控制页两处挂载（桌面工具条/遥控形态）（src/components/PwaBits.jsx:37-69、src/TimerControlPage.jsx:413,492）
- Manifest：standalone 显示、主题色 `#1a237e`、图标 192/512/maskable-512（vite.config.js:39-52、public/icon-*.png 实存）
- 构建配套：vendor 手动分包（react/mui/i18n），计时页更新时不重下大依赖、提高 SW 预缓存复用（vite.config.js build.rollupOptions 注释）

**不做什么**：
- 不缓存任何 API 响应（无离线数据面——模板/记录/同步全部要求在线）
- 不做后台同步（Background Sync）、推送通知、离线队列重放
- 不做更新提示 UI（autoUpdate 静默接管 + 必要时单次重载）
- 不做离线时的写操作缓冲（比赛记录保存离线不可用，如实为在线功能）

### 1.3 决策记录（现有实现的关键取舍）

| # | 决策 | 依据 |
|---|------|------|
| PS-1 | API 面从导航回退中排除，走 network-only | vite.config.js:53-56（注释「API traffic is never cached … never goes stale-offline」） |
| PS-2 | SW 由应用注册而非插件注入，接管 controllerchange 重载 | src/index.jsx:11-23（D25：display 页常开数日） |
| PS-3 | 横幅只提示不阻断——计时壳与本地引擎继续工作 | src/components/PwaBits.jsx:22 注释「the timer shell keeps working」 |

## 2. 角色与对象

- 纯技术机制，无业务角色（AA v1.0 不标注用户类型）；受益者为全部前端用户（现场计时操作员为主）。
- 领域对象：无业务对象。横幅可见性/安装提示事件为过程数据。

## 3. 功能需求

### FR-1 应用壳预缓存与更新

- 构建期生成 SW 与 manifest；`registerType:'autoUpdate'` 新 SW 跳过 waiting 直接接管；`cleanupOutdatedCaches` 清旧缓存（vite.config.js:34, 56）
- `controllerchange` 且页面已有 controller → `window.location.reload()` 一次（src/index.jsx:15-22）
- 导航请求命中 denylist 外的全部回退 `/index.html`（SPA 路由与 /display 深链可离线打开壳）

### FR-2 断网横幅

- 事件驱动：`offline`→显示、`online`→隐藏；初值取 `navigator.onLine`（src/components/PwaBits.jsx:5-20）
- 全局唯一挂载点（App.jsx:23），覆盖所有路由；样式类 `.offline-banner`（src/styles/App.css:95）；文案三语（en/zh-Hans/fr-CA 的 `pwa.offline` 键）

### FR-3 安装入口

- `beforeinstallprompt` 事件捕获并 `preventDefault`，有事件才显示按钮；点击调 `prompt()`，`userChoice` 结算后隐藏（src/components/PwaBits.jsx:37-69）
- Manifest 满足可安装性（standalone + 192/512 图标 + start_url）

## 4. 非功能需求（N1/N2）

- 更新策略对常开页友好：display 页连续开数天不丢功能（重载仅发生在 SW 接管瞬间）
- 离线时用户可感知（横幅）但操作不中断（壳可用、本地计时可用）
- 依赖体积：vendor 分包控制预缓存增量

## 5. 验收标准

1. 构建产物含 SW/manifest（vite-plugin-pwa 构建期生成）；`/api/*` 请求不被回退劫持（vite.config.js:55 denylist；配置级保证）
2. 断网横幅显隐与文案：组件逻辑简单直白，但 **src/ 下无对应单测、本归档会话亦未运行浏览器端验证**（grep PwaBits/OfflineBanner 于 *.test.js 无命中）——如实标注为未验证项
3. 可安装性：manifest 字段与图标文件齐备（public/icon-192.png、icon-512.png、icon-maskable-512.png 实存，ls public 确认）；真实浏览器安装提示未在本会话运行
4. 全量回归：`bun test server/` 85 pass / 0 fail（2026-11-11 执行）——本模块为前端机制，该套件不覆盖 PWA 行为，仅确认无服务端回归

## 6. 领域建模（D2-2，平台支撑域裁剪）

| 项目 | 内容 |
|------|------|
| 本域名称 | 离线应用壳（P-03） |
| 领域分层 | 平台支撑域（零业务语义纯技术机制，AA v1.0） |
| 聚合根 | 无 |

### 领域对象清单（全部为过程数据，不建模）

| 数据项 | 类别 | 处理方式 |
|--------|------|---------|
| 离线状态（navigator.onLine 派生） | P2 展示数据 | 事件驱动 React state |
| beforeinstallprompt 事件 | P3 UI 交互状态 | 捕获即存，用毕即弃 |
| SW 预缓存清单 | P6 平台托管 | Workbox 构建期管理 |

## 7. PRD 完备性自检（D2-1）

功能类型：**平台技术机制（应用壳）**——T 类全部不适用。

G1 ✅ §1.1｜G2 ✅ §1.2（含明确「不做」边界）｜G3 ✅ §2｜G4/G5 ✅ §6｜T1-T9 不适用｜N1/N2 ✅ §4

**结论**：通过（平台支撑域按裁剪深度）。

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.0 | 2026-11-11 | 逆向归档初稿：按 D2 分册模板从现有实现（vite-plugin-pwa 配置/SW 注册/断网横幅/安装入口）归纳生成 |
