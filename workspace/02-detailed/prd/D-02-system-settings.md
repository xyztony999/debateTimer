# PRD — 系统配置（D-02）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-11-11 |
| 模块编码 | D-02（基础数据域，无子模块） |
| 状态 | 逆向归档（系统已上线，如实反映现有实现） |
| 关联 | S-01 账号与准入（注册开关的业务消费方）、D-01 权限与用户治理（设置读写通道挂 admin 路由）、S-02 赛制模板管理 / S-03 模板广场（预置导入的写入目标） |
| 实现索引 | server/lib/authPolicy.js、server/routes/admin.js:41-102、server/routes/auth.js:35-54、server/index.js:87、server/scripts/backup.js、server/scripts/import-configurations.js |

## 1. 业务目标与范围

### 1.1 业务目标（G1）

承载 BA 范围外的系统级配置两件事：**① 系统级设置的持久化存储**——`app_settings` 单文档模式，当前唯一实例为「注册开放开关」（管理侧持久化，重启与备份恢复后保持）；**② 预置赛制批量导入**——服务端 CLI 脚本把预置样例赛制（UOMDC/BP/奥瑞冈等）批量灌入库并可直接发布到模板广场，供新部署开箱即用（FL 2.3.2.2）。

### 1.2 功能范围（G2）

**做什么**：
- app_settings 单文档存储模式：固定字符串 `_id` 的单例文档，天然唯一（无需索引）、非 24-hex 可在备份往返中按普通字符串存活（server/lib/authPolicy.js:1-4 注释）
- 注册开关读写通道：`GET/PUT /api/admin/settings/registration`（挂 D-01 admin 路由）；PUT 校验 boolean、upsert 写入 `{registrationOpen, updatedAt, updatedBy}`；GET 返回 `{registrationOpen, source: admin|env, envDefault, updatedAt, updatedBy}`（server/routes/admin.js:41-102）
- 回落语义：管理员从未写过时按 env `ALLOW_REGISTRATION`（默认关闭）；写过之后 DB 值优先，env 仅作紧急开关（删 app_settings 的 registration 文档可恢复 env 语义，server/.env.example 注释）
- 备份容错：app_settings 纳入备份集合清单，恢复副本必须保留开关，否则静默回落 env（server/scripts/backup.js COLLECTIONS 及注释）
- 预置导入脚本：`node scripts/import-configurations.js --file <export.json> --owner <username> [--dry-run] [--force] [--public]`，支持 4 种 JSON/NDJSON 导入格式，同名模板默认跳过、`--force` 覆盖（保留原 `_id` 与 createdAt），`--public` 直接发布到广场（server/scripts/import-configurations.js:12-35, 89-183）

**不做什么**：
- 不定义注册准入的业务规则——「何时允许注册、首用户短路、关闭时访客提示」归 S-01-03（本模块只提供存储与读写通道）
- 不做设置项的通用管理界面（当前唯一设置项的开关 UI 归管理页，FL 2.3.1.1）
- 不做运行时热加载/多设置项注册框架（新增设置项 = 新增一个单例文档与读写端点）
- 导入脚本不做 schema 演进迁移以外的数据清洗（老 schema 由 parse/migrate 链路归一化）

### 1.3 决策记录（现有实现的关键取舍）

| # | 决策 | 依据（代码注释/实现） |
|---|------|---------------------|
| DS-1 | 单文档固定字符串 `_id`（如 `'registration'`）而非配置表 | 天然唯一免索引；非 24-hex 备份往返存活（server/lib/authPolicy.js:1-4） |
| DS-2 | env 是回落不是覆盖：admin 写过之后 env 失效，可删文档恢复 | server/lib/authPolicy.js:17-22；.env.example 紧急开关说明 |
| DS-3 | `/api/auth/status` 与 `/register` 共享同一次读取的快照（userCount + setting 并行读），首用户角色判定与开关不会互相矛盾 | server/routes/auth.js:35-54 注释 |
| DS-4 | 首用户短路优先于一切：空库时永远开放注册，防止陈旧「关闭」文档锁死新部署 | server/lib/authPolicy.js:12-16 注释 |
| DS-5 | 导入脚本自建索引（ownerId+name 唯一、updatedAt 降序）并总是关闭连接（防 CI 挂起） | server/scripts/import-configurations.js:175-181 注释 |

## 2. 角色与对象

