# S-01 账号与准入 API 设计

| 属性 | 值 |
|------|-----|
| 模块编码 | S-01（应用域：支撑业务域） |
| 文档性质 | v1.0 部分为逆向归档：系统已上线，如实反映现有实现（路径、状态码、错误文案均为现网事实）。v1.1 增量部分以【R20】标注，属前瞻设计，待代码阶段实现 |
| 版本 | v1.1 |
| 状态 | 稳定（v1.0）+ 设计稿（v1.1 增量） |
| 最后更新 | 2026-11-24 |
| 功能类型 | 主数据类（聚合根=账号，被 S-02/S-04/D-01 以 ownerId/userId 引用；生命周期=启用/禁用，无审批流） |
| 管理模式 | MIXED（账号本体自管：注册/登录驱动；注册开关设置为托管：存储属 D-02 app_settings 单例，本模块每次请求读取，写侧为管理台治理接口）。【R20】隐私说明正文与版本随代码发布，不在运行时写入 |
| 上游依据 | S-01 PRD v1.1；BA v1.1 §2.1.1；AA v1.2 §2.2.1；FL v1.2 §2.2.1.1 / §2.3.1.1 / §2.4.1.1；R20 安全与合规设计说明 |
| 实现锚点 | `server/routes/auth.js`、`server/routes/admin.js:41-102`（注册开关两接口）、`server/lib/authPolicy.js`、`server/lib/password.js`、`server/lib/session.js`、`server/lib/authMiddleware.js`、`server/lib/rateLimits.js`、`server/index.js:122,131`（挂载） |
| 【R20】规划落点 | `server/lib/totp.js`、`server/lib/totpCrypto.js`、`server/lib/preloginTickets.js`、`server/lib/authGates.js`、`server/lib/privacyNotices.js`、`server/routes/privacy.js`、`server/scripts/reset-totp.js`；`server/.env.example` |

## 1. 模块设计概述

### 1.1 业务背景及目标

系统全部业务资产（模板、比赛记录）按账号归属隔离，账号是全站操作的前提（BA 附录A「账号与准入 → 全部 L3」）。本模块解决「谁能进入系统」：

- 访客自行注册（注册关闭时收到 403 与关闭提示）；
- 已注册用户以用户名/口令登录，登录态经会话 Cookie 跨页面保持；
- 管理员经管理台开放/关闭公开注册（首个管理员账号不受开关影响）。
- 【R20】登录可在口令之外追加第二道验证（两步验证）：管理员账号必须使用，普通用户自愿；
- 【R20】使用系统之前向用户说明个人数据的收集与使用：注册须同意，已注册用户再次使用时须确认最新版本；
- 【R20】注册、登录、两步验证、隐私同意等事件写入审计日志（P-04）。

### 1.2 边界说明

| 方向 | 内容 |
|------|------|
| 做什么 | 注册、登录、退出、当前用户查询、注册状态查询；注册开关的管理侧读/写两接口（本表收录并详设，路由文件属治理面）；【R20】两步验证的登录校验与绑定管理；【R20】隐私说明读取与同意提交；【R20】登录后门控 |
| 不做什么 | 用户清单/禁用/角色/改密/删除（D-01 `server/routes/admin.js:112-241`）；app_settings 存储模式本身（D-02）；登录/注册端点的限流机制实现（P-02，本模块只挂载）；改密自助、验证码、OAuth、注册审批（PRD §3.2 不做）；【R20】两步验证的管理员重置（D-01 A7）；【R20】审计日志的存储与查询（P-04）；【R20】用户自助导出或删除数据 |
| 边界注记 | `GET/PUT /api/admin/settings/registration` 代码位于 `admin.js`（D-01/D-02 治理面路由文件），因业务语义属 S-01 注册准入控制（FL S-01-03），接口详设归本档；D-01 文档侧只作引用，不重复详设。【R20】隐私说明读取接口挂独立的 `/api/privacy` 前缀，语义属本模块的「隐私告知与同意」子模块（AA 2.2.1.5） |

### 1.3 设计决策

| # | 决策 | 理由（实现注释原义） |
|---|------|---------------------|
| D1 | 注册开关三参判定 `isRegistrationOpen(userCount, allowRegistration, adminSetting)`：无用户恒开 → 管理台值覆盖 → env 回落（`server/lib/authPolicy.js:11-23`） | 全新部署绝不能被陈旧的「关闭」配置锁死；管理台未设置时与纯 env 行为逐字节兼容 |
| D2 | `/status` 与 `/register` 共用 `registrationState()` 快照（一次 `countDocuments` + 一次单例读取，`server/routes/auth.js:35-54`） | 「首用户角色判定」与「开关判定」共用同一快照，不可能不一致 |
| D3 | 登录失败统一 401「Invalid username or password」（`server/routes/auth.js:120-123`） | 不泄露账号是否存在 |
| D4 | 会话令牌 32 字节随机 hex，服务端仅存 SHA-256 散列（`server/lib/session.js:6-12,30-40`） | 明文令牌只存在于 Cookie；库泄露不可回放 |
| D5 | 注册开关单例用固定字符串 `_id='registration'`（`server/lib/authPolicy.js:1-4`） | 非二十四位 hex，天然唯一免索引，备份往返不变形 |
| D6 | status/logout/me 不限流，login/register 限流（`server/routes/auth.js:27-33`） | 被限流的客户端仍能干净退出；匿名口令校验与注册是滥用面 |
| D7 | 首个注册用户 role=admin，并附带迁移遗留模板（`server/routes/auth.js:88-103`） | 无人系统 bootstrap；迁移失败不阻塞注册 |
| 【R20】D8 | 口令通过后、二次验证完成前只签发预登录凭据，不建立会话（R20 D52） | 第二道验证未过就不应有会话 |
| 【R20】D9 | 登录后待办步骤按请求实时派生，由全局中间件强制；不写入会话记录（R20 D51） | 存量会话不改、不销毁也能被门控；直接调接口绕不过去 |
| 【R20】D10 | TOTP 用 RFC 6238 标准参数（30 秒、6 位、SHA-1），允许前后各一步；判定与「记录已用时间步」是一次条件更新（R20 D53） | 兼容主流验证器；同一时间步的口令至多成功一次 |
| 【R20】D11 | 密钥以 AES-256-GCM 加密，认证数据绑定账号 id；主密钥取自 `TOTP_SECRET_KEY`，未配置即停用两步验证（R20 D54） | 用户硬要求：不得静默降级为明文 |
| 【R20】D12 | 二次验证按账号限流：动态口令、恢复码与绑定确认共用同一个失败计数（R20 D56） | 分开计数，恢复码或绑定确认就成了并行的猜测通道 |
| 【R20】D13 | 管理两步验证需要「近期密码证明」；管理员不可关闭（R20 D57） | 防止借用未退出的设备绑定他人验证器或关闭第二道验证 |
| 【R20】D14 | 隐私说明由服务端内容模块下发，版本为常量；同意记录只存 `{version, consentedAt}`（R20 D61、D65） | 同意对象与说明版本一一对应；文本随代码受版本控制与审阅 |
| 【R20】D15 | 存量数据零迁移：新字段按需追加，不改写既有文档（R20 D62） | 对线上数据的不破坏约束 |
| 【R20】D16 | 注册同意随注册请求校验（`agree` 与 `privacyVersion`）（R20 D63） | 同意必须发生在建号之前，且由服务端判定 |

逆向归档差异注记：S-01 PRD §8 表格中「管理台写开关 400 非布尔」与实现一致；PRD §6「无『清除回落 env』操作」与本档收录的 PUT 语义一致（无删除/清空端点，恢复 env 语义需手工删除 app_settings 文档，见 `server/.env.example` 注释）。

### 1.4 领域对象总览

| 对象 | 分类 | 说明 |
|------|------|------|
| 账号（用户） | 聚合根 | users 集合；`publicUser` 三字段对外表示（`server/lib/authPolicy.js:42-51`），其 id 即全域 ownerId |
| 登录会话 | 域内对象·实体 | sessions 集合；N:1 账号；随禁用/改密/删除被批量销毁（D-01 触发 `destroyUserSessions`） |
| 注册开关设置 | 关联领域对象（托管） | app_settings 单例 `_id='registration'`；存储属 D-02，本模块读（`registrationState`），写侧为本档 REG-PUT 接口 |
| 登录态（前端） | 过程数据（P2） | AuthContext 中 user/status 快照，派生自 /me 与 /status，不入领域 |
| 【R20】两步验证凭据 | 域内对象·值对象 | `users.totp` 子文档；1:1 属于账号；整体替换，解绑或重置即整体移除 |
| 【R20】隐私说明同意记录 | 域内对象·值对象 | `users.privacy` 子文档；每次同意整体替换 |
| 【R20】预登录凭据 | 过程数据（P7） | 进程内存；只能用于二次验证，不是会话 |
| 【R20】待办步骤 | 过程数据（P2） | 每次请求按账号状态派生的 `pending` 数组，不落库 |

