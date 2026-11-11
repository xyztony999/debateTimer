<!-- kb-generated: 2026-11-11 | sources: 7 | assumptions: 0 | open: 0 -->

# 架构选型（architecture-choices）

> 逆向归档自已上线系统与 D1 三文档 v1.0。选型基线：前端 React 19 + Vite + MUI 的静态 SPA；
> 后端 Express + MongoDB **单实例**单体；**双分支部署**（Pages + 宝塔）；实时通道 **SSE + WebRTC 双通道**。
> 每项含取舍理由与证据落点。

## 索引结构

| 节 | 内容 |
|----|------|
| §1 领域划分表 | DDD 四层应用域（AA v1.0）与投入深度 |
| §2 技术选型与取舍 | 四大选型：前端栈 / 后端栈 / 部署形态 / 实时通道（选择·备选·理由） |
| §3 栈版本表 | 前后端依赖实测版本（package.json） |
| §4 质量与测试选型 | bun test / Playwright / Lighthouse CI 分工 |

## 1. 领域划分表

| 应用域 | 模块 | 划分理由 | 投入深度 |
|--------|------|---------|---------|
| 核心业务域 | C-01 比赛计时、C-02 大屏同步与远程控制 | 有状态机与聚合根（计时五相位、会话生命周期），业务价值核心 | 深度建模（D2/D3 全量） |
| 支撑业务域 | S-01 账号与准入、S-02 赛制模板、S-03 模板广场、S-04 比赛记录 | 含业务规则与主数据，独立上下文，被核心域调用 | 常规建模 |
| 基础数据域 | D-01 权限与用户治理、D-02 系统配置 | 系统级引用数据，无业务状态机 | 薄适配 |
| 平台支撑域 | P-01 实时通道、P-02 接口防护、P-03 离线应用壳 | 零业务语义纯技术机制，可复用 | 薄适配 |

（来源：application-arch.md §应用域分层；模块编码 `X-MM-SS-NN`）

## 2. 技术选型与取舍

### 2.1 前端：React 19 + Vite + MUI（SPA，无 SSR）

- **选择**：React 19 函数组件 + hooks；Vite 6 构建；MUI v9 + emotion 组件与主题体系。
- **取舍理由**：
  - CRA 官方弃用 → 迁 Vite（README §开头；dev server 与构建提速，PWA/暗色主题靠插件生态承接）；
  - 计时器是重交互实时 UI，hooks 架构（engine reducer + 组装 hook + 域 hook）天然贴合，
    无 SSR/SEO 需求（工具型站点+登录墙），SPA 静态托管即可；
  - MUI 提供 DataTable/Dialog/Snackbar 等成体系组件与暗色主题（跟随系统+手动记忆），
    避免自研组件库；emotion 运行时样式换可控体积预算（见 §4 Lighthouse）。
- **证据**：`package.json`（react ^19.2.6、vite ^6.4.2、@mui/material ^9.2.0）；`src/timer/` hooks 族。

### 2.2 后端：Express + MongoDB 单实例单体

- **选择**：一个 Express 进程挂全部路由；MongoDB 单实例存四集合；会话态在进程内存。
- **取舍理由**：
  - 负载是「一场比赛一个教室」量级（单会话、几十观众），微服务/k8s 纯属过度设计——
    服务池判定见 `knowledge/service-pool/index.md` §1；
  - 会话生命周期=比赛时长（分钟级），存内存不落库（api-timer-session.md §1.3 D-5），
    重启后果由客户端自愈兜底（R10 代际 + R11 主机自愈）——用「无状态持久化」换「零运维」；
  - MongoDB 文档型贴合模板/记录的嵌套结构（stages/entries），无需事务跨文档；
  - 权衡代价：单点、重启丢会话、限流为单进程内存窗口（`server/lib/rateLimit.js` 头注自认 caveat）——
    均为有意接受。
- **证据**：`server/index.js`（7 路由单 app）、`server/package.json`（依赖仅 6 个）。

### 2.3 部署：双分支 Pages + 宝塔

- **选择**：`master` 分支 GitHub Actions 构建主程序与 CI；`deploy/production` 分支触发发布——
  前端 GitHub Pages，API/MongoDB 宝塔单机（`deploy.sh --api-only`）。
