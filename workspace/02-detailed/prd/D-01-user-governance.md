# PRD — 权限与用户治理（D-01）

| 属性 | 值 |
|------|-----|
| 版本 | v1.1 |
| 日期 | 2026-11-24 |
| 模块编码 | D-01（基础数据域，无子模块） |
| 状态 | v1.0 为逆向归档（系统已上线，如实反映现有实现）；v1.1 增量以【R20】标注，属前瞻设计，待代码阶段实现 |
| 关联 | S-01 账号与准入（User 聚合根归属域；两步验证重置的目标能力）、S-02 赛制模板管理（配置治理对象）、D-02 系统配置（注册开关存储）、P-01 实时通信通道（治理动作的 SSE 广播）、P-04 审计日志（治理动作的事件接收方） |
| 实现索引 | server/routes/admin.js、server/lib/authMiddleware.js、server/lib/authPolicy.js、server/lib/session.js、src/AdminPage.jsx、src/components/ProtectedRoute.jsx、src/services/adminService.js |

## 1. 业务目标与范围

### 1.1 业务目标（G1）

为已上线的系统提供系统级治理入口：**管理员角色鉴权**（谁能调用治理接口）与**用户/模板台账治理**（清点用户、禁用与角色调整、代管与清理全部用户的赛制模板）。系统采用「首个注册用户自动成为管理员，之后管理员在后台开账号/治理」的轻量 IAM 模式，无更细粒度的权限体系。

【R20】v1.1 起补充三件事：治理动作写入审计日志并在管理后台提供查阅入口；管理员可重置他人账号的两步验证；删除账号时同步清除审计日志中该账号的标识与 IP。

### 1.2 功能范围（G2）

**做什么**：
- 管理员鉴权中间件链：全站 `attachUser`（凭会话 cookie 附加用户）→ `requireAuth`（未认证 401）→ `requireAdmin`（非 admin 403），admin 路由整体挂载该链（server/routes/admin.js:39）
- 用户台账：全量用户清单（用户名/角色/状态/创建时间，按创建时间升序）；创建用户（指定角色）；禁用/启用；角色升降（admin↔user）；重置密码；删除用户
- 治理保护规则：不可禁用/删除自己；不可禁用、降级或删除最后一名可用管理员；禁用或改密后立即销毁该用户全部会话；删除用户级联删除其全部赛制模板并广播 SSE 变更
- 配置治理：查看全部用户的模板台账（含归属人用户名、分享/公开状态）；强制删除任意模板（广播 SSE）；从管理页深链代管编辑他人模板（`/settings?ownerId=&name=`）
- 前端管理页（/admin，adminOnly 路由守卫）承载以上操作
- 【R20】审计事件发射：开号、角色变更、禁用或启用、重置密码、删除用户、强制删除模板，每次动作写一条审计事件（清单见 FR-7）
- 【R20】两步验证重置：管理员为**其他**账号重置两步验证，并销毁其全部会话（FR-6）
- 【R20】删除账号时清洗审计日志：先清洗、后删除（FR-4）
- 【R20】管理后台展示增量：用户表新增「注册时间」列与「两步验证」状态列；注册开关卡显示最后修改人与时间；新增「审计日志」卡（查阅入口在本页，数据与接口属 P-04）

**不做什么**：
- 不做细粒度权限/资源级授权（角色仅 admin/user 两档）
- 不管理账号生命周期入口——注册、登录、登出、首用户引导属 S-01 账号与准入
- 不做用户台账的筛选、分页与导出（当前全量清单，量级为社团规模）
- 【R20 修订】不承载审计日志的存储与查询接口（属 P-04）；管理后台只放查阅入口。任何角色都不能修改或删除单条日志，本模块也不例外
- 【R20】不做两步验证的绑定与登录校验（属 S-01）；管理员不能重置自己的两步验证，自己换手机走重新绑定
- 【R20】管理员代管编辑他人模板（S-02 保存路径）本轮不写审计事件，列入 R20 §11 待决事项
- 不做注册开关的业务语义（存储与读写通道在 D-02；准入规则在 S-01-03）