子流程：【R20】登录（已启用的账号跨两次请求，从签发预登录凭据到其作废）；【R20】两步验证绑定（口令证明 → 待确认密钥 → 一次动态口令确认）。注册、退出、管理台开关读写仍是聚合根上的直接操作。

### 1.5 上下文映射

| 外部上下文 | 关系 | 映射模式 |
|-----------|------|---------|
| D-02 系统配置（app_settings） | 读注册开关单例；REG-PUT 为其唯一写入口 | 遵奉者（直接读写标准单例） |
| D-01 权限与用户治理 | 消费 disabled/role 对登录的影响；禁用/改密/删除触发会话批量销毁 | 共享内核（users 集合同源） |
| S-02 / S-04 | 账号 id 作为 ownerId 落于模板/记录 | 共享内核（ownerId 语义全域一致） |
| P-02 接口防护 | login/register 挂载限流器，429+Retry-After | 遵奉者 |
| C-01~S-04 全部 L3 | 登录态是一切写操作前提（requireAuth） | 发布语言（401 'Authentication required' 统一契约） |
| 【R20】P-04 审计日志 | 注册、登录、两步验证、同意的写入点调用 `recordAudit`；向 P-04 提供 `consentOf()` 所依赖的版本常量 | 遵奉者 |
| 【R20】D-01（两步验证重置） | D-01 A7 移除 `totp` 子文档后，本模块的登录流程与门控自动按新状态执行 | 共享内核 |

## 2. 跨聚合根设计（裁剪：不适用）

本模块单一聚合根（账号），无跨聚合根约束/编排。注册开关设置是 D-02 存储上的关联领域对象（见 1.4），不构成本域聚合根；其与本域的一致性由「共用 `registrationState()` 快照」这一读侧编排保证（1.3-D2），无独立不变量与跨根事务。

## 3. 应用/基础设施层设计

### 3.1 接口规范

- 前缀与挂载：`/api/auth`（`server/index.js:122`）；注册开关两接口挂载于 `/api/admin`（`server/index.js:131`）。【R20】隐私说明与同意两个接口挂载于新前缀 `/api/privacy`。
- 路径风格：现网为 `/domain/action` 两段式（如 `/api/auth/register`）与 `/domain/resource/action`（如 `/api/admin/settings/registration`）混用，如实归档；G1-08 三段式对照见 §6 自检记录。【R20】新增接口一律三段式（api-path-rules.md §2 第 2 条）。
- 方法语义：GET 只读；POST 触发动作（register/login/logout）；PUT 写单例设置。
- 请求体：`application/json`（全局 `express.json({limit:'1mb'})`，`server/index.js:45`）。
- 响应包络：成功 `{success:true, data?}`；失败 `{success:false, message}`（`server/routes/auth.js:58,61` 等；无 code 字段——code 仅 configurations 路由使用，见 S-02 §3.4）。【R20】新增的机器可判别失败场景在失败包络上附加 `code` 字段（见 §3.4），`message` 仍是给用户看的单一事实源。
- 鉴权：全局 `attachUser` 由 Cookie 恢复 `req.user`（`server/lib/authMiddleware.js:27-34`）；会话 Cookie `dt_session` httpOnly（`server/lib/session.js:14-28`）。【R20】`attachUser` 另在请求上挂载两项内部数据供门控与两步验证使用：完整账号文档与当前会话的创建时间（不进入任何响应）。
- 用户类型标注：每接口在 §4.4 详情标注；「匿名」指无 Cookie 也可调用。

### 3.2 依赖与约束

| 依赖 | 类型 | 约束 |
|------|------|------|
| users / sessions / appSettings 集合（MongoDB） | 存储 | username 唯一索引、tokenHash 唯一索引、expiresAt TTL（`server/index.js:104-106`） |
| ALLOW_REGISTRATION env | 配置 | 仅 `'true'`/`'1'`（大小写不敏感）为真，其余含未设置为假（`server/lib/authPolicy.js:6-9`） |
| SESSION_COOKIE_NAME / SESSION_TTL_MS / COOKIE_SAMESITE / COOKIE_SECURE env | 配置 | 见 `server/.env.example`；TTL 默认 30 天 |
| P-02 rateLimits | 组件 | `createLoginRateLimiter` 15min/20 次、`createRegisterRateLimiter` 60min/10 次，env 可调（`server/lib/rateLimits.js:18-31`） |
| migrateLegacyConfigurations | 附带动作 | 仅首用户注册时触发；失败不阻塞注册（`server/routes/auth.js:98-103`） |
| bcryptjs | 库 | cost=12（`server/lib/password.js:4`） |
| 【R20】node:crypto | 库（内建） | AES-256-GCM、HMAC-SHA1、随机数、SHA-256、`timingSafeEqual`；不新增第三方依赖 |
| 【R20】TOTP_SECRET_KEY env | 配置 | 32 字节随机数的 base64；缺失或长度不符时两步验证停用（§3.4 配置项） |
| 【R20】TOTP_ATTEMPT_RATE_WINDOW_MS / MAX env | 配置 | 默认 900000 / 5 |
| 【R20】PRIVACY_RATE_WINDOW_MS / MAX env | 配置 | 默认 60000 / 60 |
| 【R20】P-02 按键尝试限流器 | 组件 | `createAttemptLimiter`（P-02 API v1.1 §4.4.1 L6），供 TOTP-VERIFY、TOTP-RECOVER、TOTP-CONFIRM 使用（同一账号共用计数） |
| 【R20】P-04 auditLog | 组件 | `recordAudit`、`consentOf`（P-04 API §4.4.2） |

### 3.3 权限模型

| 角色 | STATUS | REGISTER | LOGIN | LOGOUT | ME | REG-GET/PUT | 【R20】TOTP-VERIFY / RECOVER | 【R20】TOTP-STATUS / SETUP / CONFIRM | 【R20】TOTP-DISABLE | 【R20】PRIVACY-NOTICE | 【R20】PRIVACY-CONSENT |
|------|--------|----------|-------|--------|----|------------|------------------------------|------------------------------------|---------------------|-----------------------|------------------------|
| 访客 | ✓ | ✓（受开关+限流） | ✓（受限流） | ✓ | ✗ 401 | ✗ 401（未登录）/403 | ✓（持有效预登录凭据） | ✗ 401 | ✗ 401 | ✓ | ✗ 401 |
| 注册用户 | ✓ | ✓（已有账号再注册走同一开关） | ✓ | ✓ | ✓ | ✗ 403 'Admin access required' | ✓ | ✓ | ✓ | ✓ | ✓ |
| 管理员 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ 403（管理员不可关闭） | ✓ | ✓ |

数据权限：无 ownerId 维度（账号即身份本身）。管理接口数据权限 = 角色门槛（requireAuth+requireAdmin 双中间件，`server/routes/admin.js:38-39`；守卫测试 `server/routes/adminRoutes.test.js:120-125`）。【R20】两步验证接口只作用于当前登录账号，不接受指定账号的参数；预登录凭据只指向签发它的那个账号。

### 3.4 公共规范

**响应包络**：`{success:true, data}` / `{success:false, message}`；错误 message 为服务端单一事实源（英文）。【R20】失败包络可带可选的 `code` 字段（机器可判别原因，见下表），调用方据此分支，不解析 message。

**错误码语义表**（本模块全量；【R20】行为 v1.1 新增）：

