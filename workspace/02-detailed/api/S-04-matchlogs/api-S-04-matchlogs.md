# S-04 比赛记录与复盘 API 设计

| 属性 | 值 |
|------|-----|
| 模块编码 | S-04（应用域：支撑业务域） |
| 文档性质 | 逆向归档：系统已上线，本文档如实反映现有实现（路径/状态码/错误文案均为现网事实，非理想化重设计） |
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 功能类型 | 台账报表类（聚合根=比赛记录；过程台账：采集入保存、查询/导出/删除；append-only 无更新、无状态流转） |
| 管理模式 | MIXED（记录本体自管：登录者保存即写入；管理员 `?ownerId=` 代读为托管侧治理语义——读写权限不对称，删除仍仅属主；权限管控替代模式字段） |
| 上游依据 | S-04 PRD v1.0；BA v1.0 §2.3.1；AA v1.0 §2.2.4；FL v1.0 §2.1.2.1 / §2.2.1.4 |
| 实现锚点 | `server/routes/matchLogs.js`、`server/lib/matchLogs.js`、`server/lib/authPolicy.js:25-30`、`src/utils/matchRecordCsv.js`（CSV 客户端组装）、`src/services/GalleryService.js`（无涉）、`server/index.js:117,130`（索引/挂载） |

## 1. 模块设计概述

### 1.1 业务背景及目标

比赛结束后要回答「实际用时和计划差多少、哪方超时几次」。本模块把 C-01 计时过程沉淀为可复盘数据资产：客户端逐阶段自动采集（计划 vs 实际、正反分开、超时次数），手动按钮/控制会话结束两个触发点保存快照；服务端提供保存、列表、明细、删除与 JSON 导出；CSV 由客户端组装。

核心语义是**快照**：模板按名留痕（无模板 ID 外键）、队名与逐阶段计划值在保存时刻完整复制，模板后续变更不影响历史记录。

### 1.2 边界说明

| 方向 | 内容 |
|------|------|
| 做什么 | 记录保存（服务端校验/限额/汇总重算）、列表（游标分页+admin 代读）、明细、删除（仅属主）、JSON 附件导出；CSV 导出的客户端组装约定 |
| 不做什么 | 记录编辑/补录（**append-only，服务端无更新路径**，`server/lib/matchLogs.js:34-38` 注释原义）；跨记录统计报表；分享/协作；回收站（物理删除）；服务端 CSV 组装（BD-6 决策）；自动周期保存；采集过程本身（客户端 matchCapture 纯函数，随载荷一次性入库） |
| 边界注记 | 采集子流程（S-04-01）运行于前端计时引擎，无服务端接口面；本档仅约定其产出的载荷契约（§4.3/§4.4 ML-SAVE） |

### 1.3 设计决策

| # | 决策 | 理由（实现注释原义） |
|---|------|---------------------|
| D1 | append-only：只有 insert 与 delete，无 update（`server/lib/matchLogs.js:34-38`） | 记录即历史资产；复盘发现误差只能删了重采 |
| D2 | 模板按名留痕：仅存 `configName` 字符串与内容副本，无模板 ID 外键 | 模板改名/改配置/删除均不影响既有记录（快照防腐） |
| D3 | 服务端汇总重算：totalPlannedSeconds/totalActualSeconds/overrunCount 由逐阶段数据累加，不采信客户端上传值（`server/lib/matchLogs.js:82-113,123-127`） | 汇总是派生数据，单一事实源在服务端 |
| D4 | 写自属/读隔离/删属主的非对称权限：保存 ownerId 恒取当前登录者；非 admin 查询层强制拼 ownerId；admin 可代读但删除他人 403（`server/routes/matchLogs.js:21-33,41-46,131-134`） | 治理可见不可篡改 |
| D5 | 404 统一语义：非法 id、不存在、非本人记录一律 404 `Match record not found`（`server/routes/matchLogs.js:37-40,48-52`） | 不区分越权与不存在，不泄露记录存在性 |
| D6 | 阶段数 >64 截断入库并标 `truncated:true`（不拒绝）；整体载荷 >64KB 才 400（`server/lib/matchLogs.js:2-3,75-80,131-133`） | 超长比赛降级可用而非失败 |
| D7 | JSON 附件服务端直出（nosniff + attachment）；CSV 客户端组装（BD-6：服务器绝不组装用户来源文本）（`server/routes/matchLogs.js:96-97` 注释原义） | 防服务端注入面；Excel 中文兼容由 BOM+公式防护在客户端保证 |
| D8 | endedAt ≤ 服务器时间+60s 容差（`server/lib/matchLogs.js:49-52`） | 设备时钟略快不误伤；防未来时间伪造 |

