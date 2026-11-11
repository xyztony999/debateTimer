# API 设计 — 系统配置（D-02-settings）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-11-11 |
| 模块编码 | D-02（基础数据域，无子模块；文件夹 `D-02-settings`） |
| 状态 | 逆向归档（系统已上线，如实反映现有实现） |
| 输入 | D-02-system-settings PRD v1.0 + AA/FL v1.0 + 现有代码 |
| 功能类型 | 主数据（系统设置）+ 工具（批量导入脚本）（承 PRD §7） |
| 实现索引 | server/routes/admin.js:41-102、server/lib/authPolicy.js、server/routes/auth.js:35-63、server/index.js:84-87、server/scripts/backup.js:25、server/.env.example:23-26 |

> 章节裁剪依据 d3-api 分册裁剪矩阵：第 2 章不适用（无聚合根、无跨聚合根编排）；第 3/4/5/6 章按主数据类保留。本文档范围按任务指定聚焦 **app_settings 读写**；预置导入脚本（FR-2，CLI 非 HTTP 面）仅在边界标注，不展开接口规格。

## 1. 模块设计概述

### 1.1 业务背景及目标

系统级设置采用 **app_settings 单文档模式**：固定字符串 `_id` 的单例文档，天然唯一（无需索引）、非 24-hex 在备份往返中按普通字符串存活（server/lib/authPolicy.js:1-4 注释、server/index.js:84-87 注释）。当前唯一实例为「注册开放开关」，管理侧持久化，重启与备份恢复后保持；管理员从未写过时按 env `ALLOW_REGISTRATION` 回落（默认关闭）。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 做什么 | `GET/PUT /api/admin/settings/registration` 两端点（挂 D-01 admin 路由）；注册开关的生效判定语义（首用户短路 → DB 优先 → env 回落）；`/api/auth/status` 与 `/register` 的消费读取；app_settings 纳入备份集合 |
| 不做什么 | 注册准入业务规则（何时放行/关闭提示——语义归 S-01-03，本模块只提供存储与读取通道）；设置的通用管理界面（当前开关 UI 归管理页）；运行时热加载/多设置项框架（新增设置项 = 新增单例文档与读写端点）；预置导入 CLI 的接口规格（运维脚本，见 PRD FR-2） |
| 用户类型 | 管理员（读写）；访客/注册用户经 `/api/auth/status`、`/register` 间接受影响 |

### 1.3 设计决策

| # | 决策 | 依据（代码） |
|---|------|-------------|
| DS-1 | 单文档固定字符串 `_id`（`'registration'`）而非配置表：天然唯一免索引；非 24-hex 备份往返存活 | server/lib/authPolicy.js:1-4 |
| DS-2 | env 是回落不是覆盖：admin 写过（`setting !== undefined`）即 DB 值生效；删除 app_settings 的 registration 文档可恢复 env 语义（紧急开关） | server/lib/authPolicy.js:17-22、server/.env.example:23-26 |
| DS-3 | 首用户短路优先于一切：`userCount===0` 永远开放注册，防止陈旧「关闭」文档锁死新部署 | server/lib/authPolicy.js:11-16 注释 |
| DS-4 | `/api/auth/status` 与 `/register` 共享同一次并行读取快照（count + findOne），首用户角色判定与开关不会互相矛盾 | server/routes/auth.js:35-54 注释 |
| DS-5 | 首用户短路是运行时语义，归 `/api/auth/status`——admin settings 端点不返回短路后的值，只返回存储值与来源 | server/routes/admin.js:41-44 注释 |

### 1.4 领域对象总览

本域**无聚合根**（PRD §6.1）：AppSetting 为键值型单例值对象，无一致性边界诉求。

| 对象 | 分类 | 存储 | 字段 |
|------|------|------|------|
| AppSetting·注册开关 | 值对象（单例文档） | 集合 `app_settings`，`_id='registration'` | `registrationOpen`(布尔)、`updatedAt`(epoch ms)、`updatedBy`(操作管理员用户名，可为 null) |
| 生效视图（source/envDefault） | 过程数据（P2） | 不持久化 | 读取时派生（admin.js:45-63） |