| HTTP | 触发 | message | code | 锚点 |
|------|------|---------|------|------|
| 400 | 用户名格式不符 | `Username must be 3–32 characters: lowercase letters, numbers, underscore` | — | `server/lib/password.js:10-15` |
| 400 | 口令长度不符 | `Password must be 8–200 characters` | — | `server/lib/password.js:17-22` |
| 400 | 开关值非布尔 | `registrationOpen must be a boolean` | — | `server/routes/admin.js:78-81` |
| 401 | 登录凭证错误（不存在或口令错，统一） | `Invalid username or password` | — | `server/routes/auth.js:120-123` |
| 401 | 无有效会话访问 /me 或管理开关 | `Authentication required` | — | `server/routes/auth.js:151-154`；`server/lib/authMiddleware.js:36-49` |
| 403 | 注册关闭（且系统已有用户） | `Registration is closed` | — | `server/routes/auth.js:68-71` |
| 403 | 禁用账号登录 | `Account is disabled` | — | `server/routes/auth.js:124-127` |
| 403 | 非管理员访问注册开关 | `Admin access required` | — | `server/lib/authMiddleware.js:51-57` |
| 409 | 用户名已占用（归一后查重） | `Username already taken` | — | `server/routes/auth.js:82-86` |
| 429 | 限流命中（P-02 统一格式，含 Retry-After 头） | 限流器 JSON body | — | `server/lib/rateLimits.js:18-31` |
| 500 | 服务端异常 | error.message | — | `server/routes/auth.js:59-62` 等 |
| 【R20】400 | 注册未带同意 | `Privacy notice consent is required` | `PRIVACY_CONSENT_REQUIRED` | REGISTER |
| 【R20】409 | 所同意的说明版本不是当前版本（注册或确认） | `Privacy notice has been updated, please review and consent again` | `PRIVACY_NOTICE_UPDATED` | REGISTER、PRIVACY-CONSENT |
| 【R20】400 | 预登录凭据缺失、无效或过期 | `Verification session expired or invalid` | `TICKET_INVALID` | TOTP-VERIFY、TOTP-RECOVER |
| 【R20】400 | 动态口令不是 6 位数字 | `Verification code must be 6 digits` | — | TOTP-VERIFY、TOTP-CONFIRM |
| 【R20】400 | 恢复码格式不符 | `Recovery code must be 10 characters` | — | TOTP-RECOVER |
| 【R20】401 | 动态口令错误 | `Invalid verification code` | — | TOTP-VERIFY、TOTP-CONFIRM（两者响应都带 `data.attemptsRemaining`，且都计入该账号的尝试次数） |
| 【R20】401 | 恢复码错误或已用过 | `Invalid recovery code` | — | TOTP-RECOVER |
| 【R20】429 | 该账号 15 分钟内二次验证失败已达 5 次 | `Too many verification attempts, please try again later` | — | TOTP-VERIFY、TOTP-RECOVER、TOTP-CONFIRM（含 Retry-After） |
| 【R20】503 | 服务器未配置两步验证主密钥 | `Two-factor verification is unavailable` / `Two-factor authentication is not available on this server` | `TOTP_UNAVAILABLE` | LOGIN、TOTP-VERIFY、TOTP-STATUS 不报错（`available:false`）、TOTP-SETUP、TOTP-CONFIRM |
| 【R20】400 | 需要密码证明而未提供 | `Password is required to change two-factor settings` | `PASSWORD_REQUIRED` | TOTP-SETUP、TOTP-DISABLE |
| 【R20】400 | 密码证明不正确 | `Password is incorrect` | — | TOTP-SETUP、TOTP-DISABLE |
| 【R20】400 | 没有待确认的绑定，或已超过 10 分钟 | `Setup session expired, start again` | `SETUP_EXPIRED` | TOTP-CONFIRM |
| 【R20】400 | 未启用两步验证时尝试关闭 | `Two-factor authentication is not enabled` | — | TOTP-DISABLE |
| 【R20】403 | 管理员尝试关闭两步验证 | `Administrators cannot disable two-factor authentication` | — | TOTP-DISABLE |
| 【R20】403 | 会话仍有待办步骤时访问未放行的接口 | `Additional steps are required before continuing` | `GATE_REQUIRED` | §3.5 |

【R20】状态码取舍：已登录情境下的「口令不对」「动态口令不对」用 400 或 401 而不用 403，是为了与既有前端行为对齐——axios 拦截器只对 401 做跳转，且这两类接口的调用带 `skipAuthRedirect`（S-01-account PageSpec §2）。前端不解析 message 做分支。

**枚举定义**（已登记入池 enum-pool.md，编号如下）：

| 枚举 | 池编号 | 值 | 说明 |
|------|-----|------|------|
| userRole | EP-IDENT-01 | `admin` / `user` | 账号角色；首用户必为 admin（`server/routes/auth.js:93`） |
| registrationSource | EP-IDENT-04 | `env` / `admin` | 注册开关当前生效来源（`server/routes/admin.js:49,58`） |
| accountLifecycle | EP-IDENT-03 | enabled / disabled | 账号启停二态（布尔字段 disabled，非独立枚举存储） |
| 【R20】loginStatus | EP-IDENT-08 | `ok` / `totp_required` | LOGIN 响应的 `data.status` |
| 【R20】authGate | EP-IDENT-07 | `privacy_consent` / `totp_enroll` | `pending` 数组与门控拒绝响应的元素，顺序固定 |
| 【R20】totpMethod | EP-IDENT-05 | `code` / `recovery_code` | 二次验证方式；写入审计事件 `totp_failed` |
| 【R20】totpChannel | EP-IDENT-06 | `self` / `forced_enrollment` / `admin` / `cli` | 绑定、解绑、重置的渠道；写入审计事件 |
| 【R20】consentChannel | EP-IDENT-09 | `register` / `login_gate` | 同意来自注册页还是确认页 |
| 【R20】loginFailureReason | EP-AUDIT-03 | `invalid_credentials` / `account_disabled` | 审计事件 `login_failed` 的原因 |
| 【R20】lng | EP-I18N-01 | `en` / `fr-CA` / `zh-Hans` | PRIVACY-NOTICE 的 `lng` 参数与响应字段 |

**配置项**：ALLOW_REGISTRATION、SESSION_COOKIE_NAME、SESSION_TTL_MS、COOKIE_SAMESITE、COOKIE_SECURE、AUTH_LOGIN_RATE_WINDOW_MS/MAX、AUTH_REGISTER_RATE_WINDOW_MS/MAX（`server/.env.example`）。【R20】新增：

| 配置项 | 必填 | 默认 | 未配置时的行为 |
|--------|------|------|---------------|
| TOTP_SECRET_KEY | 启用两步验证必填 | 无 | 启动时 `console.error` 报错；TOTP-SETUP、TOTP-CONFIRM 返回 503；已启用账号登录时在口令通过后得到 503（不退回仅口令）；`pending` 不含 `totp_enroll`（管理员的强制绑定暂不生效）；TOTP-STATUS 返回 `available:false`，管理后台据此显示提示 |
| TOTP_ATTEMPT_RATE_WINDOW_MS | 否 | 900000 | 用默认值 |
| TOTP_ATTEMPT_RATE_MAX | 否 | 5 | 用默认值 |
| PRIVACY_RATE_WINDOW_MS | 否 | 60000 | 用默认值 |
| PRIVACY_RATE_MAX | 否 | 60 | 用默认值 |

主密钥的校验规则：base64 解码后必须恰好 32 字节，否则视同未配置。服务启动时校验一次并缓存结果。

### 3.5 【R20】登录后门控（enforceGates）

**待办步骤的派生**（`pendingGates(userDoc)`，`server/lib/authGates.js`）：

| 顺序 | 步骤 | 触发条件 | 完成条件 |
|------|------|---------|---------|
| 1 | `privacy_consent` | `userDoc.privacy?.version !== PRIVACY_NOTICE_VERSION` | PRIVACY-CONSENT 成功（或注册时已带同意） |
| 2 | `totp_enroll` | `userDoc.role === 'admin'` 且 `userDoc.totp?.enabled !== true` 且服务已配置主密钥 | TOTP-CONFIRM 成功 |

- 每次请求派生，不落库。`/me` 与登录类成功响应里的 `pending` 即此数组；为空表示可以直接使用。
- 步骤 1 先于步骤 2：确认隐私说明之后才做绑定，绑定事件的审计才有记录 IP 的依据。这条顺序由接口层保证：账号仍欠 `privacy_consent` 时，两个绑定接口与其余业务接口一样被门控拒绝（403 GATE_REQUIRED），不会因为带了正确密码而放行。

**中间件**：`enforceGates` 在 `attachUser` 之后、所有业务路由之前挂载。

```
放行清单（其余 /api/* 一律受门控约束）：
  POST /api/auth/logout
  GET  /api/auth/me
  GET  /api/auth/totp/status
  GET  /api/privacy/notices/current      （匿名接口，本身不受门控影响，列出以示完整）
  POST /api/privacy/consent/accept
  以下两项仅在账号不再欠 privacy_consent 时放行（步骤有先后）：
  POST /api/auth/totp/setup
  POST /api/auth/totp/confirm
```

判定：请求带有会话（`req.user` 存在）、`pending.length > 0`、且不在放行清单内（`totp/setup`、`totp/confirm` 两项另以不欠 `privacy_consent` 为条件）→ 403 `{success:false, code:'GATE_REQUIRED', message:'Additional steps are required before continuing', gates:[...]}`。没有会话的请求不受影响，仍按各自规则得到 401、403 或正常响应。

**对存量会话的含义**：部署不销毁任何会话。已登录用户下一次请求（加载新前端时调用 `/me`）即得到 `pending`，前端据此进入引导页（S-01-account PageSpec §4）。

## 4. 聚合根详细设计

### 4.1 领域模型

**管理模式声明**：MIXED——账号本体自管（注册/登录驱动写入）；注册开关设置托管（D-02 单例存储，管理台写入，本模块运行时读取）。二者不共表：托管数据在 app_settings，权限管控以 requireAdmin 替代模式字段（Step 2.3 规约）。

**表结构组合**（MongoDB，无关系外键）：

users（聚合根存储）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| _id | ObjectId | — | 即 publicUser.id（字符串化后为全域 ownerId） |
| username | string | 归一（trim+小写）后唯一（唯一索引 `server/index.js:104`） | `^[a-z0-9_]{3,32}$`（`server/lib/password.js:3`） |
| passwordHash | string | bcrypt cost=12 | 不出域，任何响应不返回 |
| role | string | userRole 枚举 | 首用户 admin，其余 user |
| disabled | boolean | 缺省 false（写入时显式 false） | 禁用即拒登（中间件层 `server/lib/authMiddleware.js:20-22`） |
| createdAt | number | epoch-ms | 审计 |
| 【R20】totp | object（可选） | 见下表 | 两步验证凭据；不存在即未绑定 |
| 【R20】privacy | object（可选） | `{version: string, consentedAt: Date}` | 隐私说明同意记录；不存在即从未同意 |

