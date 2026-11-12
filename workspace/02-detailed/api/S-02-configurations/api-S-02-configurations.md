# S-02 赛制模板管理 API 设计

| 属性 | 值 |
|------|-----|
| 模块编码 | S-02（应用域：支撑业务域） |
| 文档性质 | 逆向归档：系统已上线，本文档如实反映现有实现（路径/状态码/错误文案均为现网事实，非理想化重设计） |
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 功能类型 | 主数据类（聚合根=赛制模板，被 C-01/C-02/S-03/S-04 引用；无审批/版本生命周期，保存即生效） |
| 管理模式 | MIXED（模板本体自管：属主 CRUD；管理员经 `?ownerId=` 代管任意用户模板——权限管控替代模式字段；发布标志/署名/复制计数为 S-03 寄居字段，写侧接口在本文档路由上但语义归 S-03） |
| 上游依据 | S-02 PRD v1.0；BA v1.0 §2.1.2；AA v1.0 §2.2.2；FL v1.0 §2.2.1.2 |
| 实现锚点 | `server/routes/configurations.js`、`server/lib/configDocs.js`、`server/lib/authPolicy.js:25-40`（resolveOwnerId/canAccessConfig）、`server/lib/shareToken.js`、`server/lib/sseHub.js`、`server/index.js:107-116`（索引）、`server/index.js:128`（挂载） |

## 1. 模块设计概述

### 1.1 业务背景及目标

一场辩论赛按「赛制模板」推进：阶段序列、时长、计时模式（单/双/自由）、多语言阶段名、宽限与自动推进、队名、PID 呈现装饰。本模块提供模板的 CRUD 与大屏共享凭证管理，是 C-01 计时的直接输入、C-02 协同的快照源、S-03 广场的存储基座、S-04 记录的快照来源名。

### 1.2 边界说明

| 方向 | 内容 |
|------|------|
| 做什么 | 模板列表/详情/保存(upsert)/删除；大屏共享开关联动（token 生成/轮换/会话终止）；SSE 变更订阅；发布标志/署名的写侧接口（POST /:name/visibility，详设归 S-03 档） |
| 不做什么 | 模板导入导出文件、审批、版本历史、协作编辑（PRD §3.2）；广场匿名投影/复制计数/下架（S-03 档）；`/session*` 五端点业务上属 C-02 大屏同步与远程控制（同路由文件，本文档仅列清单标注归属，不展开）；预置批量导入（D-02 脚本）；管理台全量配置治理接口（D-01：`server/routes/admin.js:243-287`） |

### 1.3 设计决策

| # | 决策 | 理由（实现注释原义） |
|---|------|---------------------|
| D1 | 按 `(ownerId, name)` 定位模板而非纯 id；名称经 URL 路径段编码传输 | 用户可直接以名操作；复合唯一索引兜底（`server/index.js:107`） |
| D2 | ownerId 绑定：`resolveOwnerId` 仅 admin 可指定目标属主；非 admin 携带 `?ownerId=` 一律 403（`server/lib/authPolicy.js:25-30`；`server/routes/configurations.js:47-49,66-69,90-93,133-136,163-166`） | 数据按账号隔离；管理员代管是治理能力而非越权漏洞 |
| D3 | PUT 为白名单 upsert：仅收 `CONFIG_FIELDS` 十字段（`server/lib/configDocs.js:1-12`），未知字段丢弃；保留 createdAt/shareToken/shareEnabled | 校验服务端单一事实源；共享凭证不因保存丢失 |
| D4 | 保存/删除/共享/发布均 SSE 广播 `{ownerId, name, shareToken?}` | 计时页/设置页/大屏多端即时同步 |
| D5 | 共享关闭或 token 轮换即终止旧 token 键控的实时会话（`server/routes/configurations.js:216-220`） | 大屏立即回退独立计时，杜绝旧链接续用 |
| D6 | 错误包络支持可选 `code` 字段供客户端仲裁（`server/routes/configurations.js:24-29`，D29 §18） | 机器可读失败原因 |
| D7 | 控制会话五端点强制「严格属主」：admin 也不得代他人开会话（`findOwnConfig`，`server/routes/configurations.js:238-256`） | 会话是操作现场，治理代管不适用于实时控制 |

