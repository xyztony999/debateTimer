# API 设计 — 审计日志（P-04-audit）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-11-24 |
| 模块编码 | P-04（平台支撑域，无子模块；文件夹 `P-04-audit`） |
| 状态 | 设计稿【R20】：本模块为新增能力，文中接口、字段、规则均为待实现设计，不是现网事实 |
| 输入 | P-04-audit-log PRD v1.0 + AA v1.2 §2.4.4 + R20 安全与合规设计说明 |
| 功能类型 | 台账类（只增写入加只读查询，无导出；承 PRD 第三部分） |
| 实现索引（规划落点） | `server/lib/auditLog.js`（写入器、IP 策略、脱敏、清洗）、`server/routes/audit.js`（查询接口）、`server/index.js`（挂载与索引）、`server/scripts/backup.js`（纳入备份与恢复清洗） |

> 章节裁剪依据 d3-api 分册裁剪矩阵（台账报表类）：第 1 章必填；第 2 章不适用（单聚合根）；第 3 章必填；第 4 章必填（4.2 简化、4.3 含两个系统子流程）；第 5 章选填（本档给出集合与索引清单）；第 6 章必填。

## 1. 模块设计概述

### 1.1 业务背景及目标

系统对「谁在什么时候登录、谁改了谁的权限」没有任何留痕。本模块提供一条只增的安全与账号事件记录，使管理员能按时间、账号、事件类型回溯安全相关操作，用户本人能在设置页查看自己账号的登录记录。

本模块按 PIPL、GDPR、PIPEDA 关于目的限定、数据最小化、存储限制、访问控制与个人查阅权的共同要求设计，逐条对照见 R20 §3。本文不作合规结论。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 做什么 | 审计写入器 `recordAudit`（事件类型白名单、专属字段白名单、IP 记录策略、留存到期时间）；两个只读查询接口；账号删除时的日志清洗；备份恢复后的孤儿清洗 |
| 不做什么 | 不定义事件源（由 S-01、D-01、D-02、S-03 在各自的写入点调用写入器）；不提供修改、删除、清空、导出接口；不做防篡改加固；不记录管理员查阅审计日志的行为；不采集 User-Agent；不做 IP 地理解析 |
| 用户类型 | 写入侧为纯技术机制；读取侧：管理员（全量）、注册用户（本人登录记录） |
| 边界注记 | 管理后台的「审计日志」卡只是查阅入口，界面规格见 admin-page PageSpec v1.1；「我的登录记录」见 S-01-account PageSpec |

### 1.3 设计决策

| # | 决策 | 理由 |
|---|------|------|
| PA-1 | 事件类型白名单（EP-AUDIT-01），写入器对白名单外的类型抛错 | 从结构上限定记录范围（R20 D48） |
| PA-2 | 「操作者、所涉账号、专属字段」三元模型；用户名读出时解析，不冗余存储 | 存量最小；账号改名或删除后无需回写（R20 D49） |
| PA-3 | 专属字段按事件类型白名单，写入器无「透传任意对象」入口 | 请求体不可能落入日志 |
| PA-4 | IP 是否记录由调用方以 `consent` 参数显式声明，写入器据此决定 | 把「先告知后收集」的策略集中到一个可单测的函数里（R20 D50） |
| PA-5 | 写入只走 `insertOne`；仅有的两处批量处置封装在具名函数中 | 只增语义（R20 D48） |
| PA-6 | 审计写入失败则当前请求失败 | 留痕是被审计动作的一部分（R20 D64） |
| PA-7 | 留存 184 天（2026-11-24 用户裁决，由 180 天改定）由写入时的 `expireAt` 加 TTL 索引实现；留存期是单一常量 | 调整只改一处（R20 D45） |
| PA-8 | 删除账号时先清洗、后删除；备份恢复后对已不存在的账号重放清洗 | 隐私优先且可重试（R20 D59、D60） |
| PA-9 | 本人视图对失败事件做 IP 脱敏，脱敏读出时计算、不落库 | 失败请求的来源可能是第三方（R20 D58） |

### 1.4 领域对象总览

