<!-- kb-generated: 2026-11-11 | sources: 6 | assumptions: 0 | open: 0 -->

# 服务池（service-pool）

> **如实声明：本项目没有服务池。** 架构为「前端静态 SPA + 单体 Express API + 单实例 MongoDB」，
> 无微服务、无外部系统集成、无独立 options 服务。前端全部选择项为静态配置或 i18n 文案
> （明细在 `workspace/01-solution/common-spec/select-pool.md`，此处不重复——knowledge 存索引，
> 明细在 workspace conventions，引擎 03-extension-guide §2 纪律）。

## 索引结构

| 节 | 内容 |
|----|------|
| §1 服务池判定 | 为何本项目无服务池（单体验证证据） |
| §2 运行时组件职责表 | Express / MongoDB / SSE Hub / PWA / Playwright 等替代「服务」的职责清单 |
| §3 数据源替代说明 | 选择项/枚举的真实来源指向 |

## 1. 服务池判定

| 判定项 | 结论 | 证据 |
|--------|------|------|
| 微服务拆分 | 无 | API 单进程：`server/index.js` 一个 Express app 挂全部 7 个路由（admin/auth/configurations/pairing/display/matchLogs/gallery，index.js:11-17） |
| 独立 options/字典服务 | 无 | 选择项=静态配置+i18n（select-pool.md 头注「本项目无独立 options 接口」） |
| 外部系统集成 | 无 | 无消息队列/无第三方 API 调用；server 依赖仅 express/mongodb/bcryptjs/cookie-parser/cors/dotenv（`server/package.json` dependencies 全列表） |
| 部署形态 | 静态 + 单体 | 前端 GitHub Pages（deploy/production 分支）；API+MongoDB 宝塔单机（README §生产部署） |

## 2. 运行时组件职责表

> 无服务池不等于没有组件——以下单体内部的职责切分，是 D1 AA「平台支撑域」的代码落点。

| 组件 | 技术栈 | 职责 | 代码落点 |
|------|--------|------|---------|
| Web 前端 | React 19 + Vite + MUI v9 | SPA（计时台/大屏/设置/广场/记录/管理/登录/遥控）；PWA 应用壳离线可用 | `src/`、`vite.config.js`（VitePWA network-only，API 流量永不缓存） |
| API 单体 | Express 4 + Node | 全部业务端点：认证/模板/广场/配对/大屏/记录/管理；`trust proxy 1` 适配宝塔 nginx | `server/index.js`、`server/routes/` |
| 持久层 | MongoDB 6 单实例 | 仅四类集合：`configurations` / `users` / `match_logs` / `app_settings`（会话不落库） | `server/lib/*.js`、README §数据备份（NDJSON 导出此四集合） |
| 实时通道 | SSE Hub（自研，内存） | 配置变更广播 + 会话状态/快照/指令/信令事件；单进程内定向分发 | `server/lib/sseHub.js`、`server/lib/timerSessions.js` |
| 接口防护 | 内存滑动窗口限流 | 登录 20/15min、注册 10/h、gallery 120/min、display 60/min，429+Retry-After | `server/lib/rateLimit.js`、`rateLimits.js` |
| PWA 壳 | vite-plugin-pwa + Workbox | 应用壳缓存（navigateFallback，`/api/` denylist）、可安装、断网横幅 | `vite.config.js`、`src/index.jsx`（手动注册接 controllerchange） |
| E2E 测试 | Playwright | 前端 only + API route mock（无需 MongoDB）：gallery/display 跟随/control 三 spec | `playwright.config.js`（端口 39173，serviceWorkers block） |
| 运维脚本 | Node（server/scripts） | NDJSON 备份 14 天轮换 + 整库回放；预置赛制导入（UOMDC/BP/奥瑞冈） | `server/scripts/backup.js`、`import-configurations.js`、`presets/` |

## 3. 数据源替代说明

| 前端数据需求 | 真实来源 | 说明 |
|--------------|---------|------|
| 下拉/单选选项 | 静态配置 + i18n 文案 | 计时模式、界面语言、主题、铃声方案、PID 图标注册表（`src/config/pidIcons.js`） |
| 业务枚举 | workspace 枚举池 | stageTimingMode/timerPhase 等 8 项登记于 `workspace/01-solution/common-spec/enum-pool.md` |
| 赛制蓝本 | 自建 MongoDB API | `GET/POST /api/configurations`（`server/routes/configurations.js`），广场视图 `gallery.js` |
| 实时状态 | SSE + WebRTC 直连 | 大屏经 `/api/display/:token/stream`；同网遥控直连副本（见 design-decisions ADR-3/ADR-7） |

**接入新「服务」时的扩展位**：若未来引入外部数据源（如赛事管理平台），在
`workspace/01-solution/common-spec/select-pool.md` 登记明细 + 本文件 §2 追加组件行，
本节判定表相应翻新。