**逆向归档差异注记（重要）**：PUT 保存走 `replaceOne` 整档替换（`server/routes/configurations.js:108-112`），载荷不含发布寄居字段——**对已发布（isPublic=true）模板执行保存会把 isPublic/creditName/galleryCopyCount 一并抹除**（模板退出广场、热度清零）；shareToken/shareEnabled 则被显式保留（`:104-105`）。S-02 PRD §3.1「保留共享/发布标志」中「发布标志」与实现不符，本档以实现为准并在此标注；S-03 PRD §5.2「发布后模板可继续编辑」的实际行为是：编辑保存后模板退回未发布态，需重新发布。属已知实现行为，非文档笔误（前端载荷亦不含这些字段，`src/services/configurationShared.js:9-44`）。

### 1.4 领域对象总览

| 对象 | 分类 | 说明 |
|------|------|------|
| 赛制模板（Configuration） | 聚合根 | configurations 集合，`(ownerId,name)` 唯一 |
| 比赛阶段条目 | 域内对象·值对象 | 按 stageId 键合的内嵌配置组（时长/模式/三语名/宽限/自动推进/PID 装饰），随聚合根整体读写，无独立接口 |
| 队名（teamNames） | 域内对象·值对象 | aff/neg 展示名 |
| 共享凭证 | 域内对象·值对象 | shareEnabled + shareToken；token 变更联动 C-02 会话终止 |
| PID 装饰 | 域内对象·值对象 | 模板级 pidOptions（marker/lineColor）与阶段级 stagePid（icon/station） |
| 发布标志/署名/复制热度 | 寄居字段（S-03 语义） | isPublic / creditName / galleryCopyCount，物理存于本文档聚合根，写侧 visibility 归 S-03、计数归 S-03 |
| 内置默认赛制 | 静态种子（前端打包） | 首次播种「默认配置」与离线回落来源，不入服务端接口面 |

子流程：无（PRD 领域模型结论；「未保存编辑态」为前端 UI 过程数据）。

### 1.5 上下文映射

| 外部上下文 | 关系 | 映射模式 |
|-----------|------|---------|
| S-01 账号 | ownerId 归属；用户删除级联删模板（D-01 `server/routes/admin.js:234`） | 共享内核 |
| S-03 模板广场 | 发布标志/署名/复制计数寄居字段；广场经只读投影消费本域文档 | OHS（本域标准接口暴露模板能力）+ 写侧委托（visibility 接口在本域路由，语义属 S-03） |
| C-01 比赛计时 | 计时页加载模板快照驱动比赛；模板后续变更经 SSE 通知前端重载 | ACL（运行中比赛以已加载快照继续） |
| C-02 大屏同步 | shareToken 是控制会话键；共享关闭/轮换触发 `timerSessions.end(old,'share_disabled')`；会话五端点属 C-02 | 发布语言（SSE change 事件契约 + 会话终止联动） |
| S-04 比赛记录 | 记录保存时复制 configName 与队名为快照 | 快照复制（不回读） |
| D-01 配置治理 | 管理台全量列表/删除模板（admin 专用接口，非本文档路由） | 客户（本域提供数据，治理面独立实现） |

## 2. 跨聚合根设计（裁剪：不适用）

本模块单一聚合根（赛制模板），无跨聚合根约束/编排。跨域联动（C-02 会话终止、SSE 广播）是聚合根上的领域事件出口，不是编排流程。

## 3. 应用/基础设施层设计

### 3.1 接口规范

- 前缀与挂载：`/api/configurations`（`server/index.js:128`），工厂注入 `{configurations, sse, requireAuth, timerSessions}`。
- 全路由鉴权：`router.use(requireAuth)`（`server/routes/configurations.js:34`）——无匿名访问面。
- 路径风格：`/domain`（列表）、`/domain/:name`（资源）、`/domain/:name/action`（动作：share/visibility/session 系列）三段混用，如实归档；`/stream` 注册在 `/:name` 之前（`server/routes/configurations.js:36,64`），不会被当作模板名捕获。
- 模板名经路径段传输，前端 `encodeURIComponent`（`src/services/ConfigurationService.js:9-13`）。
- ownerId 传参约定：统一 `?ownerId=` 查询参数（仅 admin 生效）。
- 响应包络：成功 `{success:true, data?|message?}`；失败 `{success:false, message, code?}`（code 可选，D6）。
- 校验失败 HTTP 400 + 字段级英文 message；服务端单一事实源。