| 对象 | 分类 | 说明 |
|------|------|------|
| 审计事件 | 聚合根（不可变事实） | `audit_logs` 集合；每个事件自成一个一致性边界 |
| 留存策略 | 值对象（常量） | `AUDIT_RETENTION_DAYS = 184` |
| 日志清洗 | 子流程（系统处置） | 账号删除清洗、孤儿清洗，见 §4.3 |
| 账号 | 关联领域对象 | 以 `actorUserId`、`subjectUserId` 引用（S-01） |
| 赛制模板 | 关联领域对象 | 以 `detail.templateId` 引用（S-02） |

### 1.5 上下文映射

| 外部上下文 | 集成关系 | 映射模式 |
|-----------|---------|---------|
| S-01 账号与准入 | 注册、登录、两步验证、隐私同意四个写入点调用 `recordAudit` | 遵奉者（调用写入器） |
| D-01 权限与用户治理 | 治理动作调用 `recordAudit`；删除账号时调用 `scrubUserAuditLogs` | 遵奉者 |
| D-02 系统配置 | 注册开关 PUT 调用 `recordAudit` | 遵奉者 |
| S-03 模板广场 | 发布、撤回、下架三个写入点调用 `recordAudit` | 遵奉者 |
| 备份脚本 | 纳入 `COLLECTIONS`；恢复后调用 `scrubOrphanAuditLogs` | 遵奉者 |
| P-02 接口防护 | 无直接集成；审计取到的 IP 与限流取到的 `req.ip` 同源，前置条件相同（R20 §9.3） | 引用 |

## 2. 跨聚合根设计（裁剪：不适用）

单一聚合根（审计事件），事件之间没有不变量或编排。

## 3. 应用/基础设施层设计

### 3.1 接口规范

| 项 | 规范 |
|----|------|
| 前缀与挂载 | `/api/audit`，在 `server/index.js` 中挂载于 `attachUser` 与门控中间件之后 |
| 路径格式 | 三段式 `/api/audit/<资源>/<操作>`（api-path-rules.md §2 第 2 条） |
| HTTP 方法 | 只有 GET；写入不经过 HTTP，由进程内函数 `recordAudit` 完成 |
| 响应包络 | `{success:true, data}`；失败 `{success:false, message}`（无 `code` 字段，与 admin、gallery 路由一致） |
| 时间戳 | 响应中的 `at` 为 epoch 毫秒；查询参数 `from`、`to` 也为 epoch 毫秒（与既有 `createdAt`、`before` 游标同一口径） |
| 分页 | `page`（从 1 起）加 `pageSize`；响应带 `total` |
| 标识 | 账号 id 以字符串形式返回；已匿名化的事件对应字段为 `null` |

### 3.2 依赖与约束

| 依赖 | 类型 | 约束 |
|------|------|------|
| `auditLogs` 集合（MongoDB） | 存储 | 5 个索引在启动时创建（§5.3）；TTL 索引的生效条件见 PRD §5.3 |
| `users` 集合 | 只读 | 读出时批量解析用户名；`username` 筛选时查 id；孤儿清洗时比对存在性 |
| `requireAuth`、`requireAdmin` | 组件 | 由 `createAuthMiddleware` 提供，`server/index.js` 注入同一实例 |
| `req.ip` | 运行时 | `trust proxy = 1`；真实客户端 IP 的前置条件见 R20 §9.3 |
| 常量 `AUDIT_RETENTION_DAYS`、`AUDIT_EVENT_TYPES`、`AUDIT_DETAIL_KEYS` | 代码常量 | 不设环境变量 |

### 3.3 权限模型

| 角色 | `GET /api/audit/logs/list` | `GET /api/audit/logins/list` |
|------|---------------------------|----------------------------|
| 管理员 | ✓ 全量 | ✓（管理员自己的登录记录） |
| 注册用户 | ✗ 403 `Admin access required` | ✓ 只返回本人的登录类事件 |
| 访客 | ✗ 401 `Authentication required` | ✗ 401 |
| 会话仍有待办步骤 | ✗ 403 `GATE_REQUIRED`（S-01 API §3.5；两个接口都不在放行清单内） | ✗ 403 `GATE_REQUIRED` |

数据权限：`AUDIT-LOGINS` 不接受任何指定账号的参数，所涉账号恒为 `req.user.id`。

### 3.4 公共规范

**错误码语义表**（本模块全量）：

