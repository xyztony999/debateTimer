# API 设计 — 接口防护（P-02-api-protection）

| 属性 | 值 |
|------|-----|
| 版本 | v1.1 |
| 日期 | 2026-11-24 |
| 模块编码 | P-02（平台支撑域，无子模块；文件夹 `P-02-api-protection`） |
| 状态 | v1.0 为逆向归档（系统已上线，如实反映现有实现）；v1.1 增量以【R20】标注，属前瞻设计，待代码阶段实现 |
| 输入 | P-02-api-protection PRD v1.1 + AA v1.2（平台支撑域）+ 现有代码 + R20 安全与合规设计说明 |
| 功能类型 | 工具类/平台技术机制（无聚合根、无状态机，承 PRD §7） |
| 实现索引 | server/lib/rateLimit.js、server/lib/rateLimits.js、server/index.js:39-45,123-127、server/routes/auth.js:27-33,65,115、server/.env.example:28-38 |

> 章节裁剪依据 d3-api 分册裁剪矩阵（工具类）：第 2 章不适用；第 3 章选填——限流语义（429+Retry-After）并入 4.4 公共规范；第 5 章不填。**本档为最简归档**：只记录限流器契约、四组挂载点与 429 语义。

## 1. 模块设计概述

### 1.1 业务背景及目标

以最小机制保护匿名暴露面：**内存滑动窗口限流**（按客户端 IP 计数），遏制登录爆破与匿名公开面（display/gallery）滥用；命中返回 **429 + Retry-After**；阈值与窗口全部 env 可配、默认值不变（单进程部署，单机内存态即够）。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 做什么 | 通用滑动窗口限流器（429+Retry-After 语义）；四组 env 可配限流器及挂载点；SSE 长流「仅建立时计一次」豁免语义；`trust proxy 1` 还原真实客户端 IP |
| 不做什么 | 不做持久化/跨进程限流（单进程设计）；不做登录失败计数与账号锁定（bcrypt 慢哈希 + 限流已覆盖威胁模型）；不做验证码；`/api/auth/status`、`/logout`、`/me` 不设限（被限流客户端仍能登出/查登录态） |
| 用户类型 | 纯技术机制，不标注（AA v1.0） |

### 1.3 设计决策

| # | 决策 | 依据（代码） |
|---|------|-------------|
| PP-1 | 单进程内存 Map + 惰性 sweep 清理过期桶（距上次 sweep ≥ windowMs 时全表清理空桶） | server/lib/rateLimit.js:1-5 注释、11-24 |
| PP-2 | 工厂函数每次调用创建**独立**限流器（独立桶）：路由工厂每挂载实例化一次、测试隔离 | server/lib/rateLimits.js:1-9 注释 |
| PP-3 | **SSE 豁免**：display 限流器包住整组路由，SSE 长流仅在连接建立时过一次限流器，建立后的长连接不再计数 | server/lib/rateLimits.js:33 注释、server/index.js:123-125 注释 |
| PP-4 | register 在注册关闭期间同样计数（防开放状态探测） | server/routes/auth.js:29-30 注释 |
| PP-5 | 被拒请求**不占桶**——只有被接受的请求记录时间戳（`times.push` 在放行分支） | server/lib/rateLimit.js:31-42 |
| PP-6 | `trust proxy 1`：宝塔 nginx 反代后还原真实客户端 IP，否则全体共享代理 IP 一个桶 | server/index.js:39-41 |
| 【R20】PP-7 | 限流取到的 `req.ip` 与 R20 审计日志记录的 IP 同源，二者依赖同一个前置条件：api 域名保持仅 DNS 解析，或 Nginx 配置 Cloudflare realip | R20 §9.3（事实、局限与确认方法）；主域已启用 Cloudflare 代理而 api 域名未启用（主会话 2026-11-24 核实） |

### 1.4 领域对象总览

