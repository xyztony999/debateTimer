# API 设计 — 权限与用户治理（D-01-admin）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-11-11 |
| 模块编码 | D-01（基础数据域，无子模块；文件夹 `D-01-admin`） |
| 状态 | 逆向归档（系统已上线，如实反映现有实现） |
| 输入 | D-01-user-governance PRD v1.0 + AA/FL v1.0 + 现有代码 |
| 功能类型 | 台账（治理台账）+ 主数据治理（承 PRD §7） |
| 实现索引 | server/routes/admin.js、server/lib/authMiddleware.js、server/lib/authPolicy.js、server/lib/session.js、server/lib/configDocs.js:254-266、server/index.js:119-139、src/services/adminService.js |

> 章节裁剪依据 d3-api 分册裁剪矩阵：第 2 章不适用（本域无聚合根、无跨聚合根编排，PRD §6.1）；第 3/4/5/6 章按主数据类保留。系统已上线，本文档为逆向归档而非新设计。

## 1. 模块设计概述

### 1.1 业务背景及目标

系统采用轻量 IAM：首个注册用户自动成为管理员，之后管理员在后台治理账号与全部用户的赛制模板（FL 2.3.2.1「用户治理 / 配置治理」）。本模块为治理操作提供 HTTP 接口面：**管理员鉴权链**（谁能调用）+ **用户台账与治理**（清单/创建/禁用/角色/改密/删除）+ **配置治理**（全部用户模板台账/强制删除）。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 做什么 | `/api/admin/*` 六个治理端点；`/api/configurations` 的 admin `ownerId` 代管放行；治理动作后的会话销毁与 SSE 广播 |
| 不做什么 | 注册/登录/登出端点（S-01）；注册开关的存储语义（D-02-settings，端点挂在同一 admin 路由）；模板的常规 CRUD 读写（S-02，本域只有台账与强制删除）；广场下架（S-03，管理页复用 `POST /api/gallery/:id/unpublish`）；审计日志（PRD N4 缺口，现无实现） |
| 用户类型 | 管理员（唯一调用方）；注册用户为被治理对象 |

### 1.3 设计决策

| # | 决策 | 依据（代码） |
|---|------|-------------|
| DA-1 | 鉴权 = 会话有效 + `role==='admin'`，两层中间件在路由工厂内 `router.use(requireAuth, requireAdmin)` 整体挂载，非逐端点装饰 | server/routes/admin.js:39、server/lib/authMiddleware.js:36-57 |
| DA-2 | 禁用用户的会话双保险失效：加载时检查 `user.disabled`（挂载即失效）+ 治理动作主动 `destroyUserSessions`（即时清库） | server/lib/authMiddleware.js:20、server/routes/admin.js:202-204,233 |
| DA-3 | 「最后一名可用管理员」保护统一以 `countAdmins(excludeId)` 实现（排除目标后可用管理员仍 ≥1），覆盖禁用/降级/删除三处 | server/routes/admin.js:104-110,172-174,180-182,228-230 |
| DA-4 | 管理员代管 = `ownerId` 查询参数放行（`resolveOwnerId`），模板不复制给管理员、不产生归属变更 | server/lib/authPolicy.js:25-30、server/routes/configurations.js:47-49,66-68,90-92,133-135,163-165 |
| DA-5 | 删除用户级联物理删除其全部 configurations，并 `sse.broadcast({ownerId})` 通知各端台账刷新 | server/routes/admin.js:233-236 |
| DA-6 | 错误响应统一 `{success:false, message}`，不含 `code` 字段（与 configurations 路由的错误体不同，后者可含 code） | server/routes/admin.js:13-19 |

### 1.4 领域对象总览

本域**无聚合根**（PRD §6.1）：治理操作直接作用于两个关联领域对象——

| 对象 | 归属域 | 本域读写面 |
|------|--------|-----------|
| User（账号实体） | S-01 账号与准入 | 治理字段 `role`/`disabled`、`passwordHash`、清单投影、删除 |
| Configuration（赛制模板） | S-02 赛制模板管理 | 全量只读台账（`toAdminListItem` 投影）、强制删除 |

无子流程。治理台账视图（用户清单/模板清单）为过程数据（P2 展示投影），不持久化（PRD §6.2/§6.5）。

### 1.5 上下文映射

| 外部上下文 | 集成关系 | 映射模式 |
|-----------|---------|---------|
| S-01 账号与准入 | 遵奉 users 集合与用户名/密码校验函数（normalizeUsername/validateUsername/validatePassword）；本域写治理字段 | OHS（消费方） |
| S-02 赛制模板管理 | 台账投影 + 按 id 强制删除；常规 CRUD 留在 S-02 上下文 | OHS（消费方） |
| D-02 系统配置 | 同一 admin 路由挂载 settings 端点（见 api-D-02-settings.md），本文档不重复 | 遵奉者 |
| C-02/P-01（SSE 通道） | 治理动作经 `sse.broadcast` 发 `change` 事件 | PL（发布方） |

