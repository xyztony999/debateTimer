# PRD — 离线应用壳（P-03）

| 属性 | 值 |
|------|-----|
| 版本 | v1.1 |
| 日期 | 2026-11-24 |
| 模块编码 | P-03（平台支撑域，无子模块） |
| 状态 | v1.0 为逆向归档（系统已上线，如实反映现有实现）；v1.1 增量以【R20】标注，属前瞻设计，待代码阶段实现 |
| 关联 | C-01 比赛计时（离线时计时本地运行的能力归属方）、P-01 实时通信通道（离线时不可用的同步面）、部署面（GitHub Actions → Pages，SPA 404 回退） |
| 实现索引 | vite.config.js:33-56、src/index.jsx:15-23、src/components/PwaBits.jsx、src/App.jsx:6,23、src/TimerControlPage.jsx:413,492、src/locales/en.json:356-359、public/（图标资产）、src/styles/App.css:95；【R20】index.html:22-27（网页字体）、src/theme.js:3-9（字体栈） |

## 1. 业务目标与范围

### 1.1 业务目标（G1）

保证比赛现场「断网不中断」：**PWA 应用壳**预缓存后离线可用（计时页壳照常加载），**断网横幅**全局提示「计时可用、云同步不可用」，**可安装**到桌面/主屏。计时逻辑本身的离线运行归 C-01（本地引擎），本模块只负责壳与感知层。

【R20】v1.1 起补充一点：应用入口页的网页字体改为非阻塞加载，使第三方字体请求缓慢或卡住时，首屏仍能以回退字体渲染（用户裁定 D47）。本文只记录做法与验收项，不预设效果。

### 1.2 功能范围（G2）

**做什么**：
- vite-plugin-pwa 应用壳：`autoUpdate` 自动更新 + Workbox 预缓存；SPA 导航回退 `/index.html`（`/display/:token` 深链经 404.html 兜底加载 SPA）；API 流量**永不缓存**（`navigateFallbackDenylist: /^\/api\//`，network-only，防计时同步/模板数据离线读旧）（vite.config.js:33-56 及注释）
- SW 注册自管：插件注入关闭（`injectRegister: null`），应用侧 `registerSW()` 并挂 `controllerchange`——已有 controller 的页面在新 SW 接管时**重载一次**（display 页常开数日，避免旧缓存 bundle 常驻；首次访问不重载）（src/index.jsx:11-23 D25 注释）
- 断网横幅：`useOffline`（navigator.onLine + offline/online 事件）驱动全局细条横幅，`role="status"`，三语文案「Offline: timer works, cloud sync unavailable」（src/components/PwaBits.jsx:5-34、src/App.jsx:23、src/locales/en.json:356-359）
- 安装入口：`InstallButton` 捕获 `beforeinstallprompt`，出现才渲染，点击 `prompt()` 并在用户选择后隐藏；计时控制页两处挂载（桌面工具条/遥控形态）（src/components/PwaBits.jsx:37-69、src/TimerControlPage.jsx:413,492）
- Manifest：standalone 显示、主题色 `#1a237e`、图标 192/512/maskable-512（vite.config.js:39-52、public/icon-*.png 实存）
- 构建配套：vendor 手动分包（react/mui/i18n），计时页更新时不重下大依赖、提高 SW 预缓存复用（vite.config.js build.rollupOptions 注释）
- 【R20】网页字体非阻塞加载：`index.html` 中 Google Fonts 的 Roboto 样式表不再阻塞渲染，改为先按样式表预加载、到位后由内联脚本切换为样式表（`rel="preload" as="style"` 加 `onload`），并在 `<noscript>` 内保留一份常规样式表作回退。字体来源、字重与 `display=swap` 参数不变，Service Worker 缓存策略不变（做法与验收见 FR-4）