### 1.4 领域对象总览

| 对象 | 分类 | 说明 |
|------|------|------|
| 比赛记录（MatchRecord） | 聚合根 | match_logs 集合；全局 ObjectId；append-only |
| 阶段实绩条目（StageEntry） | 域内对象·值对象 | 内嵌数组元素：stageId/label/mode/planned/grace/actual 双方/overrun 双方/enteredAt/exitedAt；快照值等价 |
| 服务端汇总（summary） | 域内对象·值对象 | `{totalPlannedSeconds,totalActualSeconds,overrunCount}`，服务端重算 |
| 采集缓冲（Capture） | 过程数据（P7/P2） | 客户端 ref + sessionStorage 镜像（键 `timer.matchCapture.v1`）；不落服务端，保存时闭合转载荷 |
| 列表游标（nextBefore） | 过程数据（P4） | savedAt 游标分页载体 |

子流程：实绩自动采集（S-04-01，客户端纯函数，I/O 契约见 §4.3）。

### 1.5 上下文映射

| 外部上下文 | 关系 | 映射模式 |
|-----------|------|---------|
| S-01 账号与准入 | 整路由 requireAuth；ownerId 恒取登录者；admin 代读 | 共享内核（ownerId 语义全域一致） |
| S-02 赛制模板管理 | 保存时复制 configName + 队名 + 阶段计划值为快照 | ACL（快照即防腐：不回读、无外键） |
| C-01 比赛计时 | 采集输入=引擎各边 {remaining, graceLeft, locked} + 阶段元数据 | ACL（采集端把引擎读数翻译为实际用时/超时次数业务语义） |
| C-02 大屏同步 | 控制会话结束（操作员停止）触发自动保存一次（客户端去重） | 发布语言（停止动作的服务端确认信号） |

## 2. 跨聚合根设计（裁剪：不适用）

单一聚合根（比赛记录），域内对象全部内嵌，无跨聚合根约束/编排。与 S-02 模板的关系是保存时刻的单向快照复制（1.5 ACL），非跨根一致性约束。

## 3. 应用/基础设施层设计

### 3.1 接口规范

- 前缀与挂载：`/api/match-logs`（`server/index.js:130`），工厂注入 `{matchLogs, requireAuth}`。
- 全路由鉴权：`router.use(requireAuth)`（`server/routes/matchLogs.js:10-11`）——无匿名访问面。
- 路径风格：`/domain`（保存 POST/列表 GET）、`/domain/:id`（明细/删除）、`/domain/:id/export`（导出动作）三段混用，如实归档；路由注册顺序 export 在 `:id` 之前（`server/routes/matchLogs.js:98,113`），不会被 id 捕获。
- ownerId 传参约定：`?ownerId=` 查询参数（仅 admin 生效，非 admin 传入被忽略、恒查本人——与 S-02 的 403 显式拒绝不同，如实归档，`server/routes/matchLogs.js:23-25`）。
- 响应包络：`{success:true, data}` / `{success:false, message}`；无 code 字段。
- 分页约定：`?before=<savedAt epoch-ms>` + `nextBefore` 响应，默认 20、上限 100。

### 3.2 依赖与约束

| 依赖 | 类型 | 约束 |
|------|------|------|
| match_logs 集合 | 存储 | 索引 `(ownerId, savedAt:-1)`（`server/index.js:117`） |
| matchLogs 库 | 校验/投影 | buildMatchRecord / toListItem / toDetail / exportFilename（`server/lib/matchLogs.js`） |
| parseObjectId / resolveOwnerId | 库 | id 与 ownerId 解析 |
| requireAuth | 中间件 | 全路由 |
| express.json 1MB | 全局 | 单条记录上限 64KB（库内校验），请求体全局上限 1MB（`server/index.js:45`） |