无子流程（导入脚本的 I/O 契约见 PRD §6.3，非 HTTP 面）。

### 1.5 上下文映射

| 外部上下文 | 集成关系 | 映射模式 |
|-----------|---------|---------|
| S-01 账号与准入 | `/api/auth/status`、`/register` 每次读取生效值（PL：消费方仅依赖「生效布尔值」，不感知存储细节） | PL |
| D-01 权限与用户治理 | 两端点挂 admin 路由，复用其 requireAuth/requireAdmin 链 | 遵奉者 |
| S-02/S-03 | 预置导入脚本的写入目标（configurations），本档不展开 | 引用 |
| 部署面 | app_settings ∈ 备份集合（backup.js:25），sessions 故意排除 | 运维约定 |

## 2. 跨聚合根设计

不适用——无聚合根（见 1.4）。

## 3. 应用/基础设施层设计

### 3.1 接口规范

| 项 | 规范 |
|----|------|
| 路径格式 | `/api/admin/settings/registration`（挂载前缀 `/api/admin`，位于 D-01 同一路由工厂内） |
| HTTP 方法 | GET（读生效值与来源）/ PUT（upsert 写入） |
| 响应包络 | 成功 `{success:true, data}`；失败 `{success:false, message}`（同 D-01 错误体，无 `code` 字段，admin.js:13-19） |
| 认证与守卫 | 同 D-01：`router.use(requireAuth, requireAdmin)`（admin.js:39）——匿名 401 `Authentication required`、非 admin 403 `Admin access required` |
| 时间戳 | epoch 毫秒 |
| 幂等性 | PUT 幂等（`updateOne + upsert:true` 重复写同值无副作用，admin.js:84-88） |

### 3.2 依赖与约束

| 依赖 | 说明 |
|------|------|
| 集合 `app_settings` | server/index.js:87 创建句柄；无索引（单例固定 `_id` 天然唯一，DS-1） |
| env `ALLOW_REGISTRATION` | `'true'/'1'`（大小写不敏感）解析为 true，其余为 false（authPolicy.js:6-9） |
| S-01 校验链 | requireAuth/requireAdmin 由 index.js:131-139 注入同一中间件实例 |

### 3.3 权限模型

| 角色 | GET settings/registration | PUT settings/registration | `/api/auth/status` |
|------|--------------------------|--------------------------|--------------------|
| admin | ✅ | ✅ | ✅（公开） |
| 注册用户 | ❌ 403 | ❌ 403 | ✅（公开） |
| 访客 | ❌ 401 | ❌ 401 | ✅（公开） |

### 3.4 公共规范

- **生效判定**（消费方实现，authPolicy.js:11-23）：`userCount===0` → `true`（短路）；否则 `adminSetting !== undefined` → `Boolean(adminSetting)`；否则 env 解析值。
- 枚举定义（已入池，引用 workspace/01-solution/common-spec/enum-pool.md，编号如下）：
  - `source`: EP-IDENT-04——`admin`（app_settings 已有 registration 文档）/ `env`（从未写过）
  - `registrationOpen`: EP-IDENT-02——`true` / `false`

## 4. 聚合根详细设计（无聚合根模块的接口归档）

### 4.1 领域模型（值对象字段）

```
app_settings 文档（单例）：
{
  _id: 'registration',        // 固定字符串（REGISTRATION_SETTING_ID，authPolicy.js:4）
  registrationOpen: <bool>,   // 管理侧写入值
  updatedAt: <epoch ms>,
  updatedBy: <username|null>  // PUT 时的 req.user.username（admin.js:83）
}
```

不变量：INV-1 同一 `_id` 至多一份文档（固定 `_id` + upsert 天然保证，免索引）。

### 4.2 状态模型

不适用——两态值，无流转。

### 4.3 子流程设计

不适用（HTTP 面）。预置导入 CLI 子流程契约见 D-02 PRD §6.3/FR-2。

### 4.4 接口设计

#### 4.4.1 接口清单

| # | 方法 | 路径 | 说明 | 代码 |
|---|------|------|------|------|
| S1 | GET | `/api/admin/settings/registration` | 读存储值 + 来源标记 | admin.js:65-74 |
| S2 | PUT | `/api/admin/settings/registration` | upsert 写入（admin 侧持久化） | admin.js:76-102 |

