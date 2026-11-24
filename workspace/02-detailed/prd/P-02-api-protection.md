# PRD — 接口防护（P-02）

| 属性 | 值 |
|------|-----|
| 版本 | v1.1 |
| 日期 | 2026-11-24 |
| 模块编码 | P-02（平台支撑域，无子模块） |
| 状态 | v1.0 为逆向归档（系统已上线，如实反映现有实现）；v1.1 增量以【R20】标注，属前瞻设计，待代码阶段实现 |
| 关联 | S-01 账号与准入（login/register 端点的防护对象；两步验证按账号尝试限流的使用方）、S-03 模板广场与 C-02（display/gallery 匿名面）、S-01 隐私说明读取（privacy 匿名面） |
| 实现索引 | server/lib/rateLimit.js、server/lib/rateLimits.js、server/index.js:41,126-127、server/routes/auth.js:27-33,65,115、server/.env.example |

## 1. 业务目标与范围

### 1.1 业务目标（G1）

以最小的机制保护匿名暴露面：**内存滑动窗口限流**（按客户端 IP 计数），遏制登录爆破与匿名公开面（display/gallery）滥用；命中返回 **429 + Retry-After**；阈值与窗口全部 **env 可配**、默认值不变（单进程部署，单机内存态即够）。

### 1.2 功能范围（G2）

**做什么**：
- 通用滑动窗口限流器：按 `req.ip` 计数（时间戳数组），窗口内计数 ≥max 即 429，`Retry-After` 取窗口内最早命中到窗口末尾的秒数（server/lib/rateLimit.js:26-43）
- 四组既有、一组【R20】新增的 env 可配限流器（阈值与窗口经工厂每次独立创建、独立桶，测试隔离）（server/lib/rateLimits.js:5-9）：
  | 端点 | env 前缀 | 默认 | 说明 |
  |------|---------|------|------|
  | POST /api/auth/login | `AUTH_LOGIN_RATE_*` | **20 次 / 15 分钟**（900_000ms） | 唯一匿名密码校验点，爆破主目标 |
  | POST /api/auth/register | `AUTH_REGISTER_RATE_*` | 10 次 / 1 小时（3_600_000ms） | 注册关闭期间同样计数（防探测） |
  | /api/display（含 SSE stream） | `DISPLAY_RATE_*` | 60 次 / 分钟 | SSE 长连接**仅在建立时计一次**，建立后不计 |
  | /api/gallery | `GALLERY_RATE_*` | 120 次 / 分钟 | 匿名浏览与登录复制共享同一 IP 桶 |
  | 【R20】/api/privacy（隐私说明读取） | `PRIVACY_RATE_*` | 60 次 / 分钟 | 匿名可达的静态内容面，沿用匿名路由从严的原则 |
- 【R20】按键尝试限流器：与滑动窗口同一内核，但计数键由调用方给定。S-01 用它对两步验证按**账号**计数（默认 15 分钟 5 次失败，env 前缀 `TOTP_ATTEMPT_RATE_*`），动态口令、恢复码与绑定确认共用计数。这不是账号锁定：计数只拦二次验证与绑定确认这两步，口令步骤不受影响，窗口滑过即恢复
- `trust proxy 1`：宝塔 nginx 反代后还原真实客户端 IP，避免全体共享代理 IP 一个桶（server/index.js:39-41）
- 附带防护：请求体上限 `express.json({limit:'1mb'})`（server/index.js:45）；CORS 白名单 + 写方法 Origin 校验（server/index.js:47-70，归部署面不属于本模块但同属接口防护语境）

**不做什么**：
- 不做持久化/跨进程限流（单进程设计；多实例部署需换 Redis 等方案，当前无此诉求）
- 不做登录口令失败的按账号锁定（bcrypt 慢哈希 + 限流已覆盖威胁模型；账号治理见 D-01）。【R20】按账号的尝试限流只拦二次验证与绑定确认这两步，不是账号锁定，见 §1.2
- 不做验证码/人机校验
- `/api/auth/status`、`/logout`、`/me` **不设限**——被限流客户端仍能登出/查登录态（server/routes/auth.js:27-31 注释）

### 1.3 决策记录（现有实现的关键取舍）

| # | 决策 | 依据 |
|---|------|------|
| PP-1 | 单进程内存 Map + 周期性 sweep 清理过期桶 | server/lib/rateLimit.js:5-6「Single-process by design」注释，:11-24 |
| PP-2 | 工厂函数每次调用创建独立限流器（独立桶） | 路由工厂每次挂载实例化一次、测试隔离（server/lib/rateLimits.js:5-9 注释） |
| PP-3 | SSE 豁免：长流仅在连接建立时过一次限流器 | server/lib/rateLimits.js:33 注释「SSE counts once at connect」 |
| PP-4 | register 在注册关闭时同样计数 | server/routes/auth.js:29-30 注释（防开放状态探测） |

## 2. 角色与对象