### 3.3 权限模型

| 操作 | 注册用户 | 管理员 |
|------|---------|--------|
| ML-SAVE | ✓（ownerId 恒=本人，请求体无 ownerId 字段） | ✓（同左——管理员保存也归自己名下） |
| ML-LIST | 本人（查询层强制 ownerId 条件） | 本人；`?ownerId=` 代读任意用户（非法值 400） |
| ML-DETAIL / ML-EXPORT | 仅本人（非 admin 查询即拼 ownerId） | 任意（含他人；`{ _id }` 无 ownerId 条件） |
| ML-DELETE | 仅本人 | 仅本人记录；删他人记录 403（读写不对称，D4） |

数据权限规则：非 admin 的隔离在**查询层**完成（`{_id, ownerId}` 复合条件，非查后过滤，`server/routes/matchLogs.js:41-46` 注释原义「no cross-tenant reads, even before the ownership check」）。

### 3.4 公共规范

**错误码语义表**（本路由全量）：

| HTTP | 触发 | message（示例） | 锚点 |
|------|------|----------------|------|
| 400 | 载荷字段校验失败 | `configName must be a string of 1-100 characters`、`stages[3].mode is invalid`、`endedAt cannot be in the future`、`Match record payload too large (>64KB)` 等 | `server/lib/matchLogs.js:39-135` |
| 400 | admin 传非法 ?ownerId | `Invalid owner` | `server/routes/matchLogs.js:26-31` |
| 401 | 未登录 | `Authentication required` | `server/lib/authMiddleware.js:36-49` |
| 403 | 删除他人记录（含 admin） | `Cannot delete another user's match record` | `server/routes/matchLogs.js:131-134` |
| 404 | 非法 id / 不存在 / 非本人记录（统一） | `Match record not found` | `server/routes/matchLogs.js:37-40,48-52` |
| 500 | 服务端异常 | error.message | `server/routes/matchLogs.js:13-19` |

**枚举定义**（已登记入池 enum-pool.md，编号如下）：

| 枚举 | 池编号 | 值 | 说明 |
|------|-----|------|------|
| stageTimingMode | EP-TIMER-01 | `single` / `double` / `free` | 逐阶段快照 mode；校验严格枚举无遗留归一（`server/lib/matchLogs.js:1,89-92`） |
| recordSide | EP-TIMER-04（取值子集 aff/neg） | aff / neg | 正方/反方（actualAffSeconds/actualNegSeconds 等字段词根；单计时记录反方恒 0） |

**配置项**：无模块专属 env（限额/分页为代码常量 DEFAULT_LIMIT=20、MAX_LIMIT=100、MAX_STAGES=64、MAX_RECORD_BYTES=64KB）。

## 4. 聚合根详细设计

### 4.1 领域模型

**管理模式声明**：MIXED——记录本体自管（登录者保存即写入，append-only）；admin 代读为托管侧治理面（无独立数据，权限管控实现）。

**表结构组合**（match_logs 集合单文档内嵌）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| _id / ownerId | ObjectId | ownerId=保存时刻登录者，不可指定 | 归属与删除依据 |
| configName | string | 1–100 | 模板名快照（无模板 ID） |
| teamNames | `{aff?,neg?}` | 各 ≤20，空值剔除；全空则字段不存在 | 队名快照 |
| startedAt / endedAt | epoch-ms 整数 | ≥0；endedAt≥startedAt；endedAt≤now+60s | 比赛起止 |
| savedAt | epoch-ms | 服务端生成（Date.now()） | 列表排序与游标 |
| stages[] | StageEntry 数组 | >64 截断至 64 + truncated | 逐阶段快照（§4.3 条目结构） |
| summary | `{totalPlannedSeconds, totalActualSeconds, overrunCount}` | 服务端重算 | 汇总 |
| truncated | boolean | 仅截断时存在 | 截断标记 |

StageEntry（内嵌值对象）字段与约束：