- **取舍理由**：
  - 前端静态零成本托管（Pages + CNAME debatetimer.tonyxyz.com），SPA fallback 用 404.html 复制方案
    （vite.config.js spaFallback404）；
  - API 需要常驻进程+本地 MongoDB，宝塔是已有运维面（nginx 反代 + trust proxy 1 修限流桶坍缩，
    server/index.js:41-44）；
  - 双分支而非双环境变量：master 保持可开发 previews，deploy/production 即发布记录，
    CI（lint/test/build/Lighthouse）与发布解耦。
- **证据**：README §生产部署、`.github/workflows/deploy.yml`（branches: [deploy/production]）、ci.yml/lighthouse.yml。

### 2.4 实时通道：SSE + WebRTC 双通道

- **选择**：大屏与遥控的默认路径走 **SSE**（复用 display 流加事件类型）；同网遥控叠加
  **WebRTC DataChannel** 直连副本；直连失败静默回退 SSE 中转。
- **取舍理由**：
  - SSE 单向下行够用——计时状态本就是「主机→消费者」下行流，上行走普通 POST；
    相比 WebSocket 免去双向协议与重连状态机，且能复用既有 HTTP 中间件（鉴权/限流）；
  - 不引第三方实时服务（Pusher/Firebase）：后端已是单体内存态，自研 SSE Hub ~几十行即达（sseHub.js）；
  - WebRTC 只做「同网 host 候选」直连（iceServers: []，无 STUN/TURN）：跨国中转延迟是真实痛点，
    但跨网打洞的 STUN/TURN 运维成本不值——3s 握手超时静默回退保证零劣化（rtcChannel.js:1-22）；
  - 信令不另开通道：搭 SSE 会话流（`signal` 事件 + POST /session/signal），连接数收敛为
    每主机标签页 1 条（useDebateTimer.js:41-44 头注）。
- **证据**：`server/lib/sseHub.js`、`src/timer/rtcChannel.js`、design-decisions ADR-3/ADR-7。

## 3. 栈版本表

| 层 | 依赖 | 版本 | 证据 |
|----|------|------|------|
| 前端 | react / react-dom | ^19.2.6 | package.json dependencies |
| 前端 | vite（构建） | ^6.4.2 | devDependencies |
| 前端 | @mui/material + icons | ^9.2.0 | dependencies |
| 前端 | react-router-dom | ^7.15.0 | dependencies |
| 前端 | i18next + react-i18next | ^26.0.10 / ^17.0.7（+ languagedetector ^8.2.1） | dependencies |
| 前端 | axios | ^1.17.0 | dependencies |
| 前端 | @emotion/react + styled | ^11.14.x | dependencies |
| 前端 | vite-plugin-pwa | ^2.0.0 | devDependencies |
| 工具链 | bun（包管理/测试运行） | README 指定 | bun.lock、scripts `bun test src/ server/` |
| 后端 | express | ^4.21.2 | server/package.json |
| 后端 | mongodb（driver） | ^6.12.0 | server/package.json |
| 后端 | bcryptjs / cookie-parser / cors / dotenv | ^3.0.2 / ^1.4.7 / ^2.8.5 / ^16.4.7 | server/package.json |
| 测试 | @playwright/test | ^1.64.1 | devDependencies |
| 测试 | @testing-library/react + jest-dom | ^16.3.2 / ^6.9.1 | devDependencies |

## 4. 质量与测试选型

| 工具 | 分工 | 取舍理由 |
|------|------|---------|
| bun test | 单测（src/ + server/，138 个） | 与包管理一体，零额外 runner；测试与实现同目录（*.test.js） |
| Playwright | E2E（前端 only + API mock，端口 39173） | 不需 MongoDB 即可在本地与 CI 一致运行；serviceWorkers block 保证密闭（playwright.config.js 头注） |
| ESLint 9 | lint（flat config，react-hooks 插件） | react-compiler 约束（render 读 ref 禁止）靠 exhaustive-deps 与插件规则守门 |
| Lighthouse CI | 性能预算门禁 | performance ≥0.8 / script ≤300KiB / total ≤400KiB（error 级断言，lighthouserc.json）；只审 `/`，PWA 分不压（CI 构建无 API 注入属预期噪音） |

（数据来源：README §质量门禁 断言表与范围说明，2026-10-27 实测基线）
