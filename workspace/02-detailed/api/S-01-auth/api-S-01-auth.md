# S-01 账号与准入 API 设计

| 属性 | 值 |
|------|-----|
| 模块编码 | S-01（应用域：支撑业务域） |
| 文档性质 | 逆向归档：系统已上线，本文档如实反映现有实现（路径/状态码/错误文案均为现网事实，非理想化重设计） |
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 功能类型 | 主数据类（聚合根=账号，被 S-02/S-04/D-01 以 ownerId/userId 引用；生命周期=启用/禁用，无审批流） |
| 管理模式 | MIXED（账号本体自管：注册/登录驱动；注册开关设置为托管：存储属 D-02 app_settings 单例，本模块每次请求读取，写侧为管理台治理接口） |
| 上游依据 | S-01 PRD v1.0；BA v1.0 §2.1.1；AA v1.0 §2.2.1；FL v1.0 §2.1.2.1 / §2.2.1.1 / §2.3.1.1 / §2.4.1.1 |
| 实现锚点 | `server/routes/auth.js`、`server/routes/admin.js:41-102`（注册开关两接口）、`server/lib/authPolicy.js`、`server/lib/password.js`、`server/lib/session.js`、`server/lib/authMiddleware.js`、`server/lib/rateLimits.js`、`server/index.js:122,131`（挂载） |

## 1. 模块设计概述

### 1.1 业务背景及目标

系统全部业务资产（模板、比赛记录）按账号归属隔离，账号是全站操作的前提（BA 附录A「账号与准入 → 全部 L3」）。本模块解决「谁能进入系统」：

- 访客自行注册（注册关闭时收到 403 与关闭提示）；
- 已注册用户以用户名/口令登录，登录态经会话 Cookie 跨页面保持；
- 管理员经管理台开放/关闭公开注册（首个管理员账号不受开关影响）。

### 1.2 边界说明

| 方向 | 内容 |
|------|------|
| 做什么 | 注册、登录、退出、当前用户查询、注册状态查询；注册开关的管理侧读/写两接口（本表收录并详设，路由文件属治理面） |
| 不做什么 | 用户清单/禁用/角色/改密/删除（D-01 `server/routes/admin.js:112-241`）；app_settings 存储模式本身（D-02）；登录/注册端点的限流机制实现（P-02，本模块只挂载）；改密自助、验证码、OAuth、注册审批（PRD §3.2 不做） |
| 边界注记 | `GET/PUT /api/admin/settings/registration` 代码位于 `admin.js`（D-01/D-02 治理面路由文件），因业务语义属 S-01 注册准入控制（FL S-01-03），接口详设归本档；D-01 文档侧只作引用，不重复详设 |

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

逆向归档差异注记：S-01 PRD §8 表格中「管理台写开关 400 非布尔」与实现一致；PRD §6「无『清除回落 env』操作」与本档收录的 PUT 语义一致（无删除/清空端点，恢复 env 语义需手工删除 app_settings 文档，见 `server/.env.example` 注释）。

### 1.4 领域对象总览

| 对象 | 分类 | 说明 |
|------|------|------|
| 账号（用户） | 聚合根 | users 集合；`publicUser` 三字段对外表示（`server/lib/authPolicy.js:42-51`），其 id 即全域 ownerId |
| 登录会话 | 域内对象·实体 | sessions 集合；N:1 账号；随禁用/改密/删除被批量销毁（D-01 触发 `destroyUserSessions`） |
| 注册开关设置 | 关联领域对象（托管） | app_settings 单例 `_id='registration'`；存储属 D-02，本模块读（`registrationState`），写侧为本档 REG-PUT 接口 |
| 登录态（前端） | 过程数据（P2） | AuthContext 中 user/status 快照，派生自 /me 与 /status，不入领域 |

子流程：无（注册/登录/退出均为聚合根上直接操作，PRD 领域模型结论）。

### 1.5 上下文映射