| 字段 | 约束 | 缺省 |
|------|------|------|
| stageId | string 1–64 | 必填 |
| label | string 1–100 | 必填（保存时刻当前语言显示名） |
| mode | stageTimingMode 枚举 | 必填 |
| plannedSeconds | 整数 1–3600 | 必填 |
| graceSeconds | 整数 0–300 | 0 |
| actualAffSeconds / actualNegSeconds | 整数 0–86400 | 0 |
| overrunAff / overrunNeg | 整数 0–99 | 0 |
| enteredAt | epoch-ms 整数 | 必填 |
| exitedAt | epoch-ms 或 null；≥ enteredAt | 可 null（未闭合条目） |

**不变量**：

| # | 不变量 | 强制点 |
|---|--------|--------|
| I1 | 只增不改：无 update 路径 | 代码仅 insertOne/deleteOne（`server/routes/matchLogs.js:58,135`） |
| I2 | ownerId 恒=保存时刻登录者 | `parseObjectId(req.user.id)`（`server/routes/matchLogs.js:57`） |
| I3 | summary = Σ stages（planned、actual 双方、overrun 双方） | 服务端累加（`server/lib/matchLogs.js:109-111`） |
| I4 | 记录不引用模板 ID | 文档结构无外键字段（D2） |
| I5 | stages ≤64；载荷 ≤64KB（JSON.stringify 长度） | `server/lib/matchLogs.js:75-80,131-133` |
| I6 | exitedAt ≥ enteredAt（非 null 时） | `server/lib/matchLogs.js:106-108` |

**领域服务**（matchLogs 库）：buildMatchRecord(body, ownerId)→doc｜throw 400；toListItem(doc)→VO；toDetail(doc)→VO；exportFilename(doc, format)→安全文件名。业务常量：STAGE_MODES、MAX_STAGES=64、MAX_RECORD_BYTES=64KB。标签池：无。

### 4.2 状态模型

记录为**无状态单据**（台账类；append-only，无草稿/生效等生命周期，无驳回/撤回，无状态历史——记录本身即历史）。过程态在客户端采集缓冲（非服务端状态机）：

```
比赛开始(首阶段切入) → 采集缓冲建立,逐阶段开条目/闭合结算
  ├─ 手动保存(次数不限,缓冲保留可再存) ─┐
  ├─ 控制会话结束 → 自动保存一次(去重)  ├→ POST /api/match-logs 建记录
  └─ 页面刷新 → 同模板恢复缓冲续采      ┘
```

### 4.3 子流程设计：实绩自动采集（S-04-01，客户端子流程）

| 项 | 内容 |
|----|------|
| 触发 | C-01 阶段切入/切出、保存动作、超时铃事件 |
| 输入 | 引擎各边 {remaining, graceLeft, locked} + 阶段元数据（stageId/显示名/mode/planned/grace） |
| 结算公式 | `实际用时 = max(0, 计划−剩余) + (宽限−剩余宽限)`，下限 0；双计时正反分别结算（locked 时剩余宽限按 0）；单计时映射正方、反方恒 0；超时铃仅对「当前未闭合且阶段匹配」条目对应方 +1 |
| 输出 | 采集缓冲条目（未闭合 enteredAt=null exitedAt；闭合后写入 actuals+exitedAt，已闭合条目幂等不重复闭合）；空采集时 buildMatchPayload 返回 null、保存静默跳过 |
| 输出写入 | 客户端 ref + sessionStorage 镜像；仅随 ML-SAVE 载荷入库，服务端无采集接口面 |

（服务端仅消费其终态载荷；契约即 §4.1 StageEntry 结构与 §4.4 ML-SAVE 校验。客户端锚点：`src/timer/matchCapture.js:14-94`，公式与闭合规则经 PRD §5.2 核对。）

### 4.4 接口设计

**接口清单**（全部 requireAuth）：