## 2. 跨聚合根设计

不适用——本域无聚合根（见 1.4），无跨聚合根编排。

## 3. 应用/基础设施层设计

### 3.1 接口规范

| 项 | 规范 |
|----|------|
| 路径格式 | `/api/admin/<resource>`（两段式：挂载前缀 `/api/admin` + 资源段；id 类操作 `/api/admin/<resource>/:id`） |
| HTTP 方法 | GET（台账）/ POST（创建）/ PATCH（部分更新，三组字段可选）/ DELETE（删除） |
| 响应包络 | 成功 `{success:true, data?, message?}`；失败 `{success:false, message}`（无 `code` 字段，DA-6） |
| 时间戳 | epoch 毫秒（`Date.now()`），如 `createdAt`/`updatedAt` |
| 认证 | 会话 cookie `dt_session`（env `SESSION_COOKIE_NAME`），sha256 哈希后在 sessions 集合匹配未过期会话并加载未禁用用户（server/lib/authMiddleware.js:5-25） |
| 权限守卫 | 路由级 `router.use(requireAuth, requireAdmin)`：未认证 401 `Authentication required`；已认证非 admin 403 `Admin access required`（server/routes/admin.js:39、authMiddleware.js:41-43,52-54） |
| 会话参数 | TTL 默认 30 天（env `SESSION_TTL_MS`）；httpOnly + sameSite 默认 lax（env `COOKIE_SAMESITE`）+ 生产或 `COOKIE_SECURE=true` 时 secure（server/lib/session.js:3-28） |
| 前端协同 | axios 401 拦截器跳 `/login?next=`（公共路径 /login、/display、/gallery 除外，src/services/apiClient.js:21-30）；`/admin` 路由 `ProtectedRoute adminOnly` 非 admin 重定向首页（src/components/ProtectedRoute.jsx:18-20） |

### 3.2 依赖与约束

| 依赖 | 说明 |
|------|------|
| 集合 | `users`（S-01 上下文）、`configurations`（S-02 上下文）、`sessions`（平台托管） |
| 校验函数 | server/lib/password.js:6-22（用户名 `^[a-z0-9_]{3,32}$`、密码 8–200 字符），与 S-01 注册端点同一套 |
| SSE Hub | `sse.broadcast`（P-01，server/lib/sseHub.js:17-34） |
| 量级约束 | 社团规模（十至百级），全量清单无分页（PRD N1） |

### 3.3 权限模型

| 角色 | 可调用端点 | 数据权限 |
|------|-----------|---------|
| admin | 本模块全部端点 | 全量（全部用户、全部用户模板） |
| 注册用户 | 无（403） | — |
| 访客 | 无（401） | — |

代管放行（在 S-02 的 configurations 路由内，非本模块端点）：admin 携带 `ownerId` 查询参数时代管读写；非 admin 携带 `ownerId` 一律 403（configurations.js:47-49,66-68,90-92,133-135,163-165）。会话级操作（session/command/signal）不允许代管——admin 亦须为归属人本人（configurations.js:238-256 `findOwnConfig`）。

### 3.4 公共规范

- 错误消息为英文机器串（如 `Cannot disable the last admin`），前端直显或经 toServiceError 包装（src/services/adminService.js:32-40）。
- `toAdminUser` 投影 = `publicUser`（{id, username, role}，authPolicy.js:42-51）+ `disabled` + `createdAt`（admin.js:21-27）。
- `toAdminListItem` 投影 = {id, name, ownerId, ownerUsername, createdAt, updatedAt, shareEnabled, shareToken（仅 shareEnabled 时为真实 token，否则 null）, isPublic}（server/lib/configDocs.js:254-266）。
- 枚举定义（已入池，引用 workspace/01-solution/common-spec/enum-pool.md，编号如下）：
  - `role`: EP-IDENT-01——`admin` / `user`（写入口仅接受 `admin`，其余值一律落 `user`，admin.js:125）
  - `disabled`: EP-IDENT-03——`true` / `false`（两态开关，无状态机）

## 4. 聚合根详细设计（无聚合根模块的接口归档）

> 本域无聚合根（1.4）。4.1 记录被治理对象的字段引用；4.2/4.3 不适用；4.4 承载接口详情；4.5 记录 SSE 集成。

### 4.1 领域模型（关联对象字段引用）