| 外部上下文 | 关系 | 映射模式 |
|-----------|------|---------|
| D-02 系统配置（app_settings） | 读注册开关单例；REG-PUT 为其唯一写入口 | 遵奉者（直接读写标准单例） |
| D-01 权限与用户治理 | 消费 disabled/role 对登录的影响；禁用/改密/删除触发会话批量销毁 | 共享内核（users 集合同源） |
| S-02 / S-04 | 账号 id 作为 ownerId 落于模板/记录 | 共享内核（ownerId 语义全域一致） |
| P-02 接口防护 | login/register 挂载限流器，429+Retry-After | 遵奉者 |
| C-01~S-04 全部 L3 | 登录态是一切写操作前提（requireAuth） | 发布语言（401 'Authentication required' 统一契约） |

## 2. 跨聚合根设计（裁剪：不适用）

本模块单一聚合根（账号），无跨聚合根约束/编排。注册开关设置是 D-02 存储上的关联领域对象（见 1.4），不构成本域聚合根；其与本域的一致性由「共用 `registrationState()` 快照」这一读侧编排保证（1.3-D2），无独立不变量与跨根事务。

## 3. 应用/基础设施层设计

### 3.1 接口规范

- 前缀与挂载：`/api/auth`（`server/index.js:122`）；注册开关两接口挂载于 `/api/admin`（`server/index.js:131`）。
- 路径风格：现网为 `/domain/action` 两段式（如 `/api/auth/register`）与 `/domain/resource/action`（如 `/api/admin/settings/registration`）混用，如实归档；G1-08 三段式对照见 §6 自检记录。
- 方法语义：GET 只读；POST 触发动作（register/login/logout）；PUT 写单例设置。
- 请求体：`application/json`（全局 `express.json({limit:'1mb'})`，`server/index.js:45`）。
- 响应包络：成功 `{success:true, data?}`；失败 `{success:false, message}`（`server/routes/auth.js:58,61` 等；无 code 字段——code 仅 configurations 路由使用，见 S-02 §3.4）。
- 鉴权：全局 `attachUser` 由 Cookie 恢复 `req.user`（`server/lib/authMiddleware.js:27-34`）；会话 Cookie `dt_session` httpOnly（`server/lib/session.js:14-28`）。
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

### 3.3 权限模型

| 角色 | STATUS | REGISTER | LOGIN | LOGOUT | ME | REG-GET/PUT |
|------|--------|----------|-------|--------|----|----|
| 访客 | ✓ | ✓（受开关+限流） | ✓（受限流） | ✓ | ✗ 401 | ✗ 401（未登录）/403 |
| 注册用户 | ✓ | ✓（已有账号再注册走同一开关） | ✓ | ✓ | ✓ | ✗ 403 'Admin access required' |
| 管理员 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

数据权限：无 ownerId 维度（账号即身份本身）。管理接口数据权限 = 角色门槛（requireAuth+requireAdmin 双中间件，`server/routes/admin.js:38-39`；守卫测试 `server/routes/adminRoutes.test.js:120-125`）。

### 3.4 公共规范

**响应包络**：`{success:true, data}` / `{success:false, message}`；错误 message 为服务端单一事实源（英文）。

**错误码语义表**（本模块全量）：

| HTTP | 触发 | message | 锚点 |
|------|------|---------|------|
| 400 | 用户名格式不符 | `Username must be 3–32 characters: lowercase letters, numbers, underscore` | `server/lib/password.js:10-15` |
| 400 | 口令长度不符 | `Password must be 8–200 characters` | `server/lib/password.js:17-22` |
| 400 | 开关值非布尔 | `registrationOpen must be a boolean` | `server/routes/admin.js:78-81` |
| 401 | 登录凭证错误（不存在或口令错，统一） | `Invalid username or password` | `server/routes/auth.js:120-123` |
| 401 | 无有效会话访问 /me 或管理开关 | `Authentication required` | `server/routes/auth.js:151-154`；`server/lib/authMiddleware.js:36-49` |
| 403 | 注册关闭（且系统已有用户） | `Registration is closed` | `server/routes/auth.js:68-71` |
| 403 | 禁用账号登录 | `Account is disabled` | `server/routes/auth.js:124-127` |
| 403 | 非管理员访问注册开关 | `Admin access required` | `server/lib/authMiddleware.js:51-57` |
| 409 | 用户名已占用（归一后查重） | `Username already taken` | `server/routes/auth.js:82-86` |
| 429 | 限流命中（P-02 统一格式，含 Retry-After 头） | 限流器 JSON body | `server/lib/rateLimits.js:18-31` |
| 500 | 服务端异常 | error.message | `server/routes/auth.js:59-62` 等 |