### 3.2 依赖与约束

| 依赖 | 类型 | 约束 |
|------|------|------|
| configurations 集合 | 存储 | 索引：`(ownerId,name)` unique、`shareToken` unique(partial: $type string)、`updatedAt`、`(isPublic,updatedAt)` partial（`server/index.js:107-116`） |
| sseHub | 组件 | 广播 `{ownerId, name, shareToken?}`；`initSseResponse` 建 SSE 流 |
| timerSessions | 组件（C-02） | 仅 share 接口的 `end(token,'share_disabled')` 联动 + 会话五端点 |
| shareToken | 库 | `randomBytes(18).toString('base64url')`（`server/lib/shareToken.js:3-5`） |
| configDocs | 库 | 白名单/校验/投影函数（§3.4 与 §4.4 引用） |
| 挂载顺序 | 约束 | `express.json({limit:'1mb'})` 全局生效（`server/index.js:45`）——模板载荷 >1MB 将被拒 |

### 3.3 权限模型

| 操作 | 注册用户（非属主数据） | 注册用户（本人数据） | 管理员（本人数据） | 管理员（+?ownerId= 代管） |
|------|----------------------|--------------------|------------------|------------------------|
| LIST/GET/PUT/DELETE/SHARE | — | ✓ | ✓ | ✓（403 守卫仅拦非 admin） |
| VISIBILITY（发布/撤回） | — | ✓ | ✓ | ✗ 不可代他人发布（findOwnConfig 属主校验 403，`server/routes/configurations.js:248-254`） |
| SESSION 五端点（C-02） | — | ✓ | ✗ 仅属主（D7） | ✗ 同左 |
| STREAM | ✓（接收本人 ownerId 变更；admin 收全局） | ✓ | ✓ | — |

数据权限规则：查询/写入一律经 `ownerObjectId(user, requestedOwnerId)` 解析目标属主（`server/routes/configurations.js:8-17`）：admin+ownerId → ownerId（parse 失败 400 `Invalid owner`）；否则本人 id。share 端点额外做 `canAccessConfig` 复核（`:169`）。解耦点：403 守卫（拦「非 admin 指定 ownerId」）与 404（目标不存在）分立，admin 代管不存在的模板同样 404。

### 3.4 公共规范

**错误码语义表**（本路由全量）：

| HTTP | 触发 | message（示例） | 锚点 |
|------|------|----------------|------|
| 400 | ?ownerId 非 24-hex | `Invalid owner` | `server/routes/configurations.js:11-15` |
| 400 | 字段校验失败 | `Invalid timer mode "x" for stage "y" (expected single/double/free)` 等字段级文案 | `server/lib/configDocs.js:34-177` |
| 401 | 未登录 | `Authentication required` | `server/lib/authMiddleware.js:36-49` |
| 403 | 非 admin 携带 ?ownerId | `Cannot list/access/modify/delete/share another user's configurations` | `server/routes/configurations.js:47-49,66-68,90-92,133-137,163-165` |
| 403 | 属主校验失败（visibility/session 系列） | `Cannot control another user's configuration` | `server/routes/configurations.js:248-254` |
| 404 | 模板不存在 | `Configuration "<name>" not found` | `server/routes/configurations.js:72-78,139-145,169-175,241-247` |
| 500 | 服务端异常 | error.message（+可选 code） | `server/routes/configurations.js:19-30` |

**枚举定义**（已登记入池 enum-pool.md，编号如下）：