### 1.3 决策记录（现有实现的关键取舍）

| # | 决策 | 依据（代码注释/实现） |
|---|------|---------------------|
| DG-1 | 管理员判定 = 会话有效 + `role==='admin'`，两层中间件而非装饰器 | server/lib/authMiddleware.js:51-57 |
| DG-2 | 禁用用户的既有会话在下一次加载时即失效（加载时检查 `disabled`），且治理动作主动 `destroyUserSessions` 双保险 | server/lib/authMiddleware.js:20；server/routes/admin.js:202-204, 233 |
| DG-3 | 「最后一名管理员」保护在禁用/降级/删除三处统一以 `countAdmins`（排除目标后仍 ≥1）实现 | server/routes/admin.js:104-110, 172-174, 180-182, 228-230 |
| DG-4 | 管理员代管 = `ownerId` 查询参数放行（`resolveOwnerId`），而非把模板复制给管理员 | server/lib/authPolicy.js:25-30 |
| DG-5 | 删除用户级联删除其模板（物理删除），并 `sse.broadcast` 通知各端台账变化 | server/routes/admin.js:234-236 |
| 【R20】DG-6 | 治理动作在业务写入成功后写审计事件；写入失败则该请求返回 500，不静默放行 | R20 D64；P-04 PRD §5.2 |
| 【R20】DG-7 | 删除账号时先清洗审计日志、再删除账号文档 | R20 D59；P-04 PRD §5.4 |
| 【R20】DG-8 | 两步验证重置同时销毁目标账号的全部会话，且不能对自己执行 | R20 D57；S-01 PRD §5.5 |
| 【R20】DG-9 | 用户表「注册时间」取既有字段 `createdAt`；早期账号缺该字段时显示「—」 | A1 响应自 v1.0 起即含 createdAt（admin.js:21-27），此前界面未展示 |

## 2. 角色与对象

- **角色（G3）**：管理员（唯一操作角色，见 FL 2.3.2.1）；注册用户（被治理对象，被动承受禁用/降级/删除）；本模块不涉及计时操作员/访客/大屏观众。
- **领域对象（G4/G5）**：本域无独立聚合根——治理操作直接作用于 **User**（账号实体，归属 S-01 上下文）的治理字段（role/disabled）与 **Configuration**（赛制模板，归属 S-02 上下文）；二者以 ID 引用，详见 §6.4 关联领域对象。会话（sessions）为平台托管数据，不建模。

## 3. 功能需求

### FR-1 管理员鉴权链（现有实现）

- 全局 `attachUser`：从 `dt_session` cookie 取 token，sha256 哈希后在 sessions 集合匹配未过期会话，再加载未禁用用户；失败静默置空（server/lib/authMiddleware.js:5-34）
- `requireAuth`：无用户 401 `Authentication required`；`requireAdmin`：非 admin 403 `Admin access required`；admin 路由 `router.use(requireAuth, requireAdmin)` 整体拦截（server/lib/authMiddleware.js:36-57、server/routes/admin.js:39）
- 会话参数：cookie 名 `SESSION_COOKIE_NAME`（默认 `dt_session`）、TTL 默认 30 天（env `SESSION_TTL_MS`）、httpOnly + sameSite lax + 生产/`COOKIE_SECURE=true` 时 secure（server/lib/session.js:3-28）
- 前端协同：axios 401 拦截器跳转 `/login?next=`（公共路径 /login、/display、/gallery 除外，src/services/apiClient.js:21-30）；`/admin` 路由 `ProtectedRoute adminOnly`，非 admin 重定向首页（src/components/ProtectedRoute.jsx:18-20）

### FR-2 用户台账与创建