【R20】`users.totp` 子文档：

| 字段 | 类型 | 说明 |
|------|------|------|
| enabled | `true` | 已启用 |
| secretEnc | string | 密钥的 AES-256-GCM 密文（base64url，20 字节明文对应 20 字节密文） |
| iv | string | 本次加密的 12 字节随机初始向量（base64url） |
| authTag | string | 16 字节认证标签（base64url） |
| boundAt | Date | 最近一次绑定确认成功的时间 |
| lastUsedStep | number | 最近一次成功使用的 TOTP 时间步；防重放 |
| recoveryCodeHashes | string[] | 未使用的恢复码散列（SHA-256 hex）；用一个少一个；无重复 |
| pending | object（可选） | 待确认的绑定 `{secretEnc, iv, authTag, expiresAt}`；确认成功后整体被新的启用态替换，过期后由下一次 TOTP-SETUP 覆盖 |

- 加密的认证数据（AAD）为字符串 `totp:<账号 id>`。密文换到别的账号上解密必失败。
- 明文密钥只出现在 TOTP-SETUP 的响应里，明文恢复码只出现在 TOTP-CONFIRM 的响应里；都不写日志、不落库。
- 字段名不以 `Id` 结尾且不存放 24 位 hex 字符串，备份脚本的 `reviveDeep` 不会误改它们。

sessions（域内实体存储）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| tokenHash | string | SHA-256 hex，唯一索引（`server/index.js:105`） | 明文令牌不落库 |
| userId | ObjectId | — | N:1 账号 |
| createdAt / expiresAt | Date | expiresAt TTL 索引（`server/index.js:106`） | TTL 默认 30 天；【R20】`createdAt` 另用于「近期密码证明」判定 |

app_settings 注册开关单例（托管，存储属 D-02）：

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 固定 `'registration'`（REGISTRATION_SETTING_ID，`server/lib/authPolicy.js:4`） |
| registrationOpen | boolean | 管理台写入值 |
| updatedAt | number | epoch-ms |
| updatedBy | string\|null | 最后修改管理员用户名（`server/routes/admin.js:82-88`） |

【R20】预登录凭据（进程内存，不落库）：`Map<ticketHash, {userId, expiresAt}>`。`ticketHash` 是凭据明文的 SHA-256；凭据明文为 32 字节随机数的 hex，只在 LOGIN 的响应里出现一次。懒清理：每次签发或消费时顺带移除已过期的条目。进程重启即清空，用户回到口令步骤重新登录即可。

**领域对象及角色**：账号=聚合根；登录会话=域内实体（独立标识 tokenHash，生命周期依附账号）；注册开关设置=关联领域对象（1.4）；【R20】两步验证凭据与同意记录=账号聚合内的值对象（整体替换）。

**不变量**：

| # | 不变量 | 强制点 |
|---|--------|--------|
| I1 | username 归一后全域唯一 | 唯一索引 + 预查重 409（`server/routes/auth.js:82-86`） |
| I2 | role ∈ {admin, user}；系统无用户时新注册必为 admin | `server/routes/auth.js:88-96` |
| I3 | 口令仅以 bcrypt(12) 散列存在 | `server/lib/password.js:24-26` |
| I4 | 禁用账号不产生/不恢复登录态 | 登录 403（`auth.js:124-127`）+ 中间件拒载（`authMiddleware.js:20-22`） |
| I5 | 会话校验先验过期再验用户存在与启用 | `server/lib/authMiddleware.js:11-22` |
| I6 | 开关判定优先级：userCount=0 恒开 > adminSetting!==undefined 取布尔 > env 布尔 | `server/lib/authPolicy.js:11-23` |
| 【R20】I7 | `totp.enabled` 为 true 时 `secretEnc`、`iv`、`authTag`、`boundAt` 齐全；明文密钥不出现在任何存储或日志中 | TOTP-CONFIRM 的写入结构；TOTP-SETUP、TOTP-CONFIRM 的响应不记日志 |
| 【R20】I8 | 服务未配置有效主密钥时，不写入任何 `totp` 字段，不签发预登录凭据 | TOTP-SETUP、TOTP-CONFIRM 先判 `totpReady`；LOGIN 在签发凭据前判 |
| 【R20】I9 | 每个恢复码至多成功使用一次 | `recoveryCodeHashes` 无重复；使用走条件 `$pull`，修改数为 0 即失败 |
| 【R20】I10 | 同一时间步的动态口令至多成功一次；`lastUsedStep` 单调不减 | TOTP-VERIFY 的条件更新（修改数为 0 即失败） |
| 【R20】I11 | 管理员账号不会经本模块被解绑 | TOTP-DISABLE 对 `role='admin'` 返回 403 |
| 【R20】I12 | 二次验证完成之前不存在该次登录的会话 | LOGIN 对已启用账号不调用 `createSession`；只有 TOTP-VERIFY、TOTP-RECOVER 成功后才调用 |
| 【R20】I13 | 同意记录只表示「同意过某个版本」；是否有效只看版本是否等于当前版本 | `pendingGates` 与 `consentOf` 用同一比较 |

**领域服务**：

| 服务 | 文件 | 职责 |
|------|------|------|
| password | `server/lib/password.js` | normalizeUsername / validateUsername / validatePassword / hashPassword / verifyPassword |
| authPolicy | `server/lib/authPolicy.js` | isRegistrationOpen / parseAllowRegistration / publicUser / resolveOwnerId / canAccessConfig / REGISTRATION_SETTING_ID |
| session | `server/lib/session.js` | generateSessionToken / hashSessionToken / getCookieOptions / createSession / destroySession / destroyUserSessions |
| authMiddleware | `server/lib/authMiddleware.js` | attachUser / requireAuth / requireAdmin / loadUserFromRequest |
| 【R20】totp | `server/lib/totp.js` | generateSecret / toBase32 / hotp / findMatchingStep / buildOtpauthUri / generateRecoveryCodes / hashRecoveryCode / normalizeRecoveryCode |
| 【R20】totpCrypto | `server/lib/totpCrypto.js` | isTotpReady / encryptSecret(userId, secret) → {iv, secretEnc, authTag} / decryptSecret(userId, enc) → Buffer |
| 【R20】preloginTickets | `server/lib/preloginTickets.js` | issue(userId) → ticket / resolve(ticket) → userId 或 null / revoke(ticket) |
| 【R20】authGates | `server/lib/authGates.js` | pendingGates(userDoc) / enforceGates 中间件 |
| 【R20】privacyNotices | `server/lib/privacyNotices.js` | PRIVACY_NOTICE_VERSION / getNotice(lng) / SUPPORTED_LNGS |
| 【R20】auditLog（属 P-04） | `server/lib/auditLog.js` | recordAudit / consentOf |

**业务常量**：USERNAME_RE=`^[a-z0-9_]{3,32}$`；BCRYPT_ROUNDS=12；SESSION_TTL_MS 默认 30 天；口令 8–200 字符。【R20】新增：

| 常量 | 值 | 说明 |
|------|-----|------|
| TOTP_STEP_SECONDS | 30 | RFC 6238 步长 |
| TOTP_DIGITS | 6 | 口令位数 |
| TOTP_WINDOW_STEPS | 1 | 允许前后各一步 |
| TOTP_SECRET_BYTES | 20 | 密钥长度（160 位）；Base32 编码后 32 字符 |
| OTPAUTH_ISSUER | `Debate Timer` | otpauth 链接里的 issuer 与标签前缀 |
| TICKET_TTL_MS | 300000 | 预登录凭据有效期 |
| PENDING_ENROLL_TTL_MS | 600000 | 待确认绑定的有效期 |
| RECENT_PASSWORD_WINDOW_MS | 600000 | 近期密码证明窗口 |
| RECOVERY_CODE_COUNT | 10 | 恢复码个数 |
| RECOVERY_CODE_LENGTH | 10 | 每个恢复码的字符数 |
| RECOVERY_ALPHABET | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` | 32 字符，去掉 0、O、1、I |
| MAX_TICKETS | 10000 | 预登录凭据表上限；超过时先清过期项，仍超过则移除最早到期的 |

标签池：无（本模块无标签体系）。

### 4.2 状态模型

无多状态业务单据（主数据类的数据生命周期即账号启用/禁用二态，禁用侧写操作归 D-01）：

```
账号: enabled --D-01 禁用--> disabled --D-01 恢复--> enabled
      （disabled 期间: 登录 403;既有会话被 D-01 批量销毁,attachUser 拒载）