| 对象（集合） | 本域涉及字段 | 类型/约束 |
|-------------|-------------|----------|
| User（users） | `_id`（ObjectId）、`username`（唯一索引，S-01 建）、`passwordHash`（bcrypt 12 轮）、`role`（枚举 role）、`disabled`（布尔，缺省 false）、`createdAt`（epoch ms） | server/routes/admin.js:139-145、server/index.js:104 |
| Configuration（configurations） | `_id`、`ownerId`、`name`、`shareEnabled`、`shareToken`、`isPublic`、`createdAt`/`updatedAt` | server/lib/configDocs.js:254-266 |
| 不变量 | INV-1 任意时刻存在 ≥1 名可用管理员（`role:'admin' && disabled !== true`，由 countAdmins 守卫）；INV-2 不可禁用/删除操作者本人 | server/routes/admin.js:104-110,168-170,219-221 |

### 4.2 状态模型

不适用——`disabled` 为两态开关，无流转路径（PRD §7 T2）。

### 4.3 子流程设计

不适用——无审批、无多轮流程（PRD §6.3）。

### 4.4 接口设计

#### 4.4.1 接口清单

| # | 方法 | 路径 | 说明 | 代码 |
|---|------|------|------|------|
| A1 | GET | `/api/admin/users` | 用户台账（全量，createdAt 升序） | admin.js:112-119 |
| A2 | POST | `/api/admin/users` | 管理员直接开账号（绕过注册开关） | admin.js:121-151 |
| A3 | PATCH | `/api/admin/users/:id` | 禁用/启用、角色升降、重置密码 | admin.js:153-210 |
| A4 | DELETE | `/api/admin/users/:id` | 删除用户（级联删模板 + SSE） | admin.js:212-241 |
| A5 | GET | `/api/admin/configurations` | 全部用户模板台账 | admin.js:243-260 |
| A6 | DELETE | `/api/admin/configurations/:id` | 强制删除任意模板 | admin.js:262-287 |

挂载与鉴权：六端点整体位于 `router.use(requireAuth, requireAdmin)` 之后（admin.js:39）；匿名 401、非 admin 403。

#### 4.4.2 接口详情

**A1 `GET /api/admin/users`**

- 请求：无参数（全量）。
- 响应 200：`{success:true, data: AdminUser[]}`，按 `createdAt` 升序；`AdminUser = {id, username, role, disabled, createdAt}`。
- 规则：无筛选/分页（量级约束，3.2）。

**A2 `POST /api/admin/users`**

- 请求 body：`{username, password, role?}`。
- 校验/规则：
  1. `normalizeUsername`（trim+小写）后 `validateUsername`：`^[a-z0-9_]{3,32}$`，不符 400；
  2. `validatePassword`：8–200 字符，不符 400（admin.js:126-131）；
  3. `role` 仅接受字面量 `'admin'`，其余一律落 `'user'`（admin.js:125）；
  4. 用户名重复 → 409 `Username already taken`（admin.js:133-137）；
  5. 绕过注册开关——admin 开账号不查 app_settings（对比 S-01 `/register`）。
- 响应 201：`{success:true, data: AdminUser}`（含 `disabled:false`）。

**A3 `PATCH /api/admin/users/:id`**

- 请求 body（三组字段均可选，可组合）：`{disabled?: boolean, role?: 'admin'|'user', password?: string}`。
- 校验/规则（按代码顺序）：
  1. `:id` 非 ObjectId → 400 `Invalid user id`；用户不存在 → 404 `User not found`（admin.js:155-164）；
  2. `disabled=true` 且目标是自己 → 400 `You cannot disable your own account`（admin.js:168-170）；
  3. `disabled=true` 且目标是管理员且排除后可用管理员为 0 → 400 `Cannot disable the last admin`（admin.js:172-174）；
  4. `role:'user'` 且目标原为 admin 且排除后可用管理员为 0 → 400 `Cannot demote the last admin`（admin.js:180-183）；
  5. `password` 提供时走 `validatePassword`（不符 400），通过后写 `passwordHash`（admin.js:187-194）；
  6. 无任何更新字段 → 幂等返回当前用户 200（admin.js:196-199）；
  7. 更新含 `disabled` 或 `passwordHash` 时立即 `destroyUserSessions`（删除该用户全部会话文档，session.js:49-51）→ 被治用户全部端强制重新登录（admin.js:202-204）。
- 响应 200：`{success:true, data: AdminUser}`（更新后重读，admin.js:205-206）。
- 副作用：会话销毁（仅 disabled/改密）；无 SSE 广播（模板台账不受影响）。

**A4 `DELETE /api/admin/users/:id`**

- 校验/规则：
  1. `:id` 非法 → 400；目标是自己 → 400 `You cannot delete your own account`（admin.js:219-221）；
  2. 用户不存在 → 404；
  3. 目标为管理员且排除后可用管理员为 0 → 400 `Cannot delete the last admin`（admin.js:228-230）。