- `GET /api/admin/users`：全量、`createdAt` 升序，返回 `{id, username, role, disabled, createdAt}`（server/routes/admin.js:112-119, 21-27）；【R20】响应新增布尔字段 `totpEnabled`，管理页用户表新增「注册时间」与「两步验证」两列
- `POST /api/admin/users`：管理员直接开账号（绕过注册开关）；用户名/密码走 S-01 同一套校验（normalizeUsername/validateUsername/validatePassword）；重名 409；角色仅接受 `admin`/`user`（非 `admin` 一律落 `user`）；201 返回新建用户（server/routes/admin.js:121-151）；【R20】写 `user_created`（role）。管理端开号不经注册页，没有隐私同意记录，该用户首次登录时走存量确认流程（S-01 PRD §5.6）

### FR-3 用户状态与角色治理

- `PATCH /api/admin/users/:id`，三组可选更新（server/routes/admin.js:153-210）：
  - `disabled`（boolean）：不可禁用自己（400）；禁用最后一名可用管理员（400）；生效后 `destroyUserSessions` 立即踢下线
  - `role`（admin|user）：降级最后一名管理员（400）
  - `password`：通过校验后重置哈希，并销毁该用户全部会话（强制重新登录）
- 无任何更新字段时幂等返回当前用户（server/routes/admin.js:196-199）
- 【R20】审计：`role` 实际变化时写 `role_changed`（from/to）；`disabled` 实际变化时写 `status_changed`（from/to）；提供 `password` 时写 `password_reset`。操作者为当前管理员，所涉账号为目标用户

### FR-4 用户删除

- `DELETE /api/admin/users/:id`：不可删除自己（400）；最后一名管理员保护（400）；先销毁会话 → 级联删除其全部 configurations → 删除用户 → `sse.broadcast({ownerId})` 通知各端（server/routes/admin.js:212-241）
- 【R20】v1.1 起执行顺序调整为：写 `user_deleted` 事件 → 清洗该账号的审计日志（自身活动事件删除、其余引用匿名化）→ 写 `audit_scrubbed` 事件 → 销毁会话 → 级联删除模板 → 删除账号 → SSE 广播。清洗先于删除的理由见 P-04 PRD §5.4

### FR-5 配置治理（全部用户模板代管）

- `GET /api/admin/configurations`：全量模板按 `updatedAt` 降序，批量补齐归属人用户名，返回列表项（名称/归属/分享状态/公开状态/shareToken）（server/routes/admin.js:243-260、server/lib/configDocs.js `toAdminListItem`）
- `DELETE /api/admin/configurations/:id`：强制删除任意用户模板，广播 SSE（含 shareToken 时让 display 端感知）（server/routes/admin.js:262-287）；【R20】写 `template_deleted_by_admin`（detail 只有 templateId，不含模板名称）
- 管理页操作：深链代管编辑（`/settings?ownerId=&name=`，本人模板无代管警告横幅，e2e/admin-deeplink.e2e.js:72-78 覆盖）、打开大屏、下架公开模板（复用 S-03 接口）、删除（src/AdminPage.jsx:309-375）
- 鉴权放行：admin 携带 `ownerId` 查询参数时代管读写（server/lib/authPolicy.js:25-30、server/routes/configurations.js:47-49 等五处非 admin 拒绝 + admin 放行）

### FR-6 【R20】两步验证重置

- `POST /api/admin/totp/reset`，body `{userId}`：校验 id 合法、目标存在、目标不是自己、目标已启用两步验证（否则 400）
- 执行：移除目标账号的 `totp` 子文档 → 销毁目标全部会话 → 写 `totp_reset`（channel=admin，操作者为当前管理员，所涉账号为目标）
- 使用场景：目标账号丢失验证器且恢复码用尽。重置后管理员账号下次登录重新进入强制绑定，普通账号回到仅口令登录
- 管理页入口：用户表「重置两步验证」，只对 `totpEnabled === true` 且不是自己的行显示，点击后二次确认

### FR-7 【R20】审计事件发射清单（本模块）