#### 4.4.2 接口详情

**S1 `GET /api/admin/settings/registration`**

- 请求：无参数。
- 逻辑：`appSettings.findOne({_id:'registration'})` → `toRegistrationPayload`（admin.js:45-63）：
  - 无文档：`{registrationOpen: envDefault, source:'env', envDefault, updatedAt:null, updatedBy:null}`；
  - 有文档：`{registrationOpen: Boolean(doc.registrationOpen), source:'admin', envDefault, updatedAt, updatedBy}`。
- 响应 200：`{success:true, data: <上述载荷>}`。
- 规则：不反映首用户短路（DS-5）——空库时实际注册仍开放，但本端点照实返回存储/回落值。

**S2 `PUT /api/admin/settings/registration`**

- 请求 body：`{registrationOpen: boolean}`；非 boolean → 400 `registrationOpen must be a boolean`（admin.js:78-81）。
- 逻辑：`updatedAt = Date.now()`；`updatedBy = req.user?.username ?? null`；`appSettings.updateOne({_id:'registration'}, {$set:{registrationOpen, updatedAt, updatedBy}}, {upsert:true})`（admin.js:82-88）。
- 响应 200：`{success:true, data:{registrationOpen, source:'admin', envDefault, updatedAt, updatedBy}}`。
- 幂等：重复 PUT 同值无副作用；写后 env 失效（DS-2）。

#### 4.4.3 消费端（读取通道，归 S-01 上下文引用）

| 端点 | 逻辑 | 代码 |
|------|------|------|
| `GET /api/auth/status` | `registrationState()`：`Promise.all([users.countDocuments(), appSettings.findOne({_id:'registration'})])` → `{hasUsers, registrationOpen}`（生效值含首用户短路） | auth.js:35-63 |
| `POST /api/auth/register` | 共享同一 `registrationState()` 快照；关闭时 403 `Registration is closed`；首注册用户 role='admin' | auth.js:65-113 |

#### 4.4.4 校验规则汇总

| 规则 | 端点 | 错误 |
|------|------|------|
| body.registrationOpen 必须为 boolean | S2 | 400 |
| 仅 admin（requireAuth+requireAdmin） | S1/S2 | 401/403 |
| env 解析 `'true'/'1'`（大小写不敏感），非法/未设视为 false | S1/消费端 | — |

### 4.5 领域事件与集成

无领域事件（写设置不广播 SSE——注册面客户端下次请求 status 时自然读到新值）。集成面：备份（app_settings ∈ `COLLECTIONS = ['configurations','users','match_logs','app_settings']`，backup.js:25，`bun test server/` 的 backup 套件断言「含 app_settings、不含 sessions」）；恢复副本若缺 registration 文档则静默回落 env（PRD FR-1）。

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 形态 | 消费方 |
|------|------|--------|
| S1/S2 settings/registration | HTTP | 管理页注册准入开关（src/AdminPage.jsx:391-396，经 adminService.js:63-87） |
| 生效判定 `isRegistrationOpen` | 进程内导出 | S-01 auth 路由（auth.js:48-52） |
| `REGISTRATION_SETTING_ID` / `parseAllowRegistration` | 进程内导出 | D-01 admin 路由、S-01 auth 路由 |

### 5.2 SQL/集合清单（MongoDB，无 SQL）

| 集合 | 操作 | 说明 |
|------|------|------|
| app_settings | findOne({_id})、updateOne($set, upsert) | 本模块专属集合；纳入备份；无索引 |
| users | countDocuments() | 消费端短路判定（S-01 上下文） |

### 5.3 DDL

不建索引、不建集合（首写时 MongoDB 隐式建集合）。DS-1：固定字符串 `_id` 天然唯一免索引（authPolicy.js:1-4 注释、index.js:84-87 注释）。

## 6. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档初稿：app_settings 单文档模式 + 注册开关读写两端点 + 消费端读取通道；预置导入 CLI 按任务范围仅在边界标注（规格见 PRD FR-2）。验证：`bun test server/` 85 pass / 0 fail（本归档会话执行） |