**枚举定义**（已登记入池 enum-pool.md，编号如下）：

| 枚举 | 池编号 | 值 | 说明 |
|------|-----|------|------|
| userRole | EP-IDENT-01 | `admin` / `user` | 账号角色；首用户必为 admin（`server/routes/auth.js:93`） |
| registrationSource | EP-IDENT-04 | `env` / `admin` | 注册开关当前生效来源（`server/routes/admin.js:49,58`） |
| accountLifecycle | EP-IDENT-03 | enabled / disabled | 账号启停二态（布尔字段 disabled，非独立枚举存储） |

**配置项**：ALLOW_REGISTRATION、SESSION_COOKIE_NAME、SESSION_TTL_MS、COOKIE_SAMESITE、COOKIE_SECURE、AUTH_LOGIN_RATE_WINDOW_MS/MAX、AUTH_REGISTER_RATE_WINDOW_MS/MAX（`server/.env.example`）。

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

sessions（域内实体存储）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| tokenHash | string | SHA-256 hex，唯一索引（`server/index.js:105`） | 明文令牌不落库 |
| userId | ObjectId | — | N:1 账号 |
| createdAt / expiresAt | Date | expiresAt TTL 索引（`server/index.js:106`） | TTL 默认 30 天 |

app_settings 注册开关单例（托管，存储属 D-02）：

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 固定 `'registration'`（REGISTRATION_SETTING_ID，`server/lib/authPolicy.js:4`） |
| registrationOpen | boolean | 管理台写入值 |
| updatedAt | number | epoch-ms |
| updatedBy | string\|null | 最后修改管理员用户名（`server/routes/admin.js:82-88`） |

**领域对象及角色**：账号=聚合根；登录会话=域内实体（独立标识 tokenHash，生命周期依附账号）；注册开关设置=关联领域对象（1.4）。

**不变量**：

| # | 不变量 | 强制点 |
|---|--------|--------|
| I1 | username 归一后全域唯一 | 唯一索引 + 预查重 409（`server/routes/auth.js:82-86`） |
| I2 | role ∈ {admin, user}；系统无用户时新注册必为 admin | `server/routes/auth.js:88-96` |
| I3 | 口令仅以 bcrypt(12) 散列存在 | `server/lib/password.js:24-26` |
| I4 | 禁用账号不产生/不恢复登录态 | 登录 403（`auth.js:124-127`）+ 中间件拒载（`authMiddleware.js:20-22`） |
| I5 | 会话校验先验过期再验用户存在与启用 | `server/lib/authMiddleware.js:11-22` |
| I6 | 开关判定优先级：userCount=0 恒开 > adminSetting!==undefined 取布尔 > env 布尔 | `server/lib/authPolicy.js:11-23` |

**领域服务**：

| 服务 | 文件 | 职责 |
|------|------|------|
| password | `server/lib/password.js` | normalizeUsername / validateUsername / validatePassword / hashPassword / verifyPassword |
| authPolicy | `server/lib/authPolicy.js` | isRegistrationOpen / parseAllowRegistration / publicUser / resolveOwnerId / canAccessConfig / REGISTRATION_SETTING_ID |
| session | `server/lib/session.js` | generateSessionToken / hashSessionToken / getCookieOptions / createSession / destroySession / destroyUserSessions |
| authMiddleware | `server/lib/authMiddleware.js` | attachUser / requireAuth / requireAdmin |