| 动作 | 事件 | detail |
|------|------|--------|
| 开号（A2） | `user_created` | role |
| 角色变更（A3，值实际变化） | `role_changed` | from、to |
| 禁用或启用（A3，值实际变化） | `status_changed` | from、to |
| 重置密码（A3 提供 password） | `password_reset` | — |
| 删除用户（A4） | `user_deleted`，随后 `audit_scrubbed` | —；deleted、anonymized |
| 强制删除模板（A6） | `template_deleted_by_admin` | templateId |
| 两步验证重置（FR-6） | `totp_reset` | channel=admin |

事件字段与 IP 记录策略见 P-04 PRD。A5（只读台账）不产生事件。管理员代管编辑他人模板本轮不产生事件（§1.2）。

## 4. 非功能需求（N1）

- 量级：社团规模（用户/模板均为十至百级），全量清单无分页可接受
- 治理动作生效时延：禁用/改密后的会话失效在下一次请求即生效；SSE 广播即时
- 单进程部署（宝塔 nginx 反代单 Node），无水平扩展诉求
- 【R20】每个被审计的治理动作多一次 `insertOne`；删除账号多两次批量操作，规模为该账号的事件数（184 天留存下至多数千条）

## 5. 验收标准

1. 非 admin（含未登录）访问任一 `/api/admin/*`：分别得到 403/401（server/routes/adminRoutes.test.js 覆盖，`bun test server/` 85 pass，2026-11-11 执行）
2. 禁用/降级/删除最后一名可用管理员均被 400 拒绝；禁用自己/删除自己被 400 拒绝（同上测试套）
3. 禁用或重置密码后，该用户既有会话全部失效
4. 删除用户后其模板随之清空，各端经 SSE 收到变更
5. 管理页：admin 编辑本人模板无代管横幅、编辑他人模板有代管横幅（e2e/admin-deeplink.e2e.js 既有规格；本归档会话未运行 Playwright）
6. 【R20】每个治理动作在审计日志中产生且只产生一条对应事件；同值重写不产生事件
7. 【R20】删除账号后，审计日志中不再出现该账号的 id 与 IP；`user_deleted` 与 `audit_scrubbed` 两条事件保留
8. 【R20】两步验证重置后，目标账号的会话全部失效，其下次登录按新状态执行
9. 【R20】管理页：用户表显示注册时间与两步验证状态；注册开关卡显示最后修改人与时间；审计日志卡可筛选、分页

## 6. 领域建模（D2-2）

### 6.1 本域信息

| 项目 | 内容 |
|------|------|
| 本域名称 | 权限与用户治理（D-01） |
| 领域分层 | 基础数据域（AA v1.0：系统级引用数据与治理，无业务状态机，薄适配） |
| 聚合根 | 无（治理能力域：被治理实体均为关联领域对象，见 6.4） |

### 6.2 领域对象清单

| 对象名 | 分类 | 与上级关系 | 核心业务字段 | 关键枚举字段 | 备注 |
|--------|------|-----------|------------|------------|------|
| 管理员角色判定 | 值对象 | — | `role` | role: admin / user | 挂在 User 上的治理字段，本域读判与写治 |
| 用户禁用状态 | 值对象 | — | `disabled` | disabled: true / false | 两态开关，无状态机；变更即销毁会话 |
| 治理台账视图 | 过程数据（P2） | — | 用户清单/模板清单投影 | — | 只读派生展示，不持久化 |
| 【R20】两步验证凭据（治理侧） | 值对象（属 S-01 账号聚合） | 挂在 User 上 | enabled | — | 本域只能整体移除（重置），不能编辑 |

### 6.3 子流程 I/O 契约

不适用——本域无独立生命周期的过程（无审批、无多轮流程）。

### 6.4 关联领域对象