- 纯技术机制，无业务角色（AA v1.0 不标注用户类型）；防护对象为匿名可达端点与凭据端点。
- 领域对象：无业务对象。限流桶（ip→时间戳数组）为过程数据。

## 3. 功能需求

### FR-1 滑动窗口限流器（通用内核）

- 键 = `req.ip || 'unknown'`；命中记录接受时间戳（被拒请求不占桶）；窗口滑动过滤过期时间戳（server/lib/rateLimit.js:29-31, 40-42）
- 触发 429：响应头 `Retry-After`（秒，向上取整，≥1）+ JSON `{success:false, message:'Too many requests, please retry later'}`（server/lib/rateLimit.js:32-38）
- 惰性清理：距上次 sweep ≥windowMs 时全表清理空桶（server/lib/rateLimit.js:11-24）

### FR-2 挂载点

- login/register 限流器在 auth 路由工厂内实例化，挂 `POST /login`、`POST /register` 之前（server/routes/auth.js:32-33, 65, 115）
- display/gallery 限流器在 server/index.js 挂载处包住整组路由（server/index.js:126-127）
- 【R20】privacy 限流器在 server/index.js 挂载处包住 `/api/privacy` 整组路由
- 【R20】两步验证尝试限流器在 auth 路由工厂内实例化，供 `POST /api/auth/totp/verify`、`/recover` 与 `/confirm` 调用，三者共用同一账号的计数。计数键为账号 id：登录二次验证取预登录凭据所属的账号，绑定确认取当前账号。`/confirm` 在口令不匹配时计一次失败（未达上限返回 401 并带 `data.attemptsRemaining`，达到上限返回 429），确认成功时清零；格式不符的 400 不计入
- env 变量与默认值见 §1.2 表；未配置或非法值（非正数）回落默认（server/lib/rateLimits.js:12-15 positiveNumber）

## 4. 非功能需求（N1/N2）

- 限流判定为纯内存操作（数组过滤），微秒级；桶数量与独立 IP 数线性
- 单机内存态：重启清零（可接受——限流是短窗防护不是状态资产）
- 多代理链下 `trust proxy 1` 只取最后一跳；部署拓扑变更需同步调整
- 【R20】上一点在 R20 之后有了实际后果：审计日志按同一来源取 IP。api 域名若改为经 Cloudflare 代理而 Nginx 未配置 realip，所有请求会共用边缘 IP，按 IP 的限流被合并成一个大桶，审计日志记到的也不是用户 IP。前置条件与确认方法见 R20 §9.3

## 5. 验收标准

1. 超阈值请求收到 429 且携带 Retry-After；窗口滑动恢复后放行；各 env 默认值生效（server/lib/rateLimit.test.js、server/lib/rateLimits.test.js，`bun test server/` 85 pass / 0 fail，2026-11-11 执行）
2. login 20/15min、register 10/1h、display 60/min、gallery 120/min 默认阈值经 rateLimits.test.js 断言
3. 被 429 的客户端仍可调用 /api/auth/status、/logout（无限流挂载，auth.js:27-31；行为由路由挂载结构保证，套件中无专测——如实标注）
4. trust proxy 生效性（nginx 后真实 IP 分桶）：部署环境行为，本归档会话未运行集成环境验证

## 6. 领域建模（D2-2，平台支撑域裁剪）

| 项目 | 内容 |
|------|------|
| 本域名称 | 接口防护（P-02） |
| 领域分层 | 平台支撑域（零业务语义纯技术机制，AA v1.0） |
| 聚合根 | 无 |

### 领域对象清单（全部为过程数据，不建模）

| 数据项 | 类别 | 处理方式 |
|--------|------|---------|
| 限流桶（ip→接受时间戳数组） | P7 计算中间值 | 内存 Map，窗口滑过即弃 |
| 429 响应结构（Retry-After/message） | P4 请求/响应结构 | 接口契约载体 |
| env 阈值配置 | P7 计算中间值 | 启动时解析，非正数回落默认 |
| 【R20】按账号的尝试计数（账号 id → 失败时间戳数组） | P7 计算中间值 | 内存 Map，窗口滑过即弃；桶内只有时间戳，不存其他数据 |

## 7. PRD 完备性自检（D2-1）

功能类型：**平台技术机制（防护）**——T 类全部不适用。

G1 ✅ §1.1｜G2 ✅ §1.2（含明确「不做」边界）｜G3 ✅ §2｜G4/G5 ✅ §6｜T1-T9 不适用｜N1/N2 ✅ §4

**结论**：通过（平台支撑域按裁剪深度）。

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.1 | 2026-11-24 | R20 增量设计：新增 privacy 匿名面限流（60 次/分钟/IP）；新增按键尝试限流器供 S-01 两步验证按账号计数（5 次失败/15 分钟）；补充 trust proxy 与审计 IP 的关联说明 |
| v1.0 | 2026-11-11 | 逆向归档初稿：按 D2 分册模板从现有实现（rateLimit/rateLimits 及挂载点）归纳生成 |