- **角色（G3）**：管理员（设置读写与预置导入的操作者，导入脚本以既有账号 `--owner` 落归属）；访客/注册用户为注册开关的间接受影响方（语义归 S-01）。
- **领域对象（G4/G5）**：AppSetting 单例文档（键值型设置项，按固定 `_id` 定位）；导入脚本产出的 Configuration 归 S-02/S-03。详见 §6。

## 3. 功能需求

### FR-1 注册开关设置存储（app_settings 单例）

- 文档形如 `{_id: 'registration', registrationOpen: boolean, updatedAt, updatedBy}`，`updatedBy` 取操作管理员用户名（server/routes/admin.js:82-87）
- 写入：`PUT /api/admin/settings/registration`，body 非 boolean 400；`updateOne + upsert`（server/routes/admin.js:76-102）
- 读取：`GET /api/admin/settings/registration` 返回生效值 + 来源标记（`source: 'admin' | 'env'`）+ env 默认值 + 审计字段（server/routes/admin.js:45-74）
- 生效判定（消费方实现，归属 S-01 语义）：`userCount===0` 短路开放 → DB 值优先 → env 回落（server/lib/authPolicy.js:11-23）
- 备份：app_settings ∈ COLLECTIONS；sessions 故意排除（server/scripts/backup.js）

### FR-2 预置赛制批量导入（服务端脚本）

- 入参：`--file`（必填，JSON/NDJSON）、`--owner`（非 dry-run 必填，须为已存在账号，否则报错提示先建号）、`--dry-run`（仅解析预览）、`--force`（同名覆盖）、`--public`（导入即发布广场）（server/scripts/import-configurations.js:12-79, 135-140）
- 支持格式：① `{"configurations": {名: 字段}}` 包装 ② 顶层层对象 ③ 文档数组 ④ NDJSON——由 parseConfigExport 统一归一化（server/scripts/import-configurations.js:29-34、scripts/lib/parseConfigExport.js）
- 落库字段：ownerId/name/schemaVersion(默认 2)/debateStages/timerSettings/stageOrder/stageLabels/stageGrace?/stageAutoAdvance?/teamNames?/shareToken=null/shareEnabled=false/isPublic（server/scripts/import-configurations.js:89-111）
- 冲突策略：同 owner 同名默认跳过并提示；`--force` 时 replaceOne 保留原 `_id` 与 createdAt（server/scripts/import-configurations.js:147-173）
- 收尾：建 `ownerId+name` 唯一索引与 `updatedAt` 降序索引；输出 inserted/updated/skipped 统计；finally 关闭 Mongo 连接（server/scripts/import-configurations.js:175-183）

## 4. 非功能需求（N1）

- 设置读取路径在 `/api/auth/status` 每请求一次（并行 count + findOne），量级无压力
- 备份轮转 14 天（KEEP_DAYS），设置随备份恢复不丢
- 导入脚本为离线运维操作，无并发诉求；执行时长以模板数量十级计

## 5. 验收标准

1. 管理员从未写开关时 `GET settings/registration` 返回 `source:'env'`；写入后返回 `source:'admin'` 且值持久（重启后保持）（server/routes/adminRoutes.test.js、server/lib/auth.test.js 覆盖，`bun test server/` 85 pass，2026-11-11 执行）
2. 空库（无用户）时无论开关/环境变量如何，注册始终开放（首用户短路）
3. `bun test` 中 backup 套件断言「COLLECTIONS 含 app_settings、不含 volatile sessions」（server/scripts/backup.test.js，已随上述套件通过）
4. 导入脚本：`--dry-run` 零写入；同名无 `--force` 跳过；`--force` 覆盖后 `_id`/createdAt 不变；`--public` 导入项 isPublic=true（脚本逻辑为现有实现；本归档会话未实际连库执行）
5. 管理页开关：PUT 成功后开关态更新、失败回弹（e2e/registration-toggle.e2e.js:27 既有规格；本归档会话未运行 Playwright）

## 6. 领域建模（D2-2）

### 6.1 本域信息

| 项目 | 内容 |
|------|------|
| 本域名称 | 系统配置（D-02） |
| 领域分层 | 基础数据域（AA v1.0：系统级引用数据与治理，无业务状态机，薄适配） |
| 聚合根 | 无（AppSetting 为键值单例值对象集合，无一致性边界诉求） |

### 6.2 领域对象清单