**业务常量**：USERNAME_RE=`^[a-z0-9_]{3,32}$`；BCRYPT_ROUNDS=12；SESSION_TTL_MS 默认 30 天；口令 8–200 字符。

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

### 4.3 子流程设计

无（PRD 领域模型结论：无独立生命周期的过程）。首用户注册时的遗留模板迁移为附带动作而非子流程——无独立 I/O 契约，失败静默不阻塞注册（`server/routes/auth.js:98-103`）。

### 4.4 接口设计

**接口清单**：

| # | 编码 | 方法 | 路径 | 鉴权 | 用户类型 | 限流 | 说明 |
|---|------|------|------|------|---------|------|------|
| 1 | STATUS | GET | `/api/auth/status` | 匿名 | 访客+全部 | 不限 | 注册状态查询 |
| 2 | REGISTER | POST | `/api/auth/register` | 匿名 | 访客 | 10 次/60min/IP | 注册并自动登录 |
| 3 | LOGIN | POST | `/api/auth/login` | 匿名 | 访客/注册用户/管理员 | 20 次/15min/IP | 登录 |
| 4 | LOGOUT | POST | `/api/auth/logout` | Cookie 可选 | 全部 | 不限 | 退出并销毁会话 |
| 5 | ME | GET | `/api/auth/me` | 会话 | 注册用户/管理员 | 不限 | 当前登录用户 |
| 6 | REG-GET | GET | `/api/admin/settings/registration` | requireAuth+requireAdmin | 管理员 | 无 | 读注册开关（来源语义） |
| 7 | REG-PUT | PUT | `/api/admin/settings/registration` | requireAuth+requireAdmin | 管理员 | 无 | 写注册开关 |

动作接口：无独立动作子资源（register/login/logout 即动作）。
服务依赖清单：users/sessions/appSettings 集合、password/authPolicy/session/rateLimits/migrateLegacyConfigurations 组件（§3.2）。
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

- 请求体：`{ "username": string, "password": string }`。
- 处理顺序（每步失败即返回）：①开关判定（403）→ ②格式校验（400）→ ③查重（409）→ ④建号（首用户 admin）→ ⑤首用户附带迁移 → ⑥签发会话。注意限流中间件先于处理器，注册关闭期间请求仍计数（测试锚点 `server/routes/authRoutes.test.js:175`）。
- 响应 201 + Set-Cookie（dt_session）：

```json
{ "success": true, "data": { "id": "…24-hex…", "username": "alice", "role": "user" } }
```

- 错误：403 `Registration is closed`；400 用户名/口令格式（§3.4 表）；409 `Username already taken`；429 限流；500。
- 锚点：`server/routes/auth.js:65-113`。

#### LOGIN — POST /api/auth/login

- 请求体：`{ "username": string, "password": string }`。
- 处理：归一后查用户 → verifyPassword（不存在与口令错统一 401）→ disabled 检查（403）→ 签发会话。
- 响应 200 + Set-Cookie：`{success:true, data: publicUser}`（结构同 REGISTER）。
- 错误：401 `Invalid username or password`；403 `Account is disabled`；429（第 21 次起，`server/routes/authRoutes.test.js:131`）；500。
- 锚点：`server/routes/auth.js:115-136`。

#### LOGOUT — POST /api/auth/logout

- 请求：无请求体；Cookie 中的会话令牌（可缺失）。
- 处理：删除服务端会话记录 + `clearCookie`（maxAge:0）。未登录调用同样安全返回（token 缺失时 destroySession 直接返回，`server/lib/session.js:42-47`）。
- 响应 200：`{ "success": true }`（无 data 字段）。
- 锚点：`server/routes/auth.js:138-147`。

#### ME — GET /api/auth/me

- 请求：无参数；依赖全局 attachUser 已恢复的 `req.user`。
- 响应 200：`{ "success": true, "data": { "id", "username", "role" } }`（publicUser 结构）。
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
- 响应 200：结构同 REG-GET，恒 `source:'admin'`。
- 错误：400 / 401 / 403 / 500。无 404（upsert 语义）。
- 锚点：`server/routes/admin.js:76-102`。