**不做什么**：
- 不缓存任何 API 响应（无离线数据面——模板/记录/同步全部要求在线）
- 不做后台同步（Background Sync）、推送通知、离线队列重放
- 不做更新提示 UI（autoUpdate 静默接管 + 必要时单次重载）
- 不做离线时的写操作缓冲（比赛记录保存离线不可用，如实为在线功能）
- 【R20】不自托管字体，不把外部字体纳入 Service Worker 缓存；字体仍由 Google Fonts 提供，隐私说明的第三方一节继续如实列出

### 1.3 决策记录（现有实现的关键取舍）

| # | 决策 | 依据 |
|---|------|------|
| PS-1 | API 面从导航回退中排除，走 network-only | vite.config.js:53-56（注释「API traffic is never cached … never goes stale-offline」） |
| PS-2 | SW 由应用注册而非插件注入，接管 controllerchange 重载 | src/index.jsx:11-23（D25：display 页常开数日） |
| PS-3 | 横幅只提示不阻断——计时壳与本地引擎继续工作 | src/components/PwaBits.jsx:22 注释「the timer shell keeps working」 |
| 【R20】PS-4 | 网页字体非阻塞加载：以「预加载加到位切换」（`rel="preload" as="style"` 加 `onload`）加 `<noscript>` 回退实现，不改字体来源与 SW 缓存策略 | 用户裁定 D47；应用 index.html 于代码阶段实现（写法修订见 FR-4 做法 1）；官网 site/index.html 用的是 `media="print"` 写法（提交 aa72c9f），不经 Vite 处理，照常有效 |

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

### FR-4 【R20】网页字体非阻塞加载

**现状基线（2026-11-24 仓库已提交内容）**：应用入口页 `index.html` 第 24–27 行以阻塞渲染的方式加载 Roboto 样式表（`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap">`）。官网 `site/index.html` 已在提交 `aa72c9f` 改为非阻塞写法，应用入口页尚未改。

**做法**：