| 关联领域对象 | 所属业务域 | 关联字段 | 需获取信息 | 触发关系 | 映射模式 |
|------------|--------|---------|----------|---------|---------|
| User（账号） | S-01 账号与准入 | `userId`（ObjectID） | username / role / disabled / createdAt | 本域写治理字段（role/disabled/passwordHash）、删除；S-01 负责创建/登录/注册 | OHS（S-01 暴露账号实体，本域遵奉其字段约定） |
| Configuration（赛制模板） | S-02 赛制模板管理 | `ownerId` / `configId` | 名称 / 归属人 / 分享与公开状态 / shareToken | 本域全量只读台账 + 强制删除 + ownerId 代管读写 | OHS |
| app_settings 注册开关 | D-02 系统配置 | 固定 `_id='registration'` | registrationOpen | 注册开关的管理端读写通道挂在本域 admin 路由（存储语义归 D-02 PRD） | 遵奉者 |
| 【R20】审计事件 | P-04 审计日志 | actorUserId / subjectUserId | 无 | 本域各治理动作写入；删除账号时调用清洗 | 遵奉者（只调用写入器与清洗函数，不读日志） |

### 6.5 过程数据分类表

| 数据项 | 类别 | 处理方式 |
|--------|------|---------|
| 会话（sessions 集合：tokenHash/userId/expiresAt） | P6 平台托管 | 平台管理生命周期，不建模 |
| SSE 广播载荷（{ownerId, name, shareToken}） | P5 集成载荷 | 触发各端台账刷新 |
| 管理页表单态（新建用户输入、开关 busy 态） | P3 UI 交互状态 | 前端局部状态 |
| 401/403 错误响应结构 | P4 请求/响应结构 | 接口契约载体 |
| 【R20】审计日志卡的筛选条件与分页参数 | P1 查询条件 | 透传给 P-04 查询接口，本域不处理 |

## 7. PRD 完备性检查（D2-1）

功能类型：**台账（治理台账）+ 主数据治理**

| 层 | 检查项 | 结果 | 依据 |
|----|--------|------|------|
| G1 | 业务目标 | ✅ | §1.1 |
| G2 | 功能范围（做/不做） | ✅ | §1.2 |
| G3 | 角色定义 | ✅ | §2 |
| G4 | 领域对象 | ✅ | §2/§6（本域无聚合根，治理字段挂关联实体） |
| G5 | 对象关系 | ✅ | §6.4 |
| T1 | 业务字段 | ✅ | §6.2（role/disabled/createdAt 等） |
| T1a | 被引用关系 | ✅ | 被 S-01（登录态校验 disabled）、S-02（代管）引用；调用 P-04 审计写入 |
| T2 | 状态流转 | 不适用 | disabled 两态开关，无流转路径 |
| T3 | 审批规则 | 不适用 | 无审批 |
| T4 | 查询筛选条件 | 不适用（如实标注） | 用户与模板台账为全量清单无筛选，见 §4 量级判断；审计日志的筛选属 P-04 |
| T5 | 导出需求 | 不适用 | 无导出 |
| T6-T9 | 集成/工具项 | 不适用 | 非集成对接/工具型功能 |
| N1 | 非功能 | ✅ | §4 |
| N2 | 异常场景 | ✅ | §3 各 400/401/403/409 分支 |
| N3 | 业务规则细节 | ✅ | §1.3/§3（最后管理员保护、自禁/自删禁止、会话销毁时机、清洗先于删除） |
| N4 | 历史需求/操作日志 | ✅（v1.1） | 治理动作写入审计日志（FR-7，P-04）；v1.0 时为缺失项 |

**结论**：通过（G 全过、适用 T 项全过；v1.0 的 N4 缺口自 v1.1 关闭），可进入 D3 API 设计。

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.1 | 2026-11-24 | R20 增量设计：治理动作写入审计日志（FR-7 事件清单）、两步验证重置（FR-6）、删除账号改为先清洗审计日志再删除、用户表新增注册时间与两步验证状态列、注册开关卡显示最后修改人与时间、审计日志查阅入口；N4 缺口关闭 |
| v1.0 | 2026-11-11 | 逆向归档初稿：按 D2 分册模板从现有实现（server/routes/admin.js 等）归纳生成 |