```

注册开关来源态（运行时判定，非存储状态机）：

```
未设置(source=env) --REG-PUT--> 已设置(source=admin)
已设置 --再次 REG-PUT--> 已设置(覆盖值;本版本无清除操作)
判定优先级恒为: userCount=0 恒开 > 存储值 > env
```

无驳回/撤回、无状态历史（开关单例仅存最后一次 updatedAt/updatedBy，PRD §11 如实记录）。

【R20】登录流程（v1.1 新增）：

```
口令步骤 ──口令错误──────────────→ 结束（401；审计 login_failed）
         ──账号已禁用────────────→ 结束（403；审计 login_failed）
         ──未启用两步验证────────→ 会话已建立
         ──已启用两步验证────────→ 二次验证步骤（预登录凭据 5 分钟）
                                      ──动态口令或恢复码正确──→ 会话已建立
                                      ──错误（15 分钟内 <5 次）→ 停留（401）
                                      ──第 5 次失败────────────→ 结束（429）
                                      ──凭据过期────────────────→ 结束（400）

会话已建立 → pending = [privacy_consent?, totp_enroll?] → pending 为空 → 正常使用
```

【R20】两步验证绑定状态（v1.1 新增）：

```
未绑定 ──TOTP-CONFIRM（self / forced_enrollment）──→ 已启用
已启用 ──TOTP-SETUP + TOTP-CONFIRM（rebind）──→ 已启用（新密钥、新恢复码）
已启用 ──TOTP-DISABLE（仅普通用户）／D-01 A7 重置／服务器脚本重置──→ 未绑定
```

触发角色：绑定、重新绑定、关闭=账号本人（关闭仅普通用户）；重置=管理员或服务器脚本。

### 4.3 子流程设计

v1.0 结论：无独立生命周期的过程。首用户注册时的遗留模板迁移为附带动作而非子流程——无独立 I/O 契约，失败静默不阻塞注册（`server/routes/auth.js:98-103`）。

【R20】v1.1 新增两个子流程：

| 子流程 | 触发条件 | 输入 | 输出 | 输出写入 |
|--------|---------|------|------|---------|
| 登录（含二次验证） | 已启用两步验证的账号口令通过 | 预登录凭据 + 动态口令或恢复码 | 登录会话 | sessions 集合（insertOne）；内存凭据表（移除）；恢复码走 `$pull`；动态口令走 `lastUsedStep` 条件更新 |
| 两步验证绑定 | 用户开始绑定，或管理员进入强制引导 | 口令证明 → 待确认密钥 → 一次动态口令 | 已启用的 `totp` 子文档、10 个恢复码明文（仅一次） | users 集合（`totp` 整体替换） |

### 4.4 接口设计

**接口清单**：

| # | 编码 | 方法 | 路径 | 鉴权 | 用户类型 | 限流 | 说明 |
|---|------|------|------|------|---------|------|------|
| 1 | STATUS | GET | `/api/auth/status` | 匿名 | 访客+全部 | 不限 | 注册状态查询 |
| 2 | REGISTER | POST | `/api/auth/register` | 匿名 | 访客 | 10 次/60min/IP | 注册并自动登录【v1.1 变更】 |
| 3 | LOGIN | POST | `/api/auth/login` | 匿名 | 访客/注册用户/管理员 | 20 次/15min/IP | 登录【v1.1 变更】 |
| 4 | LOGOUT | POST | `/api/auth/logout` | Cookie 可选 | 全部 | 不限 | 退出并销毁会话 |
| 5 | ME | GET | `/api/auth/me` | 会话 | 注册用户/管理员 | 不限 | 当前登录用户【v1.1 变更】 |
| 6 | REG-GET | GET | `/api/admin/settings/registration` | requireAuth+requireAdmin | 管理员 | 无 | 读注册开关（来源语义） |
| 7 | REG-PUT | PUT | `/api/admin/settings/registration` | requireAuth+requireAdmin | 管理员 | 无 | 写注册开关 |
| 【R20】8 | TOTP-VERIFY | POST | `/api/auth/totp/verify` | 匿名，持预登录凭据 | 访客/注册用户/管理员 | 每账号 5 次失败/15min | 二次验证：动态口令 |
| 【R20】9 | TOTP-RECOVER | POST | `/api/auth/totp/recover` | 匿名，持预登录凭据 | 同上 | 同上（与 VERIFY 共用计数） | 二次验证：恢复码 |
| 【R20】10 | TOTP-STATUS | GET | `/api/auth/totp/status` | 会话（门控放行） | 注册用户/管理员 | 不限 | 两步验证状态 |
| 【R20】11 | TOTP-SETUP | POST | `/api/auth/totp/setup` | 会话（门控放行） | 注册用户/管理员 | 不限 | 开始绑定或重新绑定 |
| 【R20】12 | TOTP-CONFIRM | POST | `/api/auth/totp/confirm` | 会话（门控放行） | 注册用户/管理员 | 每账号 5 次失败/15min（与 VERIFY、RECOVER 共用计数） | 输入一次动态口令确认绑定 |
| 【R20】13 | TOTP-DISABLE | POST | `/api/auth/totp/disable` | 会话 | 仅注册用户（非管理员） | 不限 | 关闭两步验证 |
| 【R20】14 | PRIVACY-NOTICE | GET | `/api/privacy/notices/current` | 匿名 | 访客+全部 | 60 次/min/IP | 读取当前版本隐私说明 |
| 【R20】15 | PRIVACY-CONSENT | POST | `/api/privacy/consent/accept` | 会话（门控放行） | 注册用户/管理员 | 不限 | 确认当前版本隐私说明 |

动作接口：无独立动作子资源（register/login/logout 与 totp 下的各操作即动作）。
服务依赖清单：users/sessions/appSettings 集合、password/authPolicy/session/rateLimits/migrateLegacyConfigurations 组件（§3.2）；【R20】totp、totpCrypto、preloginTickets、authGates、privacyNotices、auditLog。
工作流回调：无（无审批）。
MQ 事件：无。标签重建：无。

**接口详情**：

#### STATUS — GET /api/auth/status

- 请求：无参数、无请求体；匿名。
- 处理：`registrationState()` 一次快照（countDocuments + 单例读取）。
- 响应 200：

```json
{ "success": true, "data": { "hasUsers": true, "registrationOpen": false } }
```

- 语义：`hasUsers=false` 时 `registrationOpen` 恒为 true（I6 优先级 1）；前端据此驱动登录页形态与首用户引导。500 仅数据库异常。
- 锚点：`server/routes/auth.js:56-63`。

#### REGISTER — POST /api/auth/register

- 请求体：`{ "username": string, "password": string, "agree": boolean, "privacyVersion": string }`。【R20】后两个字段 v1.1 起必填。
- 处理顺序（每步失败即返回）：①开关判定（403）→ ②【R20】同意校验 → ③格式校验（400）→ ④查重（409）→ ⑤建号（首用户 admin）→ ⑥首用户附带迁移 → ⑦【R20】审计 → ⑧签发会话。注意限流中间件先于处理器，注册关闭期间请求仍计数（测试锚点 `server/routes/authRoutes.test.js:175`）。
- 【R20】同意校验（②）：
  - `agree !== true` → 400 `Privacy notice consent is required`，code `PRIVACY_CONSENT_REQUIRED`；
  - `privacyVersion !== PRIVACY_NOTICE_VERSION` → 409 `Privacy notice has been updated, please review and consent again`，code `PRIVACY_NOTICE_UPDATED`。前端收到后重新拉取说明全文；
  - 两项都通过才继续。
- 【R20】建号文档在 v1.0 字段之外增加 `privacy: {version: privacyVersion, consentedAt: new Date()}`。
- 【R20】审计（⑦）：先写 `registered`（detail `{role}`，consent `consented`），再写 `privacy_consented`（detail `{version, channel:'register'}`，consent `consented`）。两步都在签发会话之前 `await`；任一失败则 500，此时账号已建成但没有会话，用户可直接登录。
- 响应 201 + Set-Cookie（dt_session）：

```json
{ "success": true, "data": { "status": "ok", "id": "…24-hex…", "username": "alice", "role": "user", "pending": [] } }
```

- `status` 与 `pending` 为 v1.1 新增字段（旧客户端忽略它们，仍读取 id、username、role）。全新部署的首个账号 `role` 为 `admin`，在已配置主密钥的服务器上其 `pending` 为 `["totp_enroll"]`。
- 错误：403 `Registration is closed`；【R20】400 与 409（同意校验）；400 用户名/口令格式（§3.4 表）；409 `Username already taken`；429 限流；500。
- 锚点：`server/routes/auth.js:65-113`。

#### LOGIN — POST /api/auth/login

- 请求体：`{ "username": string, "password": string }`（v1.1 不变）。
- 处理：归一后查用户 → verifyPassword → 【R20】审计 `login_failed`（不存在与口令错统一 401）→ disabled 检查（403，【R20】并审计）→ 【R20】分支：
  - 账号未启用两步验证：签发会话 → 审计 `login_succeeded` → 立即会话响应；
  - 账号已启用两步验证：**不签发会话**，签发预登录凭据 → 二次验证挑战响应；
  - 账号已启用但服务未配置主密钥：503。
- 【R20】审计细则：
  - 口令错误：`login_failed`，`reason: 'invalid_credentials'`，actor 为空，所涉账号为被尝试的账号（存在时），consent `anonymous_attempt`（记 IP）；被尝试的用户名不存在且符合用户名格式时，`detail.attemptedUsername` 记录该用户名，否则不写该键。
  - 账号禁用：`login_failed`，`reason: 'account_disabled'`，consent 取 `consentOf(user)`。
- 响应一（会话已建立）200 + Set-Cookie：

```json
{ "success": true, "data": { "status": "ok", "id": "…24-hex…", "username": "alice", "role": "user", "pending": [] } }
```

- 响应二（【R20】需要二次验证）200，**无 Set-Cookie**：

```json
{ "success": true, "data": { "status": "totp_required", "ticket": "…64-hex…", "expiresIn": 300 } }
```

- 【R20】对旧客户端的含义：旧前端不认识 `status`，会把挑战响应当成已登录并跳转，随后因没有会话被弹回登录页。这只发生在「已启用两步验证的账号 + 旧前端」的组合下，而启用两步验证必须经由新前端，因此只在 Service Worker 尚未更新的短时间内出现。
- 错误：401 `Invalid username or password`；403 `Account is disabled`；【R20】503（code `TOTP_UNAVAILABLE`）；429（第 21 次起，`server/routes/authRoutes.test.js:131`）；500。
- 锚点：`server/routes/auth.js:115-136`。

#### LOGOUT — POST /api/auth/logout

- 请求：无请求体；Cookie 中的会话令牌（可缺失）。
- 处理：删除服务端会话记录 + `clearCookie`（maxAge:0）。未登录调用同样安全返回（token 缺失时 destroySession 直接返回，`server/lib/session.js:42-47`）。
- 响应 200：`{ "success": true }`（无 data 字段）。
- 锚点：`server/routes/auth.js:138-147`。

#### ME — GET /api/auth/me

- 请求：无参数；依赖全局 attachUser 已恢复的 `req.user`。
- 响应 200：

```json
{ "success": true, "data": { "status": "ok", "id": "…", "username": "alice", "role": "user", "pending": [] } }
```

- 【R20】`status` 与 `pending` 为 v1.1 新增字段；结构与会话已建立的 LOGIN 响应一致（统称「会话用户」）。`publicUser()` 本身仍是三字段，这两个字段在路由层追加。
- 错误：401 `Authentication required`（Cookie 缺失/过期/账号被禁用均表现为无 user）。
- 锚点：`server/routes/auth.js:149-160`。

#### REG-GET — GET /api/admin/settings/registration

- 鉴权：requireAuth+requireAdmin（401 未登录 → `Authentication required`；403 非管理员 → `Admin access required`）。
- 来源语义（本接口核心）：返回值 `source` 区分当前生效来源——`env`（从未有管理台写入，`registrationOpen` 即 env 回落值）｜`admin`（管理台已写入，`registrationOpen` 即存储值）；`envDefault` 恒返回 env 回落值供对照；`updatedAt/updatedBy` 为最后一次管理台写入审计（未写入时 null）。首用户短路（userCount=0 恒开）是运行时语义，**不**体现在本接口返回值中（`server/routes/admin.js:41-44` 注释原义）。
- 响应 200：

```json
{ "success": true, "data": { "registrationOpen": false, "source": "admin", "envDefault": false, "updatedAt": 1762800000000, "updatedBy": "alice" } }
```

- 锚点：`server/routes/admin.js:65-74`（GET）、`45-63`（payload 组装）。

#### REG-PUT — PUT /api/admin/settings/registration

- 请求体：`{ "registrationOpen": boolean }`（非布尔 → 400 `registrationOpen must be a boolean`，`server/routes/admin.js:78-81`；测试锚点 `adminRoutes.test.js:155-161`）。
- 处理：upsert 单例（`$set: {registrationOpen, updatedAt, updatedBy}`），`updatedBy` 取当前管理员用户名。
- 【R20】审计：写入成功后，若存储值发生了变化，写 `registration_setting_changed`（detail `{from, to}`；首次写入时 `from` 为 null；consent 取 `consentOf(管理员)`）。同值重写不产生事件。
- 响应 200：结构同 REG-GET，恒 `source:'admin'`。
- 错误：400 / 401 / 403 / 500。无 404（upsert 语义）。
- 锚点：`server/routes/admin.js:76-102`。

#### 【R20】TOTP-STATUS — GET /api/auth/totp/status

- 鉴权：requireAuth；门控放行。
- 响应 200：

```json
{ "success": true, "data": {
  "available": true, "enabled": false, "enforced": false,
  "needsPassword": true, "recoveryCodesRemaining": null } }