1. 同一个样式表地址改为非阻塞加载：先按样式表预加载，到位后由内联脚本把它切换为样式表。

   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com" />
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
   <link rel="preload" as="style"
         href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap"
         onload="this.rel='stylesheet'" />
   <noscript><link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet" /></noscript>
   ```

   **实现修订（代码阶段，v1.1 尚未发布，就地修订）**：原定写法是 `media="print"` 加 `onload` 切回 `all`，并假设「Vite 的 HTML 处理不改动外链」。代码阶段实测该假设不成立：Vite 会改写 `<link rel="stylesheet">` 标签并丢弃 `media`、`onload` 这类额外属性，`build/index.html` 里留下的仍是一个阻塞式样式表，字体请求挂起的回归 E2E 因此等不到登录页标题。于是改用下文「待验证风险」所列的第一备选（预加载加到位切换），Vite 不改写这种链接。官网 `site/index.html` 不经 Vite 处理，原有写法照常有效。

2. 字体到位前，界面按既有字体栈回退：MUI 主题为 `Roboto, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`（`src/theme.js:3-9`）；字体到位后由 `display=swap` 完成切换。
3. 不改 `vite.config.js`：外部字体不进入预缓存清单，也没有针对字体的运行时缓存规则，保持现状。
4. 构建后检查 `build/index.html`：字体链接带 `rel="preload"`、`as="style"` 与 `onload`；`<noscript>` 内有等价的常规样式表。（已核：2026-11-24 构建产物第 27–35 行，预加载链接与 `<noscript>` 回退均完整保留。）

**验收项**（Gate 2 执行，结果写入 Gate 2 报告）：

| # | 验收项 | 判定 |
|---|--------|------|
| 1 | Lighthouse CI 预算不变且通过：`categories:performance` ≥ 0.8（error）；`resource-summary:script:size` ≤ 307200 字节（error）；`resource-summary:total:size` ≤ 409600 字节（error）；`total-byte-weight` ≤ 512000 字节（warn）。配置文件 `lighthouserc.json` 的阈值不改 | 全部通过 |
| 2 | 报告改后三次实测值，并与历史基线对照（见下） | 写入报告 |
| 3 | 回归 E2E：用路由拦截让 `fonts.googleapis.com` 与 `fonts.gstatic.com` 的请求保持挂起（既不继续也不中止），断言登录页一级标题在 5 秒内出现 | 通过 |
| 4 | 禁用 JavaScript 的浏览器上下文（`javaScriptEnabled: false`）打开首页，`<noscript>` 内的样式表存在 | 通过 |

历史基线（2026-10-27 本地 `.lighthouseci/` 三次报告，仅供参考，改后数值以重跑为准）：性能分 0.87、0.89、0.87；CLS 0.00028；LCP 约 2.71 秒；脚本传输量 241,571 字节；资源总量 290,148 字节（其中字体 38,071 字节、字体样式表 2,166 字节）。

**待验证风险**：

- 字体样式表不再阻塞首屏，首屏文字先以回退字体出现、随后切换为 Roboto，可能改变 CLS 与 LCP。对性能分的影响以实测为准，本文不预设方向。
- 若性能分因此低于 0.8，备选做法依次为：给回退字体配置度量兼容的字栈（或 `size-adjust`）；改用 `rel="preload" as="style"` 加 `onload` 的写法；自托管字体（需另行评估许可与体积预算，属范围变更）。
- 回归 E2E 只能说明「字体请求挂起时首屏仍渲染」，不能代表真实弱网下的加载耗时。

## 4. 非功能需求（N1/N2）

- 更新策略对常开页友好：display 页连续开数天不丢功能（重载仅发生在 SW 接管瞬间）
- 离线时用户可感知（横幅）但操作不中断（壳可用、本地计时可用）
- 依赖体积：vendor 分包控制预缓存增量

## 5. 验收标准

1. 构建产物含 SW/manifest（vite-plugin-pwa 构建期生成）；`/api/*` 请求不被回退劫持（vite.config.js:55 denylist；配置级保证）
2. 断网横幅显隐与文案：组件逻辑简单直白，但 **src/ 下无对应单测、本归档会话亦未运行浏览器端验证**（grep PwaBits/OfflineBanner 于 *.test.js 无命中）——如实标注为未验证项
3. 可安装性：manifest 字段与图标文件齐备（public/icon-192.png、icon-512.png、icon-maskable-512.png 实存，ls public 确认）；真实浏览器安装提示未在本会话运行
4. 全量回归：`bun test server/` 85 pass / 0 fail（2026-11-11 执行）——本模块为前端机制，该套件不覆盖 PWA 行为，仅确认无服务端回归
5. 【R20】网页字体非阻塞加载的四项验收见 FR-4「验收项」表，在 Gate 2 执行并记录

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
| 【R20】网页字体样式表的加载状态 | P6 平台托管 | 浏览器加载器管理，应用代码不读取 |

## 7. PRD 完备性自检（D2-1）

功能类型：**平台技术机制（应用壳）**——T 类全部不适用。

G1 ✅ §1.1｜G2 ✅ §1.2（含明确「不做」边界）｜G3 ✅ §2｜G4/G5 ✅ §6｜T1-T9 不适用｜N1/N2 ✅ §4

**结论**：通过（平台支撑域按裁剪深度）。

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.1 | 2026-11-24 | 代码阶段修订（v1.1 尚未发布，就地修订）：FR-4 的加载写法由 `media="print"` + `onload` 改为「预加载加到位切换」——Vite 会改写外链样式表标签并丢弃这两个属性，原写法在构建产物里仍是阻塞式；四项验收已执行，结果见 Gate 2 报告 |
| v1.1 | 2026-11-24 | R20 增量设计（用户裁定 D47）：应用 index.html 的 Google Fonts 改为非阻塞加载（`media="print"` + `onload` + `<noscript>` 回退）；新增 FR-4，写明做法、四项验收项（Lighthouse 预算不变并重跑记录实测值、字体请求挂起时的首屏回归 E2E、构建产物与 noscript 检查）与待验证风险 |
| v1.0 | 2026-11-11 | 逆向归档初稿：按 D2 分册模板从现有实现（vite-plugin-pwa 配置/SW 注册/断网横幅/安装入口）归纳生成 |