无业务对象、无聚合根。限流桶（ip → 接受时间戳数组）为过程数据（P7 计算中间值），429 响应结构为契约载体（P4），env 阈值配置启动时解析（P7）。

### 1.5 上下文映射

| 外部上下文 | 集成关系 | 映射模式 |
|-----------|---------|---------|
| S-01 账号与准入 | login/register 端点的限流挂载（auth 路由工厂内实例化） | 嵌入 |
| S-03/C-02 匿名面 | display/gallery 路由组整体包裹限流（index.js 挂载处） | 嵌入 |
| 部署面 | env 阈值配置（server/.env.example:28-38）；trust proxy 与 nginx 拓扑耦合 | 运维约定 |

## 2. 跨聚合根设计

不适用（无聚合根）。

## 3. 应用/基础设施层设计

选填章节，不设——限流语义在 4.4 统一给出。

## 4. 聚合根详细设计（无聚合根模块的机制契约）

### 4.1 领域模型（过程数据）

限流桶：`Map<ip, number[]>`（仅记录**被接受**请求的时间戳，PP-5）；sweep 惰性清理空桶。

### 4.2 状态模型

不适用。窗口滑动即桶内时间戳过滤（`now - t < windowMs` 保留）。

### 4.3 子流程设计

不适用。

### 4.4 接口设计（限流契约）

#### 4.4.1 四组挂载点与默认阈值

| # | 防护面 | env 前缀 | 默认 | 说明 | 代码 |
|---|--------|---------|------|------|------|
| L1 | `POST /api/auth/login` | `AUTH_LOGIN_RATE_*` | **20 次 / 15 分钟**（900_000ms） | 唯一匿名密码校验点，爆破主目标 | rateLimits.js:17-23、auth.js:32,115 |
| L2 | `POST /api/auth/register` | `AUTH_REGISTER_RATE_*` | 10 次 / 1 小时（3_600_000ms） | 注册关闭期间同样计数（PP-4） | rateLimits.js:25-31、auth.js:33,65 |
| L3 | `/api/display/*`（含 SSE stream） | `DISPLAY_RATE_*` | 60 次 / 分钟 | **SSE 长流仅建立时计一次**（PP-3） | rateLimits.js:33-39、index.js:126 |
| L4 | `/api/gallery/*` | `GALLERY_RATE_*` | 120 次 / 分钟 | 匿名浏览与登录复制共享同一 IP 桶 | rateLimits.js:41-47、index.js:127 |
| 【R20】L5 | `/api/privacy/*`（隐私说明读取，匿名） | `PRIVACY_RATE_*` | 60 次 / 分钟 | 匿名可达的静态内容面，沿用匿名路由从严的原则 | 规划：rateLimits.js、index.js；EP-PROTECT-01 |
| 【R20】L6 | `POST /api/auth/totp/verify`、`/recover`、`/confirm`（按键，不是按 IP） | `TOTP_ATTEMPT_RATE_*` | 每账号 5 次失败 / 15 分钟 | 二次验证与绑定确认的尝试限流；只计失败；三者共用同一账号的计数 | 规划：rateLimit.js（`createAttemptLimiter`）、auth.js；EP-PROTECT-03 |

- env 命名规则：`<前缀>_WINDOW_MS` / `<前缀>_MAX`；未配置或非法值（非正数）回落默认（`positiveNumber`，rateLimits.js:12-15）。
- L1/L2 在 auth 路由工厂内实例化并挂端点前；L3/L4/L5 在 server/index.js 挂载处包住**整组**路由（因此 SSE stream 的建立计入一次，长连接期不计——PP-3）。
- 【R20】L6 的计数键由调用方给定（登录二次验证时是预登录凭据所属的账号 id，绑定确认时是当前账号 id），因此它不是 Express 中间件，而是 auth 路由处理器内部调用的一个对象。`createAttemptLimiter({windowMs, max})` 返回三个方法：
  - `isBlocked(key)` → `{ blocked, retryAfterSec }`：窗口内已记录的失败数达到 `max` 时 `blocked` 为 true；
  - `recordFailure(key)` → `{ failures, remaining, blocked, retryAfterSec }`：记一次失败，返回窗口内的失败总数、剩余次数与是否已达上限；
  - `reset(key)`：二次验证或绑定确认成功后清零。

  窗口与判定语义和 `rateLimit.js` 的滑动窗口相同（只存被记录的时间戳；`Retry-After` 取窗口内最早一次到窗口末尾的秒数，向上取整且不少于 1；惰性清理空桶）。