```

| 字段 | 含义 |
|------|------|
| `available` | 服务是否配置了有效主密钥 |
| `enabled` | 当前账号是否已启用两步验证 |
| `enforced` | 当前账号是否为管理员（必须绑定且不可关闭） |
| `needsPassword` | 当前会话是否超出「近期密码证明」窗口（成立时 TOTP-SETUP 须带 `password`） |
| `recoveryCodesRemaining` | 未使用的恢复码数量；未启用时为 null |

- 用途：设置页「两步验证」卡渲染状态；管理员后台据 `available` 显示「服务器未配置两步验证密钥」的提示。
- 错误：401；500。

#### 【R20】TOTP-SETUP — POST /api/auth/totp/setup

- 鉴权：requireAuth；门控放行。
- 请求体：`{ "password"?: string }`。
- 处理顺序：
  1. 服务未配置有效主密钥 → 503 `Two-factor authentication is not available on this server`（code `TOTP_UNAVAILABLE`）。
  2. 密码证明：当前会话创建于 `RECENT_PASSWORD_WINDOW_MS`（10 分钟）之内则免输；否则必须提供 `password`——未提供 400（code `PASSWORD_REQUIRED`），不正确 400 `Password is incorrect`。
  3. 生成新密钥（20 字节随机），以账号 id 作认证数据加密，写入 `users.totp.pending = {secretEnc, iv, authTag, expiresAt}`（`$set`，覆盖上一次待确认的绑定）。此步不改变 `totp.enabled` 与已启用的密钥。
  4. 组装 otpauth 链接：`otpauth://totp/Debate%20Timer:<username>?secret=<Base32>&issuer=Debate%20Timer&algorithm=SHA1&digits=6&period=30`（用户名经 `encodeURIComponent`；用户名本身只含 `[a-z0-9_]`）。
- 响应 200（`Cache-Control: no-store`）：

```json
{ "success": true, "data": {
  "otpauthUri": "otpauth://totp/Debate%20Timer:alice?secret=JBSWY3DPEHPK3PXP…&issuer=Debate%20Timer&algorithm=SHA1&digits=6&period=30",
  "secret": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  "expiresIn": 600 } }
```

- `secret` 为不带空格的 Base32（32 字符）；前端分组显示为 8 组 4 字符供手动输入，并用 `otpauthUri` 在本地生成二维码。
- 不产生审计事件（此步没有改变任何已生效的安全设置）。
- 服务端不得把本响应体写入任何日志。
- 错误：400（`PASSWORD_REQUIRED`、密码不正确）；401；503；500。

#### 【R20】TOTP-CONFIRM — POST /api/auth/totp/confirm

- 鉴权：requireAuth；门控放行。
- 请求体：`{ "code": string }`（6 位数字，否则 400）。
- 处理顺序：
  1. 服务未配置有效主密钥 → 503。
  2. `totp.pending` 不存在或已过期 → 400 `Setup session expired, start again`（code `SETUP_EXPIRED`）。
  3. `code` 不是 6 位数字 → 400 `Verification code must be 6 digits`（不计入尝试次数）。
  4. 该账号在尝试限流窗口内的失败数已达上限 → 429（带 `Retry-After`）；此时不论 `code` 是否正确。
  5. 解密待确认密钥，在当前时间步前后各一步内校验 `code`。不匹配 → 审计 `totp_failed`（detail `{ method: 'code' }`，actor 与 subject 均为本人，consent 取 `consentOf(user)`）→ 该账号的失败计数加一：达到上限 → 429（带 `Retry-After`）；未达上限 → 401 `Invalid verification code`，响应带 `data: { attemptsRemaining }`。
  6. 条件更新：`updateOne({ _id, 'totp.pending.secretEnc': <待确认密文> }, { $set: { totp: { enabled: true, secretEnc, iv, authTag, boundAt, lastUsedStep: <匹配的时间步>, recoveryCodeHashes } } })`。`$set` 整个 `totp`，待确认项随之消失。修改数为 0（待确认项已被另一次 TOTP-SETUP 替换）→ 400 `SETUP_EXPIRED`。
  7. 该账号的失败计数清零。
  8. 生成 10 个恢复码：每个从 `RECOVERY_ALPHABET` 取 10 个字符；库中只存 SHA-256 hex；明文只在本次响应返回。
  9. 销毁该账号除当前会话外的全部会话（`sessions.deleteMany({ userId, tokenHash: { $ne: 当前会话 } })`）。
  10. 审计 `totp_bound`：detail `{ channel, rebind, recoveryCodeCount: 10 }`。`channel` 在「管理员账号且此前未启用」时为 `forced_enrollment`，否则为 `self`；`rebind` 为此前是否已启用。