| HTTP | 触发 | message |
|------|------|---------|
| 400 | `type` 不是 EP-AUDIT-01 的取值 | `Unknown audit event type` |
| 400 | `result` 不是 `success` 或 `failure` | `Unknown audit result` |
| 400 | `from` 不小于 `to`，或二者不是整数 | `Invalid time range` |
| 401 | 匿名调用 | `Authentication required` |
| 403 | 非管理员调用 `logs/list` | `Admin access required` |
| 500 | 数据库异常 | error.message |

**枚举定义**（已登记入池 enum-pool.md，编号如下）：

| 枚举 | 池编号 | 值 |
|------|-----|------|
| auditEventType | EP-AUDIT-01 | 20 个取值，见 PRD §3.3 |
| auditResult | EP-AUDIT-02 | `success` / `failure` |
| loginFailureReason | EP-AUDIT-03 | `invalid_credentials` / `account_disabled` |
| totpMethod | EP-IDENT-05 | `code` / `recovery_code` |
| totpChannel | EP-IDENT-06 | `self` / `forced_enrollment` / `admin` / `cli` |
| consentChannel | EP-IDENT-09 | `register` / `login_gate` |
| userRole | EP-IDENT-01 | `admin` / `user`（`role_changed` 与 `registered`、`user_created` 的前后值） |

**配置项**：无环境变量。留存天数、分页上限为常量（§4.1.6）。

## 4. 聚合根详细设计

### 4.1 领域模型

#### 4.1.1 表结构组合

**audit_logs**（聚合根存储）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `_id` | ObjectId | — | 事件 id |
| `type` | string | EP-AUDIT-01 | 事件类型 |
| `at` | Date | 服务端时钟，写入时取值 | 事件时间；排序键 |
| `expireAt` | Date | `at + 184 天` | TTL 字段；不对外返回 |
| `result` | string | EP-AUDIT-02 | 见不变量 INV-5 |
| `actorUserId` | ObjectId 或 null | — | 操作者 |
| `subjectUserId` | ObjectId 或 null | — | 事件所涉账号 |
| `ip` | string 或 null | 完整 IP | 是否记录按 §4.1.4 |
| `detail` | object | 只含白名单键 | 没有专属字段时为 `{}` |
| `anonymizedAt` | Date | 可选 | 仅匿名化后的文档存在 |

示例（一条登录失败事件）：

```json
{
  "_id": { "$oid": "6650f1a2b3c4d5e6f708192a" },
  "type": "login_failed",
  "at": { "$date": "2026-11-24T12:00:00.000Z" },
  "expireAt": { "$date": "2027-05-27T12:00:00.000Z" },
  "result": "failure",
  "actorUserId": null,
  "subjectUserId": { "$oid": "6650f0a1b2c3d4e5f6071829" },
  "ip": "203.0.113.7",
  "detail": { "reason": "invalid_credentials" }
}
```

两个账号 id 字段统一存 ObjectId，可被备份脚本的 `reviveDeep` 往返（键名以 `Id` 结尾）。字段名不得改成以 `Id` 结尾却存放非账号标识的值，否则恢复时会被误转为 ObjectId。

#### 4.1.2 领域对象及角色

审计事件为聚合根，没有域内对象。`detail` 是值对象，随事件不可变。

#### 4.1.3 不变量

| # | 不变量 | 强制点 |
|---|--------|--------|
| INV-1 | `type` 属于 EP-AUDIT-01 | `recordAudit` 校验，否则抛错 |
| INV-2 | `expireAt - at` 恒等于 `AUDIT_RETENTION_DAYS` 天 | 写入时计算 |
| INV-3 | `detail` 的键是该 `type` 白名单的子集 | `recordAudit` 校验，否则抛错 |
| INV-4 | 文档写入后不再修改，唯一例外是清洗写入的三个空值与 `anonymizedAt` | 代码库内没有其他针对 `audit_logs` 的更新路径 |
| INV-5 | `result` 为 `failure` 当且仅当 `type` 是 `login_failed` 或 `totp_failed` | `recordAudit` 校验 |
| INV-6 | 匿名化后的文档 `actorUserId` 与 `subjectUserId` 中指向被删账号的一个为 null，`anonymizedAt` 非空 | `scrubUserAuditLogs` |
| INV-7 | 含 IP 的事件，其 `consent` 实参为 `anonymous_attempt` 或 `consented` | `recordAudit` 按 `consent` 取值，不接受调用方直接传 IP |
| INV-8 | `audit_scrubbed` 事件不含任何账号 id | 调用点传 `subjectUserId: null` |