| 枚举 | 池编号 | 值 | 说明 |
|------|-----|------|------|
| stageTimingMode | EP-TIMER-01 | `single` / `double` / `free` | 阶段计时模式；遗留数字 0/1 归一为 single/double（`server/lib/configDocs.js:23-29`） |
| pidStationType | EP-CONFIG-02 | `auto` / `interchange` / `normal` | `auto`/缺省为默认哨兵，不落库（`configDocs.js:17,164-171`） |
| pidLineColor | EP-CONFIG-04 | `#1e3a5f` `#c62828` `#2e7d32` `#ef6c00` `#6a1b9a` `#00695c` `#455a64` | 7 色白名单（`configDocs.js:18-20`） |
| pidIconId | EP-CONFIG-03 | `^[a-z0-9_]{1,32}$` 格式串 | 图标注册表字符串，服务端只验格式（`configDocs.js:16`） |
| shareActionParams | 不入池 | enabled:boolean? / rotate:boolean? | share 请求体组合参数（非存储枚举，接口参数语义） |

**配置项**：ALLOWED_ORIGINS（CORS 白名单+写方法 Origin 强校验，`server/index.js:47-70`）；载荷上限 1MB。

## 4. 聚合根详细设计

### 4.1 领域模型

**管理模式声明**：MIXED——模板本体自管（属主 upsert/删除）；管理员 `?ownerId=` 代管（托管侧，权限管控实现，无 manage_mode 字段）；S-03 寄居字段（isPublic/creditName/galleryCopyCount）物理内嵌、语义外属。

**表结构组合**（configurations 集合单文档内嵌）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| _id / ownerId / name | ObjectId / ObjectId / string | `(ownerId,name)` 唯一 | 定位键；name 为「默认配置」（DEFAULT_CONFIGURATION_NAME）时前端禁止删除（服务端不特判，如实记录） |
| schemaVersion | number | 当前 2 | 结构版本 |
| debateStages | map&lt;stageId,秒&gt; | 服务端不验数值范围（前端 0–3600）；stageId ≤64 字符（前端约束） | 阶段时长表；stageId 键集是下列各 map 的合法键域 |
| timerSettings | map&lt;stageId,mode&gt; | stageTimingMode 枚举 | 遗留 0/1 归一 |
| stageOrder | string[] | 应覆盖全部 stageId（服务端不验完整性，如实记录） | 执行顺序 |
| stageLabels | map&lt;stageId,{zh-Hans,en,fr-CA}&gt; | 服务端不验（前端 ≤40/语言）；缺省 `{}` | 多语言阶段名 |
| stageGrace | map&lt;stageId,0–300&gt; | 键必须 ∈ debateStages 键集；整数 | 宽限秒数 |
| stageAutoAdvance | map&lt;stageId,boolean&gt; | 键必须 ∈ debateStages 键集 | 自动推进开关 |
| teamNames | `{aff?,neg?}` | 各 ≤20 字符，空值剔除；全空则字段删除 | 队名 |
| stagePid | map&lt;stageId,{icon?,station?}&gt; | 键 ∈ 键集；icon 格式/_station 枚举；`auto`/空 不落库 | 阶段 PID 装饰 |
| pidOptions | `{marker?,lineColor?}` | marker 格式 / lineColor 7 色；全空删除 | 模板级 PID 装饰 |
| shareEnabled / shareToken | boolean / string\|null | token 唯一（partial 索引）；仅属主可见（详情接口白名单直出，admin 列表也可见） | 大屏共享凭证 |
| isPublic / creditName / galleryCopyCount | boolean / string≤20\|null / number | S-03 寄居字段；**PUT 保存会抹除（§1.3 注记）** | 广场语义 |
| createdAt / updatedAt | epoch-ms | createdAt 仅首建写入 | 审计 |

**不变量**：

| # | 不变量 | 强制点 |
|---|--------|--------|
| I1 | (ownerId,name) 唯一 | 复合唯一索引 + upsert 前查 existing |
| I2 | stageGrace/stageAutoAdvance/stagePid 键 ⊆ debateStages 键集 | `normalizeStageFlags`/`normalizeStagePid`（`configDocs.js:53-78,134-177`） |
| I3 | timerSettings 值 ∈ stageTimingMode（含遗留归一） | `normalizeTimerSettings`（`configDocs.js:34-51`） |
| I4 | shareToken 全库唯一（存在即唯一） | partial unique 索引（`server/index.js:108-111`） |
| I5 | 未知字段不入库 | CONFIG_FIELDS 白名单（`configDocs.js:179-185`） |
| I6 | shareToken 变更 ⇒ 旧 token 会话终止 | share 接口联动（`configurations.js:216-220`） |
| I7 | createdAt 首建后不变；shareToken/shareEnabled 跨保存保留 | PUT payload 显式回填（`configurations.js:103-105`） |