- 响应 200（`Cache-Control: no-store`）：

```json
{ "success": true, "data": { "recoveryCodes": ["A1B2C-D3E4F", "…共 10 个…"] } }
```

- 恢复码以 `XXXXX-XXXXX` 形式返回，仅此一次。前端要求用户确认已保存后才允许离开。
- 强制绑定引导在此完成：响应之后该管理员账号的 `pending` 不再含 `totp_enroll`（若 `privacy_consent` 也已完成则为空）。前端随后重新调用 `/me`。
- 尝试限流：与 TOTP-VERIFY、TOTP-RECOVER 共用同一账号的失败计数（默认 15 分钟 5 次，`TOTP_ATTEMPT_RATE_*` 可调；EP-PROTECT-03）。三个接口任一失败都计入；本接口确认成功时清零该账号的计数。计数在进程内存，重启清零。
- 错误：400（格式不符、`SETUP_EXPIRED`）；401（带 `data.attemptsRemaining`）；429（带 `Retry-After`）；503；500。

#### 【R20】TOTP-DISABLE — POST /api/auth/totp/disable

- 鉴权：requireAuth。不在门控放行清单内。
- 请求体：`{ "password": string }`（必填，不论会话新旧）。
- 处理顺序：
  1. `role === 'admin'` → 403 `Administrators cannot disable two-factor authentication`（I11）。
  2. 未启用 → 400 `Two-factor authentication is not enabled`。
  3. 密码未提供 → 400（code `PASSWORD_REQUIRED`）；不正确 → 400 `Password is incorrect`。
  4. `$unset: { totp: '' }`，整体移除两步验证凭据。
  5. 审计 `totp_unbound`（detail `{ channel: 'self' }`）。
- 响应 200：`{ "success": true, "data": { "enabled": false } }`。
- 会话处理：不移除任何会话。
- 错误：400；401；403；500。

#### 【R20】TOTP-VERIFY — POST /api/auth/totp/verify

- 鉴权：匿名；凭请求体中的预登录凭据定位账号。
- 请求体：`{ "ticket": string, "code": string }`。
- 处理顺序：
  1. 预登录凭据无效或过期 → 400 `Verification session expired or invalid`（code `TICKET_INVALID`）。
  2. `code` 去空格后不是 6 位数字 → 400 `Verification code must be 6 digits`。
  3. 尝试限流：该账号在窗口内的失败次数已达上限 → 429（带 `Retry-After`）。
  4. 服务未配置有效主密钥，或账号已不再启用两步验证 → 503 `Two-factor verification is unavailable`。
  5. 解密密钥，在当前时间步前后各一步内查找匹配且大于 `lastUsedStep` 的时间步；找不到 → 失败。
  6. 条件更新（I10）：`updateOne({ _id, 'totp.enabled': true, 'totp.secretEnc': <同一密文>, $or: [{ 'totp.lastUsedStep': { $exists: false } }, { 'totp.lastUsedStep': { $lt: step } }] }, { $set: { 'totp.lastUsedStep': step } })`。修改数为 1 → 成功；为 0 → 失败（同一个口令被重放，或并发提交中已有一次成功）。
  7. 成功：作废该凭据 → 清零该账号的失败计数 → 签发会话 → 审计 `totp_succeeded`、`login_succeeded` → 响应。
  8. 失败：失败计数加一 → 审计 `totp_failed`（detail `{ method: 'code' }`，consent `anonymous_attempt`）→ 计数未达上限返回 401，达到上限则作废凭据并返回 429。
- 响应 200 + Set-Cookie：会话用户结构（同 LOGIN 响应一）。
- 401 响应体带剩余次数：

```json
{ "success": false, "message": "Invalid verification code", "data": { "attemptsRemaining": 3 } }
```

- 429：`Retry-After` 取窗口内最早一次失败到窗口结束的秒数。窗口内即使重新走口令步骤拿到新凭据，仍会被第 3 步拦下。
- 错误：400；401；429；503；500。

#### 【R20】TOTP-RECOVER — POST /api/auth/totp/recover

- 鉴权、限流、凭据校验与 TOTP-VERIFY 相同；失败计数与 TOTP-VERIFY 共用。
- 请求体：`{ "ticket": string, "recoveryCode": string }`。归一：转大写并去掉字母数字以外的字符，须匹配 `^[A-Z0-9]{10}$`，否则 400 `Recovery code must be 10 characters`。
- 处理：`hash = SHA-256(归一后的码)`；条件更新 `updateOne({ _id, 'totp.recoveryCodeHashes': hash }, { $pull: { 'totp.recoveryCodeHashes': hash } })`。修改数为 1 → 成功；为 0 → 失败（错误或已用过）。
- 成功：作废凭据 → 清零失败计数 → 签发会话 → 审计 `recovery_code_used`（detail `{ remaining }`）、`login_succeeded` → 响应。
- 响应 200 + Set-Cookie：会话用户结构，另加一个字段：

```json
{ "success": true, "data": { "status": "ok", "id": "…", "username": "alice", "role": "user", "pending": [], "recoveryCodesRemaining": 4 } }
```

- `recoveryCodesRemaining` 为 0 时，前端提示恢复码已用完，建议重新绑定。
- 失败：审计 `totp_failed`（detail `{ method: 'recovery_code' }`）→ 401 `Invalid recovery code`（带 `data.attemptsRemaining`）；达到上限返回 429。
- 错误：400；401；429；503；500。

#### 【R20】PRIVACY-NOTICE — GET /api/privacy/notices/current

- 鉴权：匿名；挂载级按 IP 限流（60 次/分钟，`PRIVACY_RATE_*`）。
- 查询参数：`lng`，取值 `en`、`fr-CA`、`zh-Hans`。缺省或不在取值内时回落 `en`，不报错。
- 响应 200（`Cache-Control: no-store`）：

```json
{ "success": true, "data": {
  "version": "2026.11.1",
  "effectiveDate": "2026-11-24",
  "lng": "zh-Hans",
  "operator": { "name": "张心一", "contactEmail": "hi@tonyxyz.com" },
  "title": "隐私说明",
  "intro": "本说明介绍 Debate Match Timer（辩论赛计时器）收集哪些个人信息……",
  "sections": [
    { "heading": "一、我们收集的信息", "items": ["账号信息：……", "两步验证信息：……"] }
  ] } }
```

- `effectiveDate` 的取值在代码阶段按实际发布日填写（R20 §7.2）。
- 内容全部为纯文本，按 `sections[].items[]` 逐条渲染，不含 HTML。
- 正文、版本号、生效日期、运营者与联系方式都是 `server/lib/privacyNotices.js` 中的常量（D65）；`version` 即 PRIVACY-CONSENT 与 REGISTER 所对照的 `PRIVACY_NOTICE_VERSION`。
- 错误：429；500。

#### 【R20】PRIVACY-CONSENT — POST /api/privacy/consent/accept

- 鉴权：requireAuth；门控放行。
- 请求体：`{ "version": string }`。
- 处理：
  1. `version !== PRIVACY_NOTICE_VERSION` → 409 `Privacy notice has been updated, please review and consent again`（code `PRIVACY_NOTICE_UPDATED`）。前端收到后重新拉取说明。
  2. `users.updateOne({ _id }, { $set: { privacy: { version, consentedAt: new Date() } } })`。重复确认同一版本是幂等的，只刷新时间。
  3. 审计 `privacy_consented`（detail `{ version, channel: 'login_gate' }`，consent `consented`）。
- 响应 200：

```json
{ "success": true, "data": { "version": "2026.11.1", "consentedAt": 1763985600000, "pending": [] } }
```

- `pending` 为更新后的待办步骤；前端据此进入下一步或离开引导页。
- 错误：400（`version` 缺失或不是字符串）；401；409；500。

**跨接口复用规则**：「会话用户」结构（`{status:'ok', id, username, role, pending}`）为 REGISTER、LOGIN 响应一、ME、TOTP-VERIFY、TOTP-RECOVER 共用，由路由层在 `publicUser` 之上追加；错误包络与 401/403 语义由 authMiddleware 统一。【R20】`PRIVACY_NOTICE_UPDATED` 与 `GATE_REQUIRED` 两个 code 是跨接口复用的机器可判别原因。**服务方法规格**见 §4.1 领域服务表。**枚举定义**见 §3.4。

### 4.5 领域事件与集成