#### 4.1.4 IP 记录策略

策略集中在写入器内部，调用方只声明情境：

```js
// clientIp(req)：req.ip 去掉 IPv4 映射前缀（"::ffff:203.0.113.7" → "203.0.113.7"）；无值返回 null。

// consentOf(userDoc)：账号已同意当前版本隐私说明返回 'consented'，否则 'not_consented'。
function consentOf(userDoc) {
  return userDoc?.privacy?.version === PRIVACY_NOTICE_VERSION ? 'consented' : 'not_consented';
}

// ipFor(consent, req)：
//   'anonymous_attempt' → clientIp(req)   登录失败、二次验证失败：以登录页表单前的告知覆盖
//   'consented'          → clientIp(req)   操作者或所属账号已同意当前版本
//   'not_consented'      → null            存量用户确认之前
//   'system'             → null            无请求来源（脚本、系统路径）
```

`registered` 与 `privacy_consented` 两个事件在同意落库**之后**才调用写入器，并以 `consent: 'consented'` 声明，因此记 IP。管理员对他人操作时，`consent` 取**管理员**的状态，因为 IP 是请求发起方的数据。

若负责人选择更严格的口径（未确认说明的存量账号，其匿名失败尝试也不记 IP），只需在 `ipFor` 之前加一个判断，调用点不变（R20 §11.1 Q3）。

脱敏函数 `maskIp(ip)`：IPv4 保留前三段，第四段写 `*`；IPv6 保留前四组，后接 `::/64`；`null` 原样返回。只在 `AUDIT-LOGINS` 的读出路径使用。

#### 4.1.5 领域服务

| 服务 | 文件 | 职责 |
|------|------|------|
| `recordAudit(auditLogs, event)` | `server/lib/auditLog.js` | 校验类型与专属字段、取 IP、计算到期时间、`insertOne`；签名见 §4.4.2 |
| `consentOf(userDoc)` | 同上 | 判定账号是否已同意当前版本说明 |
| `clientIp(req)` / `maskIp(ip)` | 同上 | IP 归一与脱敏 |
| `scrubUserAuditLogs(auditLogs, userId)` | 同上 | 账号删除清洗，见 §4.3.1 |
| `scrubOrphanAuditLogs(db)` | 同上 | 备份恢复后的孤儿清洗，见 §4.3.2 |
| `toAuditItem(doc, usernames)` / `toLoginItem(doc)` | 同上 | 响应投影 |
| `listAuditLogs(...)` / `listOwnLogins(...)` | `server/routes/audit.js` | 查询组装 |

#### 4.1.6 业务常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `AUDIT_RETENTION_DAYS` | 184 | 留存天数（用户裁决，覆盖任何起算点下的六个自然月） |
| `AUDIT_EVENT_TYPES` | EP-AUDIT-01 的 20 个取值 | 类型白名单 |
| `AUDIT_DETAIL_KEYS` | 每个类型允许的 `detail` 键 | 见 PRD §3.3 的 `detail` 列 |
| `AUDIT_ADMIN_MAX_PAGE_SIZE` | 100 | 管理员列表分页上限 |
| `AUDIT_SELF_MAX_PAGE_SIZE` | 50 | 本人登录记录分页上限 |
| `AUDIT_SELF_TYPES` | `login_succeeded`、`login_failed`、`totp_succeeded`、`totp_failed`、`recovery_code_used` | 本人可见的事件类型 |
| `AUDIT_FAILURE_TYPES` | `login_failed`、`totp_failed` | 可取 `failure` 的类型（INV-5） |

### 4.2 状态模型

审计事件不可变，只有一条生命周期（PRD §6）：写入 → 到期删除，或所属账号被删除时被删除或匿名化。没有状态字段，没有流转接口。

### 4.3 子流程设计

#### 4.3.1 账号删除清洗 `scrubUserAuditLogs(auditLogs, userId)`