**领域服务**（configDocs 库）：pickConfigFields（白名单+校验）、toConfigResponse / toListItem / toAdminListItem / toDisplayResponse（四种投影）、isShareVisible。业务常量：MAX_GRACE_SECONDS=300、MAX_TEAM_NAME_LENGTH=20、PID_ICON_ID_RE、PID_LINE_COLORS、TIMER_SETTING_VALUES。标签池：无。

### 4.2 状态模型

无多状态生命周期（主数据类维护型；「未保存编辑态」是前端 UI 状态，保存从「已保存」开始）。两类布尔标志独立翻转：

```
shareEnabled: false --开启(无token则生成)--> true --关闭/轮换--> false/true
              （翻转或轮换 ⇒ 旧 token 会话终止 [I6]）
isPublic:     false --属主发布--> true --属主撤回/管理员下架/保存抹除--> false
              （语义详设归 S-03 §4.2）
```

无驳回/撤回、无状态历史。

### 4.3 子流程设计

无（PRD 领域模型结论）。前端「模板初始化播种」「离线回落本地只读副本」为客户端行为（`src/services/ConfigurationService.js:234-252` 等），无服务端子流程契约。

### 4.4 接口设计

**接口清单**（全部 requireAuth）：

| # | 编码 | 方法 | 路径 | 鉴权/权限 | 归属 | 说明 |
|---|------|------|------|----------|------|------|
| 1 | CFG-LIST | GET | `/api/configurations` | 登录（?ownerId 仅 admin） | 本档 | 模板名列表 |
| 2 | CFG-STREAM | GET | `/api/configurations/stream` | 登录 | 本档（通道机制 P-01） | SSE 变更订阅 |
| 3 | CFG-GET | GET | `/api/configurations/:name` | 登录（?ownerId 仅 admin） | 本档 | 模板详情（属主含 shareToken） |
| 4 | CFG-SAVE | PUT | `/api/configurations/:name` | 登录（同上） | 本档 | 白名单 upsert 保存 |
| 5 | CFG-DELETE | DELETE | `/api/configurations/:name` | 登录（同上） | 本档 | 删除模板 |
| 6 | CFG-SHARE | POST | `/api/configurations/:name/share` | 登录（同上）+canAccessConfig | 本档 | 共享开关/轮换 |
| 7 | CFG-VIS | POST | `/api/configurations/:name/visibility` | 登录严格属主 | **S-03**（详设见 S-03 档 §4.4） | 发布/撤回/署名 |
| 8 | C-02-SESSION×5 | POST `/session`、PUT `/session/state`、POST `/session/signal`、POST `/session/command`、DELETE `/session` | 登录严格属主（findOwnConfig） | **C-02**（不展开） | 控制会话建立/状态上报/信令/遥控/结束 |

动作接口：share/visibility/session 系列（POST/PUT/DELETE 动作子资源）。服务依赖清单：configDocs、shareToken、sseHub、timerSessions。工作流回调/MQ/标签重建：无。

**接口详情**：

#### CFG-LIST — GET /api/configurations

- 查询参数：`ownerId`（可选，仅 admin；非 admin 携带 → 403）。
- 处理：`find({ownerId}).project({name,createdAt,updatedAt,shareEnabled}).sort({updatedAt:-1})`——无分页（全量返回，量级数十，PRD §10 如实记录）。
- 响应 200：`{success:true, data:[{name,createdAt,updatedAt,shareEnabled}]}`（列表项无 ownerId/isPublic/creditName，`server/lib/configDocs.js:245-252`）。
- 锚点：`server/routes/configurations.js:45-62`。

#### CFG-STREAM — GET /api/configurations/stream