| # | 编码 | 方法 | 路径 | 鉴权/权限 | 用户类型 | 说明 |
|---|------|------|------|----------|---------|------|
| 1 | ML-SAVE | POST | `/api/match-logs` | 登录（写自属） | 计时操作员（已登录） | 保存记录（服务端校验/汇总） |
| 2 | ML-LIST | GET | `/api/match-logs` | 登录（?ownerId 仅 admin 代读） | 注册用户/管理员/计时操作员 | 游标分页列表 |
| 3 | ML-EXPORT | GET | `/api/match-logs/:id/export` | 登录属主（admin 可代读） | 同上 | JSON 附件导出 |
| 4 | ML-DETAIL | GET | `/api/match-logs/:id` | 同 ML-EXPORT | 同上 | 记录明细（CSV 组装源） |
| 5 | ML-DELETE | DELETE | `/api/match-logs/:id` | 登录**属主**（admin 删他人 403） | 注册用户/管理员 | 物理删除 |

动作接口：export（GET 动作子资源）。服务依赖清单：matchLogs 库、parseObjectId、resolveOwnerId、requireAuth。工作流回调/MQ/标签重建：无。

**接口详情**：

#### ML-SAVE — POST /api/match-logs

- 请求体（记录载荷）：`{configName, startedAt, endedAt, teamNames?, stages:[StageEntry…]}`——**无 ownerId 字段**（服务端恒取登录者，I2）。
- 处理：`buildMatchRecord` 全量校验（§3.4 400 表 + §4.1 字段约束；逐条失败即抛，message 指明字段与下标）→ 汇总重算 → insertOne。
- 响应 **200**（**非 201**，如实归档）：`{success:true, data:{id, savedAt, summary}}`。
- 幂等：非幂等——重复提交产生多条记录（客户端自动保存路径有单场去重标志，服务端无去重，PRD §12 如实记录）。
- 锚点：`server/routes/matchLogs.js:55-66`；`server/lib/matchLogs.js:39-135`。

#### ML-LIST — GET /api/match-logs

- 查询参数：`ownerId`（仅 admin 生效代读，非 admin 忽略恒查本人）；`limit`（1–100，缺省 20）；`before`（savedAt epoch-ms 游标，>0 才生效）。
- 查询：`{ownerId, savedAt<before?}`，sort savedAt 降序，limit+1 探页。
- 响应 200：`{success:true, data:{items:[{id,configName,teamNames:{aff?,neg?},startedAt,endedAt,savedAt,stageCount,overrunCount,truncated?}], nextBefore}}`（列表项不含 stages/summary 全量，`server/lib/matchLogs.js:137-149`）。
- 错误：400（admin 传非法 ownerId）；401。
- 锚点：`server/routes/matchLogs.js:68-94`。

#### ML-DETAIL — GET /api/match-logs/:id

- 处理：`findOwned`——非 admin 查询 `{_id, ownerId: 本人}`、admin 查询 `{_id}`；未命中 404 `Match record not found`（非法 id 同 404，D5）。
- 响应 200：`{success:true, data:{id, ownerId, configName, teamNames:{aff?,neg?}, startedAt, endedAt, savedAt, stages:[StageEntry…], summary, truncated?}}`（明细含 ownerId 与 stages 全量，`server/lib/matchLogs.js:151-164`）。
- 锚点：`server/routes/matchLogs.js:113-123`；`server/lib/matchLogs.js:35-53`。

#### ML-EXPORT — GET /api/match-logs/:id/export

- 导出语义（本接口核心）：
  - **仅 JSON 附件**：响应头 `X-Content-Type-Options: nosniff`、`Content-Type: application/json; charset=utf-8`、`Content-Disposition: attachment; filename="<exportFilename>"`；响应体为标准包络 `{success:true, data: toDetail(doc)}`（与 ML-DETAIL 同构，客户端可直接落盘或复用明细渲染）。
  - 文件名规则：`match-YYYYMMDD-HHmm-<configName>`（时间取 startedAt 回落 savedAt）→ 非 `[A-Za-z0-9_.-]` 字符替换 `_` → 截断 80 → `.json`（`server/lib/matchLogs.js:166-172`）。
  - **CSV 不走服务端**：客户端由 ML-DETAIL 响应组装（BOM + 公式防护——首字符 `=+-@\t\r` 加 `'` 前缀 + 引号转义 + CRLF；锚点 `src/utils/matchRecordCsv.js:1-55`）；服务端绝不组装用户来源文本（BD-6，`server/routes/matchLogs.js:96-97` 注释原义）。