由 D-01 的 `DELETE /api/admin/users/:id` 在删除账号文档之前调用。

```
输入：被删账号 id（ObjectId）
步骤 1  deleteMany({ subjectUserId: userId, type: { $ne: 'user_deleted' } })        → deleted
步骤 2  updateMany(
          { $or: [{ actorUserId: userId }, { subjectUserId: userId }] },
          [{ $set: {
               actorUserId: null,
               subjectUserId: null,
               ip: { $cond: [{ $eq: ['$actorUserId', userId] }, null, '$ip'] },
               anonymizedAt: new Date(),
             } }]
        )                                                                                → anonymized
输出：{ deleted, anonymized }，调用方据此写 audit_scrubbed 事件
```

- 步骤 1 执行后，仍以该账号为所涉账号的文档只剩 `user_deleted`；仍以它为操作者的文档是它对别人做过的事。
- 步骤 2 把两个 id 字段置空。`ip` 只在该账号是操作者时置空；`user_deleted` 的操作者是管理员，其 IP 保留。
- 步骤 2 使用聚合管道更新，为的是 `ip` 的条件判断。
- 幂等：对同一个 id 重复调用，第二次两步都匹配 0 条。

#### 4.3.2 孤儿清洗 `scrubOrphanAuditLogs(db)`

由 `server/scripts/backup.js` 的 `--restore` 在全部集合回放完成后调用。

```
步骤 1  从 audit_logs 收集所有非空的 actorUserId 与 subjectUserId，去重
步骤 2  在 users 中查这些 id 里仍然存在的
步骤 3  对每个已不存在的 id 执行 §4.3.1 的步骤 1、2（不写 audit_scrubbed 事件）
```

- 用途：用一份「账号删除之前」的备份恢复，会让已清洗的标识重新出现；本步骤把它们再清一次。
- 只清理账号 id，不处理 `detail.templateId`（模板不是个人标识）。

### 4.4 接口设计

#### 4.4.1 接口清单

| # | 编码 | 方法 | 路径 | 鉴权 | 用户类型 | 说明 |
|---|------|------|------|------|---------|------|
| 1 | AUDIT-LIST | GET | `/api/audit/logs/list` | requireAuth + requireAdmin | 管理员 | 管理员查阅（筛选、分页） |
| 2 | AUDIT-LOGINS | GET | `/api/audit/logins/list` | requireAuth | 注册用户、管理员 | 本人登录记录 |

没有写接口。写入只通过进程内的 `recordAudit` 完成，HTTP 面无法新增、修改或删除事件。

#### 4.4.2 写入器契约 `recordAudit`（进程内，非 HTTP）

```js
await recordAudit(auditLogs, {
  type,              // EP-AUDIT-01
  result,            // 'success' | 'failure'
  consent,           // 'anonymous_attempt' | 'consented' | 'not_consented' | 'system'
  req,               // Express 请求对象；consent 为 'system' 时可为 null
  actorUserId,       // ObjectId | null
  subjectUserId,     // ObjectId | null
  detail,            // 普通对象，键须在该类型的白名单内
});
```

处理顺序：

1. 校验 `type` 与 `result`（INV-1、INV-5），不满足即抛错。
2. 校验 `detail` 的键（INV-3），出现白名单外的键抛错。值不做转储，调用方传什么存什么，因此调用方只能传 §4.4.5 列出的字段。
3. 取 IP：`ipFor(consent, req)`。
4. 组装文档：`at = new Date()`，`expireAt = at + AUDIT_RETENTION_DAYS 天`。
5. `insertOne`。失败则异常上抛，由调用方的错误处理返回 500（PA-6）。
6. 不记录任何日志内容；出错时 `console.error` 只带路由名与事件类型。

#### 4.4.3 AUDIT-LIST — GET /api/audit/logs/list

- 鉴权：requireAuth + requireAdmin（401、403）。
- 查询参数：

| 参数 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `page` | 整数 | ≥1，缺省 1 | 页码 |
| `pageSize` | 整数 | 1–100，缺省 20；大于 100 按 100 | 每页条数 |
| `type` | string | EP-AUDIT-01 | 事件类型，单选；缺省为全部 |
| `username` | string | 经 `normalizeUsername` 归一 | 操作者或所涉账号的用户名（精确匹配）；账号不存在时返回空结果 |
| `from` | 整数 | epoch-ms | `at ≥ from` |
| `to` | 整数 | epoch-ms，且大于 `from` | `at < to` |
| `result` | string | EP-AUDIT-02 | 缺省为全部 |