- 处理：`initSseResponse` 后 `sse.add({res, userId, isAdmin})`——普通用户仅收本人 ownerId 的事件，admin 收全局。
- 事件：`change`，载荷 `{ownerId, name, shareToken?}`（save/delete/share/visibility/管理台删除/用户级联删除均广播）。
- 消费语义：断流由客户端 5 秒轮询兜底（前端行为，`src/services/ConfigurationService.js:157-232`）。
- 锚点：`server/routes/configurations.js:36-43`。

#### CFG-GET — GET /api/configurations/:name

- 查询参数：`ownerId`（同 CFG-LIST 约束）。
- 查找：`findOne({ownerId, name})`；未找到 404 `Configuration "<name>" not found`。
- 响应 200：`toConfigResponse(doc,{includeShareToken:true})` = 全量字段 + `createdAt/updatedAt/shareEnabled/isPublic` + 属主时 `shareToken`（shareEnabled 且有 token 才含）+ `ownerId`（字符串）+ `creditName?`（`server/lib/configDocs.js:220-243`）。
- 锚点：`server/routes/configurations.js:64-86`。

#### CFG-SAVE — PUT /api/configurations/:name

- 查询参数：`ownerId`（同上；admin 可代写）。
- 请求体：白名单十字段（schemaVersion/debateStages/timerSettings/stageOrder/stageLabels/stageGrace/stageAutoAdvance/teamNames/stagePid/pidOptions），逐字段校验见 §4.1 表与 §3.4 错误表；未知字段静默丢弃。
- 处理：upsert——已存在则 `replaceOne` 整档替换（保留 _id/createdAt/shareToken/shareEnabled；**抹除 isPublic/creditName/galleryCopyCount，§1.3 注记**），不存在则 insertOne；随后 SSE 广播。
- 响应 200：`{success:true, message:'Configuration "<name>" saved successfully'}`（**创建也 200，非 201**——如实归档）。
- 锚点：`server/routes/configurations.js:88-129`。

#### CFG-DELETE — DELETE /api/configurations/:name

- 处理：`findOne({ownerId,name})` → 404 或 `deleteOne` → SSE 广播（含 shareToken when shareEnabled）。「默认配置」服务端不特判可删（前端双重禁止，PRD §3.1 如实记录）；被计时使用中的模板可删（计时页经 SSE 重载，运行中比赛以快照继续）。
- 响应 200：`{success:true, message:'Configuration "<name>" deleted successfully'}`。
- 锚点：`server/routes/configurations.js:131-159`。

#### CFG-SHARE — POST /api/configurations/:name/share

- 请求体：`{ enabled?: boolean, rotate?: boolean }`（均可缺省）。
- 参数组合语义（实现矩阵，`server/routes/configurations.js:177-190`）：

| enabled | rotate | shareEnabled 结果 | shareToken 结果 |
|---------|--------|------------------|----------------|
| true | — | true | 无 token 则生成；有则保留（rotate=true 则轮换） |
| false | — | false | 保留旧值（响应中 token 输出 null）；rotate=true 时仍生成新 token 备用（实现如此，如实记录） |
| 缺省 | true | 保持原值 | 原 true：轮换；原 false：生成并备用 |
| 缺省 | 缺省 | 保持原值 | 原 true 且无 token 时生成 |

- 联动：`shareToken` 变更（关闭或轮换）⇒ `timerSessions.end(旧token,'share_disabled')`，大屏回退独立计时；SSE 广播两次（旧 token 一次、新 token 一次，`:203-214`）。
- 响应 200：`{success:true, data:{shareEnabled, shareToken}}`（token 仅 shareEnabled 时输出，否则 null）。
- 错误：404（模板不存在，含 admin 代管找不到时）；400（ownerId 非法）；403（非 admin 指定 ownerId / 属主复核失败）。
- 锚点：`server/routes/configurations.js:161-232`。

**跨接口复用规则**：ownerId 守卫（403）+ ownerObjectId 解析（400）+ 404 语义在 LIST/GET/PUT/DELETE/SHARE 五接口逐字重复（实现在路由内联，非中间件）——逆向归档如实记录，未抽象。CFG-VIS/C-02-SESSION 的 404 语义同源（findOwnConfig）。