- 执行序：`destroyUserSessions` → `configurations.deleteMany({ownerId})`（级联物理删除）→ `users.deleteOne` → `sse.broadcast({ownerId})`（admin.js:233-236）。
- 响应 200：`{success:true, message: 'User "<username>" deleted'}`。

**A5 `GET /api/admin/configurations`**

- 请求：无参数。
- 规则：全量按 `updatedAt` 降序（admin.js:245）；收集去重 ownerId 批量查 users 组装 `ownerUsername`（admin.js:246-252）；缺失归属人时 `ownerUsername` 落空串。
- 响应 200：`{success:true, data: AdminListItem[]}`，结构见 3.4。

**A6 `DELETE /api/admin/configurations/:id`**

- 校验/规则：`:id` 非 ObjectId → 400 `Invalid configuration id`；不存在 → 404 `Configuration not found`（admin.js:264-273）。
- 执行：`deleteOne` → `sse.broadcast({ownerId, name, shareToken: shareEnabled ? shareToken : undefined})`——携带 shareToken 使 display 端感知下线（admin.js:274-279）。
- 响应 200：`{success:true, message: 'Configuration "<name>" deleted'}`。

#### 4.4.3 校验规则汇总（跨接口）

| 规则 | 端点 | 错误 |
|------|------|------|
| 路径 id 必须为合法 ObjectId | A3/A4（用户）、A6（模板） | 400 |
| 最后一名可用管理员不可禁用/降级/删除 | A3/A4 | 400 |
| 不可操作自己（禁用/删除） | A3/A4 | 400 |
| 用户名格式 `^[a-z0-9_]{3,32}$`、密码 8–200 字符 | A2（A3 改密复用密码规则） | 400 |
| 用户名唯一（users.username 唯一索引） | A2 | 409 |
| 治理动作即时踢会话 | A3（disabled/改密）、A4（前置销毁） | — |

#### 4.4.4 服务方法规格

无独立 service 层——端点直写集合（薄适配，PRD §6.1「无业务状态机」）；可复用函数为 `countAdmins`（admin.js:104-110）、`toAdminUser`（admin.js:21-27）、`toRegistrationPayload`（归 D-02-settings 文档）。

### 4.5 领域事件与集成

| 触发端点 | 事件 | 载荷 | 投递面（P-01 Hub 语义） |
|---------|------|------|------------------------|
| A4 删除用户 | SSE `change` | `{ownerId: String(userId)}` | shareToken 匹配者（无，已随模板删除）/admin 全收/ownerId 匹配者（admin.js:236、sseHub.js:17-34） |
| A6 删除模板 | SSE `change` | `{ownerId, name, shareToken?}`（shareEnabled 才带 token） | 同上；display 端据此感知大屏链接失效 |

无 MQ、无仓储抽象（直写集合）；关联域调用仅 password.js 校验函数与 `destroyUserSessions`（S-01 上下文）。

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 形态 | 消费方 |
|------|------|--------|
| `/api/admin/users` ×4（A1~A4） | HTTP | 管理页 src/AdminPage.jsx（经 src/services/adminService.js:3-49） |
| `/api/admin/configurations` ×2（A5~A6） | HTTP | 管理页（adminService.js:51-61,89-101） |
| `resolveOwnerId`/`canAccessConfig` | 进程内导出 | S-02 configurations 路由（代管放行） |
| 管理页深链 `/settings?ownerId=<id>` | URL 约定 | 配置治理→代管编辑（AdminPage.jsx:312，本人模板无代管警告横幅） |
| `POST /api/gallery/:id/unpublish`（S-03 端点） | 复用 | 管理页下架公开模板（AdminPage.jsx:348，gallery.js:140 requireAdmin） |

### 5.2 SQL/集合清单（MongoDB，无 SQL）

| 集合 | 操作 | 说明 |
|------|------|------|
| users | find/sort、findOne、insertOne、updateOne($set)、deleteOne、countDocuments | 归 S-01 上下文，本域不建集合不建索引 |
| configurations | find({}).sort、deleteMany({ownerId})、deleteOne、find({$in}) | 归 S-02 上下文 |
| sessions | deleteMany({userId}) | 平台托管数据（P6），随备份排除（server/scripts/backup.js:25 不含 sessions） |

### 5.3 DDL

本域不新增集合与索引。涉及索引均为上游域所建：`users.username` 唯一（server/index.js:104）、`configurations.ownerId+name` 唯一与 `updatedAt` 降序（server/index.js:107,112）。

## 6. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档初稿：按 d3 分册模板从现有实现（admin.js 六端点 + 鉴权链 + 代管放行）归纳；章节按主数据类裁剪（第 2 章不适用）。验证：`bun test server/` 85 pass / 0 fail（本归档会话执行） |