- 领域事件/MQ：无（单体 Express，无消息队列）。
- SSE：本模块不广播（用户删除由 D-01 广播 configurations change，见 S-02 §4.5）。
- 仓储契约：users/sessions/appSettings 三集合的直访（MongoDB 驱动，无仓储抽象层——如实记录，操作清单见 §5.2）。
- 关联域调用：D-01（禁用/改密 → destroyUserSessions，`server/routes/admin.js:202-204`；删除 → 级联删模板+广播，`server/routes/admin.js:233-236`）；反向：本模块注册时调用 migrateLegacyConfigurations 迁移遗留模板到首管理员名下。
- 【R20】审计事件（写入 P-04，是否记 IP 见 P-04 API §4.1.4）：REGISTER 写 `registered`、`privacy_consented`；LOGIN 写 `login_failed` 或 `login_succeeded`；TOTP-VERIFY 写 `totp_succeeded` 或 `totp_failed`、`login_succeeded`；TOTP-RECOVER 写 `recovery_code_used` 或 `totp_failed`、`login_succeeded`；TOTP-CONFIRM 写 `totp_bound`，口令不匹配时写 `totp_failed`（actor 与 subject 均为本人，consent 取 `consentOf(user)`）；TOTP-DISABLE 写 `totp_unbound`；PRIVACY-CONSENT 写 `privacy_consented`。登录被限流（429）不写事件。
- 【R20】备份：`users` 文档中的 `totp` 字段全部是密文与散列，由 `server/scripts/backup.js` 原样导出；主密钥不在备份内。

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 消费方 |
|------|--------|
| publicUser(user) → `{id, username, role}` | S-02/S-04 的 ownerId 语义、D-01 用户清单、全站登录态 |
| isRegistrationOpen / registrationState | 本模块 STATUS/REGISTER；管理台展示（REG-GET 不含首用户短路） |
| requireAuth / requireAdmin / attachUser | 全部业务路由（S-02/S-03 复制与下架/S-04/D-01） |
| createSession / destroySession / destroyUserSessions | 登录/注册/退出；D-01 治理动作 |
| 【R20】pendingGates / enforceGates | 全部 `/api/*` 路由（门控中间件） |
| 【R20】PRIVACY_NOTICE_VERSION / consentOf | P-04 审计写入器的 IP 策略；本模块 REGISTER、PRIVACY-CONSENT |
| 【R20】removeTotp(userId) | D-01 A7 与 `server/scripts/reset-totp.js` 共用的移除逻辑（`$unset: { totp: '' }` 加销毁该账号全部会话） |

### 5.2 集合操作清单

无 SQL（MongoDB）。集合操作清单：

| 集合 | 操作 | 位置 |
|------|------|------|
| users | countDocuments / findOne / insertOne | `server/routes/auth.js:40-45,82,90,105` |
| sessions | insertOne / deleteOne / deleteMany / findOne(tokenHash+expiresAt) | `server/lib/session.js:30-51`；`server/lib/authMiddleware.js:11-14` |
| app_settings | findOne(_id='registration') / updateOne(upsert) | `server/routes/auth.js:42-44`；`server/routes/admin.js:67-69,84-88` |
| 【R20】users | updateOne($set `totp.pending`) | TOTP-SETUP |
| 【R20】users | updateOne($set `totp`，条件 `totp.pending.secretEnc`) | TOTP-CONFIRM |
| 【R20】users | updateOne($set `totp.lastUsedStep`，条件单调) | TOTP-VERIFY |
| 【R20】users | updateOne($pull `totp.recoveryCodeHashes`，条件含该哈希) | TOTP-RECOVER |
| 【R20】users | updateOne($unset `totp`) | TOTP-DISABLE；D-01 A7；服务器脚本 |
| 【R20】users | updateOne($set `privacy`) | REGISTER（随 insertOne 写入）；PRIVACY-CONSENT |
| 【R20】sessions | deleteMany(userId 且 tokenHash 不等于当前会话) | TOTP-CONFIRM |
| 【R20】audit_logs | insertOne（经 P-04 的 `recordAudit`） | §4.5 列出的各写入点 |

### 5.3 DDL

无表结构 DDL（MongoDB schemaless）。索引（`server/index.js:104-106`）：

```js
users.createIndex({ username: 1 }, { unique: true })
sessions.createIndex({ tokenHash: 1 }, { unique: true })
sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

【R20】v1.1 不新增本模块的索引。

## 6. 更新记录

**变更类型词汇表**：`initial`=首次生成；`structural`=章节增删重组；`interface_added/changed/removed`=接口增删改；`rule_added/changed`=规则增删改；`enum_added`=枚举新增；`field_added`=字段新增；`state_added`=状态或流转新增；`event_added`=领域事件新增（其余词汇见引擎分册，本档暂未涉及）。

**版本号规则**：`vMAJOR.MINOR`，接口不兼容变更升 MAJOR。REGISTER 新增两个必填字段对旧客户端是不兼容变更，但旧客户端会收到明确的 400 提示且发布窗口很短，故按次版本登记。

| 版本 | 日期 | 变更类型 | 变更说明 | 目标节 |
|------|------|---------|---------|--------|
| v1.1 | 2026-11-24 | interface_added | 新增 8 个三段式接口：TOTP-VERIFY、TOTP-RECOVER、TOTP-STATUS、TOTP-SETUP、TOTP-CONFIRM、TOTP-DISABLE（`/api/auth/totp/*`）；PRIVACY-NOTICE、PRIVACY-CONSENT（`/api/privacy/*`） | §4.4 |
| v1.1 | 2026-11-24 | interface_changed | REGISTER 请求体新增必填 `agree`、`privacyVersion`，新增 400 与 409 两个同意校验错误；LOGIN 对已启用两步验证的账号改为返回二次验证挑战且不签发会话，新增 503；REGISTER、LOGIN、ME 的会话响应新增 `status`、`pending` | §4.4 |
| v1.1 | 2026-11-24 | field_added | users 新增可选子文档 `totp`（密文三件套、绑定时间、已用时间步、恢复码散列、待确认绑定）与 `privacy`（版本、时间） | §4.1 |
| v1.1 | 2026-11-24 | state_added | 登录流程（口令 → 二次验证 → 会话）、两步验证绑定状态（未绑定 / 已启用 / 重新绑定） | §4.2 |
| v1.1 | 2026-11-24 | rule_added | 设计决策 D8–D16；不变量 I7–I13；登录后门控与放行清单（新节 §3.5）；按账号的二次验证尝试限流；近期密码证明；失败包络的可选 `code` 字段；REG-PUT 的审计事件 | §1.3、§3.4、§3.5、§4.1 |
| v1.1 | 2026-11-24 | enum_added | EP-IDENT-05~09、EP-AUDIT-03（已入 enum-pool.md v1.2） | §3.4 |
| v1.1 | 2026-11-24 | event_added | 注册、登录、两步验证、隐私同意五类审计事件接入 P-04 | §4.5 |
| v1.1 | 2026-11-24 | rule_changed | 代码阶段修订（v1.1 尚未发布，就地修订）：TOTP-CONFIRM 纳入按账号的二次验证尝试限流，与 TOTP-VERIFY、TOTP-RECOVER 共用同一账号的失败计数；其 401 响应新增 `data.attemptsRemaining`，新增 429（带 `Retry-After`）；口令不匹配时写审计事件 `totp_failed`，确认成功时清零该账号的计数 | §1.3-D12、§3.2、§3.4、§4.4「TOTP-CONFIRM」、§4.5 |
| v1.1 | 2026-11-24 | rule_changed | 代码阶段修订（v1.1 尚未发布，就地修订）：「步骤 1 先于步骤 2」改由接口层保证。原放行清单对 TOTP-SETUP、TOTP-CONFIRM 无条件放行，账号仍欠 `privacy_consent` 时即可直接调用；现改为仅在不再欠 `privacy_consent` 时放行，否则与其余业务接口一样返回 403 GATE_REQUIRED。TOTP-STATUS 仍无条件放行（只读） | §3.5 |
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：7 接口（5 auth + 2 注册开关）含来源语义与 400/401/403/409/429 全错误码；三参开关判定、账号/会话/开关领域模型依现有实现成文 | — |

### 模板符合性自检记录（M1~M5）

| # | 项 | 结果 |
|---|----|------|
| M1 | 章节结构完整（1.x/2.x/3.x/4.x/5.x/6.x 🔒 全存在；第 2 章为裁剪标注） | ✅ v1.1 新增 §3.5，其余章节编号未变 |
| M2 | 接口路径三段式 | ⚠️ v1.0 部分如实标注：`/api/auth/register\|login\|logout\|status\|me` 为两段式，路径为已上线事实，逆向归档不改路径；`/api/admin/settings/registration` 为三段式。【R20】新增的 8 个接口全部三段式 ✅ |
| M3 | 枚举引用有定义 | ✅ userRole / registrationSource / accountLifecycle 及【R20】loginStatus / authGate / totpMethod / totpChannel / consentChannel / loginFailureReason / lng 均在 enum-pool.md v1.2 定义 |
| M4 | 占位符残留 | ✅ 无 |
| M5 | 变更记录含本次更新行 | ✅ §6 v1.1 共 8 行（含代码阶段修订 1 行） |