**跨接口复用规则**：publicUser 结构为 REGISTER/LOGIN/ME 共用；错误包络与 401/403 语义由 authMiddleware 统一。**服务方法规格**见 §4.1 领域服务表。**枚举定义**见 §3.4。

### 4.5 领域事件与集成

- 领域事件/MQ：无（单体 Express，无消息队列）。
- SSE：本模块不广播（用户删除由 D-01 广播 configurations change，见 S-02 §4.5）。
- 仓储契约：users/sessions/appSettings 三集合的直访（MongoDB 驱动，无仓储抽象层——如实记录，操作清单见 §5.2）。
- 关联域调用：D-01（禁用/改密 → destroyUserSessions，`server/routes/admin.js:202-204`；删除 → 级联删模板+广播，`server/routes/admin.js:233-236`）；反向：本模块注册时调用 migrateLegacyConfigurations 迁移遗留模板到首管理员名下。

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 消费方 |
|------|--------|
| publicUser(user) → `{id, username, role}` | S-02/S-04 的 ownerId 语义、D-01 用户清单、全站登录态 |
| isRegistrationOpen / registrationState | 本模块 STATUS/REGISTER；管理台展示（REG-GET 不含首用户短路） |
| requireAuth / requireAdmin / attachUser | 全部业务路由（S-02/S-03 复制与下架/S-04/D-01） |
| createSession / destroySession / destroyUserSessions | 登录/注册/退出；D-01 治理动作 |

### 5.2 SQL 清单

无 SQL（MongoDB）。集合操作清单：

| 集合 | 操作 | 位置 |
|------|------|------|
| users | countDocuments / findOne / insertOne | `server/routes/auth.js:40-45,82,90,105` |
| sessions | insertOne / deleteOne / deleteMany / findOne(tokenHash+expiresAt) | `server/lib/session.js:30-51`；`server/lib/authMiddleware.js:11-14` |
| app_settings | findOne(_id='registration') / updateOne(upsert) | `server/routes/auth.js:42-44`；`server/routes/admin.js:67-69,84-88` |

### 5.3 DDL

无表结构 DDL（MongoDB schemaless）。索引（`server/index.js:104-106`）：

```js
users.createIndex({ username: 1 }, { unique: true })
sessions.createIndex({ tokenHash: 1 }, { unique: true })
sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

## 6. 更新记录

**变更类型词汇表**：`initial`=首次生成；`structural`=章节增删重组；`interface_added/changed/removed`=接口增删改；`rule_added/changed`=规则增删改；`enum_added`=枚举新增（其余词汇见引擎分册，本档暂未涉及）。

**版本号规则**：`vMAJOR.MINOR`，接口不兼容变更升 MAJOR。

| 版本 | 日期 | 变更类型 | 变更说明 | 目标节 |
|------|------|---------|---------|--------|
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：7 接口（5 auth + 2 注册开关）含来源语义与 400/401/403/409/429 全错误码；三参开关判定、账号/会话/开关领域模型依现有实现成文 | — |

### 模板符合性自检记录（M1~M5，逆向归档如实记录）

| # | 项 | 结果 |
|---|----|------|
| M1 | 章节结构完整（1.x/2.x/4.x/6.x 🔒 全存在，2/3/4.3/5 为裁剪标注） | ✅ |
| M2 | 接口路径三段式 | ⚠️ 部分符合：`/api/auth/register|login|logout` 与 `/api/auth/status|me` 为 `/domain/action` 与 `/domain/action` 两段式，路径为已上线事实，逆向归档不改路径；`/api/admin/settings/registration` 为三段式 |
| M3 | 枚举引用有定义 | ✅ userRole / registrationSource / accountLifecycle 均在 §3.4 定义 |
| M4 | 占位符残留 | ✅ 无 |
| M5 | 变更记录含本次更新行 | ✅ §6 initial 行 |