- 权限：同 ML-DETAIL（属主/admin 代读）。
- 锚点：`server/routes/matchLogs.js:96-111`。

#### ML-DELETE — DELETE /api/match-logs/:id

- 处理：`findOwned`（admin 可定位任意记录）→ 属主复核 `String(doc.ownerId) !== String(req.user.id)` → 403 `Cannot delete another user's match record` → `deleteOne` 物理删除（无回收站）。
- 响应 200：`{success:true, data:{deleted:true}}`。
- 错误：404（非法 id/不存在）；403（非属主，含 admin 删他人）；401。
- 锚点：`server/routes/matchLogs.js:125-140`。

**跨接口复用规则**：ML-DETAIL 与 ML-EXPORT 共用 findOwned + toDetail（export 仅多三个响应头）；ML-LIST 与 ML-DETAIL 的 ownerId 语义同源（ownerObjectId/findOwned 两处实现，未抽象——如实记录）。**服务方法规格**：buildMatchRecord(body,ownerId)→doc｜throw{status:400}；toListItem/toDetail(doc)→VO；exportFilename(doc,format)→string。**枚举定义**：见 §3.4。

### 4.5 领域事件与集成

- 领域事件/MQ/SSE：无（本模块零广播，如实记录）。
- 仓储契约：match_logs 集合直访 insertOne/find/findOne/deleteOne（无更新）。
- 关联域调用：无服务端调用（采集输入来自前端 C-01 引擎、自动保存触发来自 C-02 会话停止事件，均在客户端接线；`src/timer/useTimerSessionSync.js:412-427`，PRD §5.3 核对）。

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 消费方 |
|------|--------|
| buildMatchRecord 校验/汇总（含 StageEntry 载荷契约） | 前端 matchCapture→保存链路（手动+自动） |
| toListItem / toDetail 投影 | 记录列表页/明细对比页/JSON 导出落盘 |
| CSV 组装约定（BOM+公式防护） | 前端 matchRecordCsv（Excel 中文兼容导出） |
| ownerId 代读语义（?ownerId 仅 admin） | 管理员治理查看（FL D-01 治理面场景） |

### 5.2 SQL 清单

无 SQL（MongoDB）。集合操作清单：

| 集合 | 操作 | 位置 |
|------|------|------|
| match_logs | insertOne / find+sort+limit / findOne / deleteOne | `server/routes/matchLogs.js:57-58,77-81,47,135` |

### 5.3 DDL

无表结构 DDL。索引（`server/index.js:117`）：

```js
matchLogs.createIndex({ ownerId: 1, savedAt: -1 })
```

## 6. 更新记录

**变更类型词汇表**：同引擎分册（initial / interface_added / rule_changed / enum_added 等）。
**版本号规则**：`vMAJOR.MINOR`，接口不兼容变更升 MAJOR。

| 版本 | 日期 | 变更类型 | 变更说明 | 目标节 |
|------|------|---------|---------|--------|
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：5 接口；append-only、快照按名留痕、写自属/读隔离/删属主非对称权限、服务端汇总重算、>64 截断与 64KB 限额、JSON 附件+CSV 客户端组装的导出双轨语义成文 | — |

### 模板符合性自检记录（M1~M5，逆向归档如实记录）

| # | 项 | 结果 |
|---|----|------|
| M1 | 章节结构完整 | ✅（2 章裁剪标注、4.3 为唯一子流程实设，🔒 章节全存在） |
| M2 | 接口路径三段式 | ⚠️ 部分符合：`POST|GET /api/match-logs` 单段（保存/列表），`/:id`、`/:id/export`、`/:id`(DELETE) 符合；已上线事实不改路径 |
| M3 | 枚举引用有定义 | ✅ stageTimingMode（标注与 S-02 同名同值收敛）/ recordSide 本档定义 |
| M4 | 占位符残留 | ✅ 无 |
| M5 | 变更记录含本次更新行 | ✅ §6 initial 行 |