- 处理：组装筛选条件 → `countDocuments` 取 `total` → `find().sort({ at: -1, _id: -1 }).skip().limit()` → 批量解析两个 id 字段的用户名（各一次 `$in` 查询）→ 投影。
- 响应 200：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "6650f1a2b3c4d5e6f708192a",
        "type": "login_succeeded",
        "result": "success",
        "at": 1763985600000,
        "actor": { "id": "6650f0a1b2c3d4e5f6071829", "username": "alice" },
        "subject": { "id": "6650f0a1b2c3d4e5f6071829", "username": "alice" },
        "ip": "203.0.113.7",
        "detail": {},
        "anonymized": false
      },
      {
        "id": "6650f1a2b3c4d5e6f708192b",
        "type": "user_deleted",
        "result": "success",
        "at": 1763985600000,
        "actor": { "id": "6650f0a1b2c3d4e5f6071828", "username": "boss" },
        "subject": null,
        "ip": "198.51.100.4",
        "detail": {},
        "anonymized": true
      }
    ],
    "total": 128,
    "page": 1,
    "pageSize": 20
  }
}
```

- `actor` 与 `subject`：账号存在时为 `{id, username}`；字段本身为空或账号已不存在时为 `null`。
- `ip`：完整值；未记录时为 `null`。不做脱敏。
- `anonymized`：文档是否带有 `anonymizedAt`。
- `expireAt` 不返回。
- 错误：400（`type`、`result`、时间范围非法）；401；403；500。

#### 4.4.4 AUDIT-LOGINS — GET /api/audit/logins/list

- 鉴权：requireAuth（401）。非管理员也可调用，只见本人的。
- 查询参数：`page`（≥1，缺省 1）、`pageSize`（1–50，缺省 20；大于 50 按 50）。不接受指定账号的参数，传了也忽略。
- 处理：筛选条件恒为 `{ subjectUserId: req.user.id, type: { $in: AUDIT_SELF_TYPES } }`；排序与计数同 AUDIT-LIST。
- 响应 200：

```json
{
  "success": true,
  "data": {
    "items": [
      { "id": "6650f1a2b3c4d5e6f708192c", "type": "login_failed", "result": "failure",
        "at": 1763985540000, "ip": "203.0.113.*", "detail": { "reason": "invalid_credentials" } },
      { "id": "6650f1a2b3c4d5e6f708192a", "type": "login_succeeded", "result": "success",
        "at": 1763985600000, "ip": "2001:db8:1234:5678::/64", "detail": {} }
    ],
    "total": 25,
    "page": 1,
    "pageSize": 20
  }
}
```

- `ip`：`result` 为 `success` 时为完整值；为 `failure` 时为 `maskIp()` 的结果；未记录时为 `null`。
- `detail.reason` 与 `detail.method` 取 EP-AUDIT-03 与 EP-IDENT-05。本人视图不返回 `attemptedUsername`（该键只在被尝试的账号不存在时出现，本人视图中不会命中）。
- 错误：401；500。参数越界按上限处理，不报 400。

#### 4.4.5 事件源接入清单

各事件源在业务写入成功之后、发送响应之前调用 `recordAudit`。「consent」列的取值方式见 §4.1.4。

| 事件 | 调用点 | actor | subject | consent | detail |
|------|--------|-------|---------|---------|--------|
| `registered` | S-01 REGISTER，建号并写入同意记录之后 | 新账号 | 新账号 | `consented` | `{role}` |
| `privacy_consented` | S-01 REGISTER（紧随 `registered`）或 PRIVACY-CONSENT | 账号 | 账号 | `consented` | `{version, channel}` |
| `login_failed` | S-01 LOGIN 返回 401 的分支 | null | 被尝试的账号（存在时），否则 null | `anonymous_attempt` | `{reason:'invalid_credentials', attemptedUsername?}` |
| `login_failed` | S-01 LOGIN 返回 403（账号禁用）的分支 | 账号 | 账号 | `consentOf(user)` | `{reason:'account_disabled'}` |
| `login_succeeded` | S-01 LOGIN、TOTP-VERIFY、TOTP-RECOVER 建立会话之后 | 账号 | 账号 | `consentOf(user)` | `{}` |
| `totp_failed` | TOTP-VERIFY、TOTP-RECOVER 校验失败的分支 | null | 凭据所属账号 | `anonymous_attempt` | `{method}` |
| `totp_failed` | S-01 TOTP-CONFIRM 口令不匹配的分支（绑定确认） | 账号 | 账号 | `consentOf(user)` | `{method:'code'}` |
| `totp_succeeded` | TOTP-VERIFY 校验成功（先于 `login_succeeded`） | 账号 | 账号 | `consentOf(user)` | `{}` |
| `recovery_code_used` | TOTP-RECOVER 校验成功（先于 `login_succeeded`） | 账号 | 账号 | `consentOf(user)` | `{remaining}` |
| `totp_bound` | TOTP-CONFIRM 激活之后 | 账号 | 账号 | `consentOf(user)` | `{channel, rebind, recoveryCodeCount: 10}` |
| `totp_unbound` | TOTP-DISABLE 成功之后 | 账号 | 账号 | `consentOf(user)` | `{channel:'self'}` |
| `totp_reset` | D-01 A7 成功之后；`scripts/reset-totp.js` | 管理员，脚本时为 null | 目标账号 | `consentOf(admin)`，脚本为 `system` | `{channel}` |
| `user_created` | D-01 A2 | 管理员 | 新账号 | `consentOf(admin)` | `{role}` |
| `role_changed` | D-01 A3，`role` 实际变化时 | 管理员 | 目标账号 | `consentOf(admin)` | `{from, to}` |
| `status_changed` | D-01 A3，`disabled` 实际变化时 | 管理员 | 目标账号 | `consentOf(admin)` | `{from, to}` |
| `password_reset` | D-01 A3，提供了 `password` 时 | 管理员 | 目标账号 | `consentOf(admin)` | `{}` |
| `user_deleted` | D-01 A4，清洗之前写入（随清洗被匿名化） | 管理员 | 目标账号 | `consentOf(admin)` | `{}` |
| `audit_scrubbed` | D-01 A4，清洗之后写入 | 管理员 | null | `consentOf(admin)` | `{deleted, anonymized}` |
| `registration_setting_changed` | D-02 S2，存储值实际变化时 | 管理员 | null | `consentOf(admin)` | `{from, to}` |
| `gallery_published` | S-03 VISIBILITY，`isPublic` 由 false 变 true | 属主 | 模板属主 | `consentOf(属主)` | `{templateId}` |
| `gallery_unpublished` | S-03 VISIBILITY，`isPublic` 由 true 变 false | 属主 | 模板属主 | `consentOf(属主)` | `{templateId, by:'owner'}` |
| `gallery_unpublished` | S-03 GAL-UNPUBLISH，`unpublished` 为 true 时 | 管理员 | 模板属主 | `consentOf(admin)` | `{templateId, by:'admin'}` |
| `template_deleted_by_admin` | D-01 A6 | 管理员 | 模板属主 | `consentOf(admin)` | `{templateId}` |

各事件源只调用写入器，不直接操作 `audit_logs` 集合。

#### 4.4.6 校验规则汇总

| 规则 | 位置 | 结果 |
|------|------|------|
| 事件类型在白名单内 | `recordAudit` | 抛错，请求 500 |
| `result` 与 `type` 匹配 | `recordAudit` | 抛错 |
| `detail` 只含白名单键 | `recordAudit` | 抛错 |
| IP 只由 `consent` 决定 | `recordAudit` | 调用方不能直接传 IP |
| `type`、`result` 取值合法 | AUDIT-LIST | 400 |
| `from` 小于 `to` | AUDIT-LIST | 400 |
| `pageSize` 上限 | 两个接口 | 超出按上限 |
| 本人视图不可指定账号 | AUDIT-LOGINS | 参数被忽略 |

### 4.5 领域事件与集成

- 无 MQ、无 SSE。审计写入不广播。
- 仓储：`auditLogs` 集合直访（与既有模块一致，无仓储抽象层）。
- 关联域调用：`users` 集合只读（解析用户名、按用户名查 id、孤儿清洗比对）。
- 备份：`COLLECTIONS` 增加 `audit_logs`；`--restore` 末尾调用 `scrubOrphanAuditLogs`。

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 形态 | 消费方 |
|------|------|--------|
| `recordAudit` | 进程内函数 | S-01、D-01、D-02、S-03 的写入点 |
| `scrubUserAuditLogs` | 进程内函数 | D-01 A4、`scrubOrphanAuditLogs` |
| `scrubOrphanAuditLogs` | 进程内函数 | `server/scripts/backup.js` |
| `consentOf` | 进程内函数 | 各事件源（S-01 的 `authPolicy` 同步导出 `pendingGates`，二者共用同一版本常量） |
| AUDIT-LIST | HTTP | admin-page PageSpec v1.1 §4.6 |
| AUDIT-LOGINS | HTTP | S-01-account PageSpec §5 |

### 5.2 集合操作清单

| 集合 | 操作 | 位置 |
|------|------|------|
| `audit_logs` | `insertOne` | `recordAudit` |
| `audit_logs` | `countDocuments`、`find` + `sort` + `skip` + `limit` | AUDIT-LIST、AUDIT-LOGINS |
| `audit_logs` | `deleteMany`（条件：所涉账号为被删账号且类型不是 `user_deleted`） | `scrubUserAuditLogs` 步骤 1 |
| `audit_logs` | `updateMany`（聚合管道；条件：操作者或所涉账号为被删账号） | `scrubUserAuditLogs` 步骤 2 |
| `audit_logs` | `aggregate`（取不重复的账号 id） | `scrubOrphanAuditLogs` |
| `users` | `find`（`$in` 批量取用户名或存在性）、`findOne`（按用户名取 id） | 查询接口、孤儿清洗 |

### 5.3 索引

在 `server/index.js` 启动时创建（幂等，与既有 `createIndex` 并列）：

```js
await auditLogs.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
await auditLogs.createIndex({ at: -1 });
await auditLogs.createIndex({ type: 1, at: -1 });
await auditLogs.createIndex({ subjectUserId: 1, at: -1 });
await auditLogs.createIndex({ actorUserId: 1, at: -1 });
```

- TTL 索引的生效条件：`expireAt` 为 BSON Date；集合不是固定大小集合；MongoDB 未以 `ttlMonitorEnabled=false` 启动；监视线程约每 60 秒运行一次。
- 查询与索引的对应：无筛选或只有时间范围时用 `{ at: -1 }`；按类型用 `{ type: 1, at: -1 }`；按用户名用 `{ actorUserId: 1, at: -1 }` 或 `{ subjectUserId: 1, at: -1 }`；本人视图用 `{ subjectUserId: 1, at: -1 }`。多条件组合时选其中一个索引，其余条件在扫描中过滤。

## 6. 更新记录

**变更类型词汇表**：`initial` 为首次生成；`interface_added`、`field_added`、`enum_added`、`rule_added`、`event_added` 等按引擎分册。

**版本号规则**：`vMAJOR.MINOR`，接口不兼容变更升 MAJOR。

| 版本 | 日期 | 变更类型 | 变更说明 | 目标节 |
|------|------|---------|---------|--------|
| v1.0 | 2026-11-24 | initial | R20 新增模块：审计写入器契约（类型与专属字段白名单、`consent` 决定 IP、184 天到期时间）、两个只读查询接口（管理员全量筛选分页、本人登录记录并脱敏）、账号删除清洗与备份恢复孤儿清洗、5 个索引 | — |

### 模板符合性自检记录（M1~M5）

| # | 项 | 结果 |
|---|----|------|
| M1 | 章节结构完整 | ✅ 1.x、2.x、3.x、4.x、5.x、6.x 齐全；第 2 章裁剪并标注 |
| M2 | 接口路径三段式 | ✅ `/api/audit/logs/list`、`/api/audit/logins/list` |
| M3 | 枚举引用有定义 | ✅ EP-AUDIT-01~03、EP-IDENT-01/05/06/09 均已在 enum-pool.md 定义 |
| M4 | 占位符残留 | ✅ 无 |
| M5 | 变更记录含本次更新行 | ✅ §6 v1.0 行 |