- 【R20】跨域响应通过 `Access-Control-Expose-Headers: Retry-After` 暴露该头（`server/lib/originPolicy.js` 的 `createCorsMiddleware`）。浏览器对跨域脚本默认只放行少数几个响应头，不列出的话，部署在另一个域名上的前端读不到它，只能按默认窗口提示等待时间。同源部署（Nginx 反代 `/api`）不经过 CORS，本来就能读到。
- 不设限端点：`/api/auth/status`、`/api/auth/logout`、`/api/auth/me`（auth.js:27-31 注释；由路由挂载结构保证，套件无专测——如实标注）。【R20】`/api/auth/totp/status`、`/setup`、`/disable` 与 `/api/privacy/consent/accept` 都要求会话，不设限（按 IP）；`/api/auth/totp/confirm` 不按 IP 限流，但按账号计失败次数（L6）。

#### 4.4.2 判定与 429 语义（核心契约）

1. 键 = `req.ip || 'unknown'`（trust proxy 1 生效后为 nginx 传递的真实客户端 IP，index.js:39-41）。
2. 窗口滑动：过滤 `now - t >= windowMs` 的过期时间戳。
3. 窗口内接受数 `>= max` → 拒绝：
   - 响应头 `Retry-After: <秒>`——取「窗口内最早命中到窗口末尾」的秒数，向上取整且 ≥1（rateLimit.js:32-33）；
   - 响应体 429：`{success: false, message: 'Too many requests, please retry later'}`（rateLimit.js:34-37）。
4. 未超限 → 记录当前时间戳后放行（被拒请求不占桶，PP-5）；窗口滑过即自然恢复，无需显式解封。

#### 4.4.3 校验规则汇总

| 规则 | 代码 |
|------|------|
| env 阈值非法（非正数/非数值）回落默认 | rateLimits.js:12-15 |
| 429 不消耗桶容量（重试窗口滑过后放行） | rateLimit.js:31-42 |
| 同一 IP 在 login 与 register 各自独立计数（独立桶，PP-2） | rateLimits.js:17-31 |
| display 的 SSE 流建立后不再计数 | index.js:123-126 包裹位置 |

#### 4.4.4 附带防护（同属接口防护语境，归部署面）

`express.json({limit:'1mb'})` 请求体上限（index.js:45）；CORS 白名单 + 非安全方法 Origin 校验（index.js:47-70）。

### 4.5 领域事件与集成

无领域事件、无 MQ、无仓储。集成面：被保护端点经中间件组合嵌入（4.4.1 挂载列），无跨进程依赖。

## 5. 模块清单汇总

工具类不填。消费方：auth 路由（L1/L2）、display/gallery 挂载（L3/L4）。

## 6. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.1 | 2026-11-24 | rule_added | R20 增量设计：新增挂载点 L5（`/api/privacy` 按 IP 60 次/分钟）；新增按键尝试限流器 `createAttemptLimiter`（挂载点 L6，S-01 两步验证按账号 5 次失败/15 分钟）；补充 trust proxy 与审计 IP 的关联（PP-7） |
| v1.0 | 2026-11-11 | initial | 逆向归档初稿（平台支撑域最简归档）：滑动窗口限流器契约、四组挂载点与默认阈值、429+Retry-After 语义、SSE 仅建立时计一次豁免。验证：`bun test server/` 85 pass / 0 fail（含 rateLimit.test.js、rateLimits.test.js，本归档会话执行） |