**服务方法规格**：pickConfigFields(body)→payload｜throw 400；toConfigResponse(doc,{includeShareToken})→VO；toListItem(doc)→VO；toDisplayResponse(doc)→VO（S-03 详情与 C-02 会话快照复用）；generateShareToken()→base64url 24 字符。

**枚举定义**：见 §3.4。

### 4.5 领域事件与集成

| 事件 | 载荷 | 触发点 | 消费方 |
|------|------|--------|--------|
| SSE change | `{ownerId, name, shareToken?}` | CFG-SAVE（`:117-121`）/ CFG-DELETE（`:147-151`）/ CFG-SHARE（`:203-214`，新旧 token 各一次）/ CFG-VIS（S-03 触发）/ D-01 删除模板（`admin.js:275-279`）/ D-01 删除用户级联（`admin.js:236`，仅 ownerId） | 设置页/计时页（重载模板）、C-02 大屏（会话终止后回退） |
| 会话终止（跨域调用，非事件） | `timerSessions.end(token,'share_disabled')` | CFG-SHARE 关闭或轮换 | C-02 会话注册表 → SSE session 事件 |

仓储契约：configurations 集合直访（无抽象层）。关联域调用：timerSessions.end（C-02）；无 MQ。

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 消费方 |
|------|--------|
| toDisplayResponse(doc) 模板展示投影 | S-03 广场详情（复制源）、C-02 会话快照 |
| SSE change 契约 `{ownerId,name,shareToken?}` | 前端设置页/计时页/大屏 |
| configurations 集合（(ownerId,name) 定位语义） | S-03 投影/计数、D-01 治理、D-02 预置导入脚本 |
| resolveOwnerId / canAccessConfig | S-04 代读语义同源（`server/lib/authPolicy.js:25-40`） |

### 5.2 SQL 清单

无 SQL（MongoDB）。集合操作清单：

| 集合 | 操作 | 位置 |
|------|------|------|
| configurations | find+project+sort / findOne / replaceOne / insertOne / deleteOne / updateOne($set) / deleteMany(D-01) | `server/routes/configurations.js` 各接口；`admin.js:234,245,274` |

### 5.3 DDL

无表结构 DDL。索引（`server/index.js:107-116`）：

```js
configurations.createIndex({ ownerId: 1, name: 1 }, { unique: true })
configurations.createIndex({ shareToken: 1 }, { unique: true, partialFilterExpression: { shareToken: { $type: 'string' } } })
configurations.createIndex({ updatedAt: -1 })
configurations.createIndex({ isPublic: 1, updatedAt: -1 }, { partialFilterExpression: { isPublic: true } })
```

## 6. 更新记录

**变更类型词汇表**：同引擎分册（initial / interface_added / rule_changed / enum_added 等）。
**版本号规则**：`vMAJOR.MINOR`，接口不兼容变更升 MAJOR。

| 版本 | 日期 | 变更类型 | 变更说明 | 目标节 |
|------|------|---------|---------|--------|
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：6 本档接口 + 2 归属标注（S-03/C-02）详列；ownerId 绑定语义、白名单 upsert、share 参数矩阵、SSE 契约成文；**PUT 整档替换抹除发布寄居字段**作为实现事实注记（§1.3） | §1.3/§4.4 |

### 模板符合性自检记录（M1~M5，逆向归档如实记录）

| # | 项 | 结果 |
|---|----|------|
| M1 | 章节结构完整 | ✅（2 章裁剪标注、4.3 裁剪标注，🔒 章节全存在） |
| M2 | 接口路径三段式 | ⚠️ 部分符合：`GET /api/configurations`（列表）、`/api/configurations/:name`（资源两段）、动作类 `/share|/visibility|/session/*` 三段式；已上线事实不改路径 |
| M3 | 枚举引用有定义 | ✅ stageTimingMode / pidStationType / pidLineColor / pidIconId / shareActionParams 均在 §3.4 定义 |
| M4 | 占位符残留 | ✅ 无 |
| M5 | 变更记录含本次更新行 | ✅ §6 initial 行 |
