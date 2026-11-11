# API 设计 — 离线应用壳（P-03-offline-shell）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-11-11 |
| 模块编码 | P-03（平台支撑域，无子模块；文件夹 `P-03-offline-shell`） |
| 状态 | 逆向归档（系统已上线，如实反映现有实现） |
| 输入 | P-03-offline-shell PRD v1.0 + AA v1.0（平台支撑域）+ 现有代码 |
| 功能类型 | 工具类/平台技术机制（无聚合根、无状态机，承 PRD §7） |
| 实现索引 | vite.config.js:33-56、src/index.jsx:11-23、src/components/PwaBits.jsx、src/App.jsx:23 |

> 章节裁剪依据 d3-api 分册裁剪矩阵（工具类）：第 2 章不适用；第 3 章选填；第 5 章不填。**本档为最简归档，且本模块无 HTTP API 面**——PWA 壳为纯前端构建与运行时机制，本文档作为「接口面缺席」的显式记录，供 D4 交互设计读取时知道无需接口契约。

## 1. 模块设计概述

### 1.1 业务背景及目标

保证比赛现场「断网不中断」：PWA 应用壳预缓存后离线可用（计时页壳照常加载），断网横幅全局提示「计时可用、云同步不可用」，可安装到桌面/主屏。计时逻辑本身的离线运行归 C-01（本地引擎），本模块只负责壳与感知层。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 做什么 | vite-plugin-pwa 应用壳（autoUpdate + 预缓存 + SPA 导航回退）；SW 注册自管与 controllerchange 单次重载；断网横幅；安装入口；manifest（standalone + 192/512/maskable 图标） |
| **API 面** | **无任何 HTTP 端点**——全部为构建期（Workbox SW 生成）与浏览器运行时机制（Service Worker / 事件 / navigator.onLine） |
| 不做什么 | 不缓存任何 API 响应（`navigateFallbackDenylist: [/^\/api\//]`，vite.config.js:54，network-only，防离线读旧）；不做后台同步/推送/离线写缓冲；不做更新提示 UI（autoUpdate 静默接管） |
| 用户类型 | 纯技术机制，不标注（AA v1.0） |

### 1.3 设计决策

| # | 决策 | 依据（代码） |
|---|------|-------------|
| PS-1 | API 面从导航回退中排除（network-only）：计时同步/模板数据永不落 SW 缓存 | vite.config.js:31-32 注释 + :54 denylist |
| PS-2 | SW 由应用侧注册（`injectRegister: null`）而非插件注入，接管 controllerchange 时已有 controller 的页面重载一次（display 页常开数日，避免旧缓存 bundle 常驻；首次访问不重载） | src/index.jsx:11-23（D25 注释）、vite.config.js `injectRegister` |
| PS-3 | 断网横幅只提示不阻断——计时壳与本地引擎继续工作 | src/components/PwaBits.jsx:22 注释 |

### 1.4 领域对象总览

无业务对象、无聚合根。离线状态（navigator.onLine 派生）、beforeinstallprompt 事件、SW 预缓存清单均为过程数据（PRD §6）。

### 1.5 上下文映射

| 外部上下文 | 集成关系 | 映射模式 |
|-----------|---------|---------|
| C-01 比赛计时 | 离线时计时本地运行的能力归属方（本模块只保壳可用） | 引用 |
| P-01 实时通道 | 离线时不可用的同步面（横幅提示「云同步不可用」） | 引用 |
| 部署面 | GitHub Actions → Pages，SPA 404 回退配合 `/display/:token` 深链 | 运维约定 |

## 2. 跨聚合根设计

不适用（无聚合根）。

## 3. 应用/基础设施层设计

选填章节，不设。

## 4. 聚合根详细设计（无聚合根模块的机制归档）

### 4.1 领域模型（过程数据）

不建模（1.4）。机制要点：`registerType:'autoUpdate'` + `cleanupOutdatedCaches`；`controllerchange` 且页面已有 controller → `window.location.reload()` 一次（src/index.jsx:15-22）；横幅由 `offline/online` 事件驱动、三语文案键 `pwa.offline`（PwaBits.jsx:5-34）；安装按钮捕获 `beforeinstallprompt` → `prompt()` → `userChoice` 结算后隐藏（PwaBits.jsx:37-69）；vendor 手动分包（react/mui/i18n）控制预缓存增量（vite.config.js build.rollupOptions）。

### 4.2 状态模型 / 4.3 子流程设计

不适用。

### 4.4 接口设计

**无 HTTP API 面。** 与服务端的唯一关系是**消费约束**：全部 `/api/*` 请求走 network-only、永不缓存（PS-1）——即本模块对 P-01/P-02/S 域接口的唯一契约是「离线时这些请求直接失败，由调用方（本地计时引擎 + 横幅）兜底」。

### 4.5 领域事件与集成

浏览器事件面（offline/online/beforeinstallprompt/controllerchange），无服务端集成。

## 5. 模块清单汇总

不填（无对外服务、无 SQL/DDL）。

## 6. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档初稿（平台支撑域最简归档）：显式记录本模块无 HTTP API 面，机制与前端行为归前端规格/D4；API 面唯一约束为 `/api/*` 永不缓存。验证：本档为前端机制，服务端套件不覆盖（`bun test server/` 85 pass / 0 fail 仅确认无服务端回归，本归档会话执行）；PWA 浏览器行为本会话未运行验证 |