| 对象名 | 分类 | 与上级关系 | 核心业务字段 | 关键枚举字段 | 备注 |
|--------|------|-----------|------------|------------|------|
| AppSetting·注册开关 | 值对象（单例文档） | — | registrationOpen / updatedAt / updatedBy | registrationOpen: true / false | 固定 `_id='registration'`；source(env/admin) 为读取时派生 |
| 导入任务 | 子流程（运维脚本型） | 输入文件 + owner → 批量 Configuration | 见 FR-2 字段清单 | — | 一次性批处理，无持久化过程数据 |

### 6.3 子流程 I/O 契约

| 子流程 | 触发条件 | 输入 | 输出 | 输出写入 |
|--------|---------|------|------|---------|
| 预置赛制导入 | 运维手动执行 CLI | 导出文件（4 种格式）+ 归属账号 + dry-run/force/public 开关 | 标准化 Configuration 文档批次 + inserted/updated/skipped 统计 | S-02 configurations 集合（isPublic=true 时同时进入 S-03 广场可见集） |

### 6.4 关联领域对象

| 关联领域对象 | 所属业务域 | 关联字段 | 需获取信息 | 触发关系 | 映射模式 |
|------------|--------|---------|----------|---------|---------|
| User（账号） | S-01 账号与准入 | `_id`（owner）/ `updatedBy`(用户名) | 用户存在性、用户名 | 导入归属校验；开关审计字段 | 遵奉者 |
| Configuration（赛制模板） | S-02 赛制模板管理 | ownerId / name | 落库字段约定与索引 | 导入子流程批量写入 | OHS（复用 S-02 文档结构与唯一索引约定） |
| 注册准入判定 | S-01 账号与准入（S-01-03） | `setting.registrationOpen` | 生效布尔值 | 每次注册相关请求读取 | PL（读取方仅依赖「生效布尔值」这一发布契约，不感知存储细节） |

### 6.5 过程数据分类表

| 数据项 | 类别 | 处理方式 |
|--------|------|---------|
| env 默认值（ALLOW_REGISTRATION 及限流等 env） | P7 计算中间值 | 读取时解析，不持久化 |
| source/envDefault 派生字段 | P2 展示数据 | 响应时计算 |
| CLI 参数与导入统计（inserted/updated/skipped） | P4 请求/响应结构 | 控制台输出，不落库 |
| 导入文件解析中间结构 | P7 计算中间值 | 解析后即弃 |

## 7. PRD 完备性检查（D2-1）

功能类型：**主数据（系统设置）+ 工具（批量导入脚本）**

| 层 | 检查项 | 结果 | 依据 |
|----|--------|------|------|
| G1 | 业务目标 | ✅ | §1.1 |
| G2 | 功能范围 | ✅ | §1.2 |
| G3 | 角色定义 | ✅ | §2 |
| G4 | 领域对象 | ✅ | §6.2 |
| G5 | 对象关系 | ✅ | §6.3/§6.4 |
| T1 | 业务字段 | ✅ | §6.2/FR-2 字段清单 |
| T1a | 被引用关系 | ✅ | 注册开关被 S-01 每次注册请求读取 |
| T2/T3/T4/T5 | 流程/审批/筛选/导出 | 不适用 | 设置为两态值；导入为一次性脚本 |
| T6 | 对接系统 | 不适用 | 无外部系统（文件导入非系统对接） |
| T7 | 数据映射 | ✅（导入格式归一化） | FR-2 四种格式 → 标准文档 |
| T8 | 幂等策略 | ✅ | 同名跳过 / `--force` 覆盖（保留 _id/createdAt） |
| T9 | 输入输出规格 | ✅ | FR-2 CLI 参数与统计输出 |
| N1 | 非功能 | ✅ | §4 |
| N2 | 异常场景 | ✅ | owner 不存在、格式非法、连接兜底关闭 |
| N3 | 业务规则细节 | ✅ | §1.3 回落/短路/备份规则 |
| N4 | 历史需求 | ⚠️ 部分 | 开关有 updatedAt/updatedBy；无完整变更历史 |

**结论**：通过（G 全过、适用 T 项全过、N4 为建议项），可进入 D3 API 设计（设置读写两端点 + 导入脚本说明）。

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.0 | 2026-11-11 | 逆向归档初稿：按 D2 分册模板从现有实现（app_settings 单文档模式、import-configurations 脚本）归纳生成 |
