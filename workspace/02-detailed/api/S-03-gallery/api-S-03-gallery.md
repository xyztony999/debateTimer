# S-03 模板广场 API 设计

| 属性 | 值 |
|------|-----|
| 模块编码 | S-03（应用域：支撑业务域） |
| 文档性质 | 逆向归档：系统已上线，本文档如实反映现有实现（路径/状态码/错误文案均为现网事实，非理想化重设计） |
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 功能类型 | 内容分发（无独立聚合根——S-02 模板聚合根之上的公开只读投影 + 发布标志写侧 + 复制计数行为；二元可见性流转） |
| 管理模式 | MIXED（发布标志/署名/复制热度托管于 S-02 模板文档内嵌存储；本域投影自管为只读；权限管控替代模式字段：发布=属主、计数=登录、下架=admin） |
| 上游依据 | S-03 PRD v1.0；BA v1.0 §2.1.3；AA v1.0 §2.2.3；FL v1.0 §2.2.1.3 / §2.3.1.2 / §2.4.1.2 |
| 实现锚点 | `server/routes/gallery.js`、`server/routes/configurations.js:346-376`（visibility，发布/撤回写侧）、`src/services/GalleryService.js:95-128`（复制组合）、`server/index.js:127`（挂载+限流）、`server/lib/rateLimits.js:42-47` |

## 1. 模块设计概述

### 1.1 业务背景及目标

社团内优质赛制分散在各账号名下。本模块建立公开匿名赛制库：任何人（含访客）无需登录浏览卡片与详情；登录用户一键复制他人赛制为自己的模板（复制热度计入）；属主发布/撤回并可自愿署名；管理员强制下架。核心设计约束是**匿名性**——全部响应不包含归属人身份与共享凭证（`server/routes/gallery.js:40-44` 注释原义）。

### 1.2 边界说明

| 方向 | 内容 |
|------|------|
| 做什么 | 广场列表/详情（匿名）、复制热度计数、管理员下架；发布/撤回/署名写侧接口（路由在 configurations.js，业务语义属本域，本文档详设）；复制动作的客户端组合语义 |
| 不做什么 | 归属人展示（全链路排除）、点赞/收藏/评论、审核流/举报、下架通知/申诉、服务端复制端点、广场内编辑、跳页分页（PRD §3.2）；预置导入脚本参数与存储（D-02，本域只约定「可 `--public` 直发广场」语义） |
| 边界注记 | 「复制」无服务端聚合端点：客户端组合「读广场详情 → 经 S-02 CFG-SAVE 落库 → fire-and-forget 计数上报」，本文档如实归档该分布式语义 |

### 1.3 设计决策

| # | 决策 | 理由（实现注释原义） |
|---|------|---------------------|
| D1 | 广场无独立存储：isPublic 模板的匿名投影（`server/routes/gallery.js:40-44`） | 单一数据源；发布/撤回只翻标志不复制数据 |
| D2 | 匿名投影双层防护：列表投影白名单（仅 6 字段，`:67-76`）；详情投影黑名单显式排除 ownerId/shareToken/shareEnabled（`:97-100`） | 防属主与凭证渗漏；creditName 是唯一可选署名 |
| D3 | 未发布与不存在统一 404 `Template not found`（`:95-104,129-131`） | 不泄露模板存在性 |
| D4 | 复制计数需登录（`:116-118` 注释：blunt casual inflation）且只 `$inc` 不记身份 | 抑制随意刷数，同时保复制者匿名 |
| D5 | 排序键服务端白名单 `{updated, copies}`，未知值回落 updated，绝不从用户输入派生排序（`:61-66`） | 防 NoSQL 注入面 |
| D6 | 搜索关键字正则元字符转义 + 50 字符截断（`:36-38,56-59`） | $regex 注入防护 |
| D7 | 下架幂等：`modifiedCount>0` 即 `unpublished:true`，重复下架返回 false 不报错（`:146-150`） | 管理台重复操作安全 |
| D8 | 发布严格属主：visibility 走 findOwnConfig，admin 也不可代他人发布（`server/routes/configurations.js:248-254`） | 匿名署名是属主个人意愿，治理权不含代发布 |

**逆向归档差异注记**：S-03 PRD §5.2「发布后模板可继续编辑 → 广场详情实时反映」——详情确实读活文档，但属主经 S-02 CFG-SAVE 保存会整档替换并**抹除 isPublic/creditName/galleryCopyCount**（见 S-02 档 §1.3 注记），实际行为是「编辑保存后模板退回未发布态、从广场消失、热度清零，需重新发布」。本档以实现为准，标注 PRD 表述与实现的偏差。

### 1.4 领域对象总览

| 对象 | 分类 | 说明 |
|------|------|------|
| 广场条目（GalleryItem） | 值对象（投影） | `{id,name,stageCount,totalSeconds,modeSummary,updatedAt,copies,creditName?}`，派生自 S-02 模板文档，不可独立修改 |
| 发布标志+署名 | 寄居字段（S-02 聚合根承载） | isPublic / creditName；属主写（visibility）、本域读 |
| 复制热度 | 寄居字段（S-02 聚合根承载） | galleryCopyCount；仅经本域 GAL-COPY 端点 `$inc` |
| 模板副本 | S-02 聚合根新实例 | 复制产物，落复制者名下，与源模板无关联字段（无溯源） |

子流程：模板复制（唯一有独立生命周期的过程，由客户端组合完成，无服务端子流程聚合——见 §4.3）。

### 1.5 上下文映射

| 外部上下文 | 关系 | 映射模式 |
|-----------|------|---------|
| S-02 赛制模板管理 | 读 isPublic 投影与全量展示字段（复制源）；发布标志写侧接口挂于其路由 | OHS（S-02 标准 REST 暴露模板能力）+ ACL（广场投影剥离属主/凭证概念，防渗漏） |
| S-01 账号与准入 | Cookie 会话：复制计数需登录、下架需管理员 | 遵奉者 |
| D-02 系统配置 | 预置样例脚本可 `--public` 直发广场 | OHS（脚本直写模板集合，遵从本域可见性规则） |
| P-02 接口防护 | 整个 /api/gallery 共享每 IP 120 次/分钟桶（挂载级，`server/index.js:127`） | 遵奉者 |

## 2. 跨聚合根设计（裁剪：不适用）

本域无自有聚合根（投影值对象 + 寄居字段，见 1.4）。与 S-02 聚合根的一致性由「同文档读写」天然保证：发布/计数直接作用于模板文档，无跨根事务、无最终一致性问题。可见性流转（§4.2）是寄居字段的状态，不是跨聚合根编排。

## 3. 应用/基础设施层设计

### 3.1 接口规范

- 前缀与挂载：`/api/gallery`（`server/index.js:127`），挂载级工厂注入 `{configurations, requireAuth, requireAdmin}` + `createGalleryRateLimiter()`。
- 鉴权不对称（本域特征）：LIST/DETAIL 匿名；COPY requireAuth；UNPUBLISH requireAuth+requireAdmin；VISIBILITY（发布，属 configurations 路由）requireAuth+严格属主。
- 路径风格：`/domain`（列表）、`/domain/:id`（资源）、`/domain/:id/action`（copy/unpublish）。
- 广场条目 id = 模板 ObjectId 字符串（24-hex）；非法 id 一律按 404 处理（不返回 400，D3 一致性）。
- 响应包络：`{success:true, data}` / `{success:false, message}`（gallery 路由无 code 字段）。
- 游标分页约定：`?before=<epoch-ms>` + 响应 `nextBefore`，驱动「加载更多」；无跳页。

### 3.2 依赖与约束

| 依赖 | 类型 | 约束 |
|------|------|------|
| configurations 集合 | 存储（只读投影 + 两处受限写） | 写仅限：`$inc galleryCopyCount`（条件 isPublic:true）与 `$set {isPublic:false,updatedAt}`（条件 isPublic:true） |
| gallery 限流桶 | P-02 | 匿名浏览+登录复制共用 120 次/min/IP（env GALLERY_RATE_*，`server/lib/rateLimits.js:42-47`） |
| configDocs.toDisplayResponse / toGalleryItem | 投影函数 | 详情 = toGalleryItem + toDisplayResponse 合并（`server/routes/gallery.js:106-109`） |
| parseObjectId | 库 | 非法 id → null → 404（`server/routes/gallery.js:94-101,120-124,141-145`） |

### 3.3 权限模型

| 操作 | 访客 | 注册用户 | 管理员 |
|------|------|---------|--------|
| GAL-LIST / GAL-DETAIL | ✓（匿名，限流同桶） | ✓ | ✓ |
| GAL-COPY（计数） | ✗ 401 | ✓ | ✓ |
| GAL-UNPUBLISH（下架） | ✗ 401 | ✗ 403 | ✓ |
| VISIBILITY（发布/撤回/署名） | ✗ 401 | 仅属主（admin 不可代他人，403） | 仅本人模板 |
| 复制落库（经 S-02 CFG-SAVE） | ✗ 401 | ✓ | ✓ |

数据权限：投影层隔离——非属主数据对访客只暴露匿名白名单字段；复制计数与下架按 `isPublic:true` 条件写（未公开目标 modifiedCount=0 → 404）。

### 3.4 公共规范

**错误码语义表**（本域全量）：

| HTTP | 触发 | message | 锚点 |
|------|------|---------|------|
| 401 | 匿名调 COPY / 未登录调 UNPUBLISH、VISIBILITY | `Authentication required` | `server/routes/gallery.js:118`；`server/lib/authMiddleware.js:36-49`；测试 `galleryRoutes.test.js:239` |
| 403 | 非管理员下架 / 属主校验失败（visibility） | `Admin access required` / `Cannot control another user's configuration` | `server/lib/authMiddleware.js:51-57`；`server/routes/configurations.js:248-254`；测试 `galleryRoutes.test.js:220` |
| 404 | 详情不存在/**未发布**；非法 id；计数/下架目标未公开 | `Template not found` | `server/routes/gallery.js:102-105,120-124,129-132` |
| 429 | 限流命中（含 Retry-After） | 限流器 JSON body | `server/lib/rateLimits.js:42-47` |
| 500 | 服务端异常 | error.message | `server/routes/gallery.js:86-89` 等 |

**枚举定义**（已登记入池 enum-pool.md，编号如下）：

| 枚举 | 池编号 | 值 | 说明 |
|------|-----|------|------|
| gallerySort | EP-CONFIG-06 | `updated` / `copies` | 排序键白名单；未知值回落 updated（`server/routes/gallery.js:62-66`） |
| stageTimingMode | EP-TIMER-01 | `single` / `double` / `free` | modeSummary 计数来源（引用不重复定义） |
| visibilityState | EP-CONFIG-08 | unpublished / published | 广场视角二元可见性（存储为 isPublic 布尔，非独立枚举字段） |

## 4. 聚合根详细设计

### 4.1 领域模型（投影与寄居字段，无自有聚合根）

**管理模式声明**：MIXED——本域数据托管于 S-02 模板文档（isPublic/creditName/galleryCopyCount 内嵌），投影层自管为只读；无独立表结构，表结构组合即 S-02 §4.1 文档结构的相关子集。

**投影结构**（广场条目，非存储）：

| 字段 | 类型 | 派生 | 锚点 |
|------|------|------|------|
| id | string | 模板 _id | `server/routes/gallery.js:25` |
| name | string | 模板 name | `:26` |
| stageCount | number | `Object.keys(debateStages).length` | `:27` |
| totalSeconds | number | ΣdebateStages 值（Number 兜底 0） | `:23` |
| modeSummary | string | timerSettings 按模式计数拼 `single×4 · free×1`；无则 `—` | `:8-19` |
| updatedAt | number | 模板 updatedAt | `:30` |
| copies | number | galleryCopyCount（缺省 0） | `:31` |
| creditName | string? | 属主署名；仅存在时序列化 | `:32` |

详情额外字段（toDisplayResponse 合并）：name/schemaVersion/debateStages/timerSettings/stageOrder/stageLabels/stageGrace/stageAutoAdvance/stagePid/pidOptions?/teamNames?（`server/lib/configDocs.js:268-282`）——**不含** ownerId/shareToken/shareEnabled。

**不变量**：

| # | 不变量 | 强制点 |
|---|--------|--------|
| I1 | 广场可见 ⇔ isPublic:true；响应不含 ownerId/shareToken/shareEnabled | 查询条件（`:52-54,96-100`）+ 投影（`:67-76,97-100`） |
| I2 | galleryCopyCount 仅经 GAL-COPY 递增 | 代码全库仅此一处 `$inc`（`:125-128`） |
| I3 | 排序键 ∈ gallerySort 白名单 | `:61-66` |
| I4 | 下架/计数均以 isPublic:true 为写条件 | `:126-128,146-149` |
| I5 | creditName 存在才署名；空串/未填 = 完全匿名 | `:32`（序列化条件）；`configurations.js:354-357`（写侧归一） |

领域服务：modeSummary(doc)、toGalleryItem(doc)、escapeRegex(text)。业务常量：DEFAULT_LIMIT=20、MAX_LIMIT=50、搜索截断 50。标签池：无。

### 4.2 状态模型

可见性二元流转（寄居字段状态，存储于 S-02 模板文档）：

```
未发布(isPublic=false) --属主发布(VISIBILITY public=true)--> 已发布(isPublic=true)
已发布 --属主撤回(VISIBILITY public=false)--> 未发布
已发布 --管理员下架(GAL-UNPUBLISH)--> 未发布（updatedAt 刷新;数据不动;计数保留）
已发布 --属主保存(CFG-SAVE)--> 未发布（整档替换抹除标志,S-02 §1.3 注记——实现行为）
```

触发角色：发布/撤回=属主（admin 不可代）；下架=管理员；保存=属主（副作用退场）。无驳回/撤回流程、无状态历史（下架不通知、无操作日志，PRD §11 如实记录）。计数跨下架保留（不清零，重新发布热度延续）。

### 4.3 子流程设计：模板复制（客户端组合子流程）

| 项 | 内容 |
|----|------|
| 触发 | 登录用户在广场详情弹窗确认复制（未登录显示「登录后复制」+`?next=/gallery/:id` 回跳） |
| 输入 | 广场条目 id（读详情）+ 目标模板名（默认「原名+副本后缀」，必填非空可改） |
| 步骤 | ① GAL-DETAIL 读全量展示字段 → ② S-02 CFG-SAVE 以登录者名义落库 → ③ 成功后 GAL-COPY 上报计数（fire-and-forget，失败 console.warn 静默） |
| 复制字段范围 | schemaVersion/debateStages/timerSettings/stageOrder/stageLabels + stageGrace/stageAutoAdvance/teamNames；**不含** stagePid/pidOptions（PID 装饰不随复制）、不含共享/发布标志与计数（`src/services/GalleryService.js:104-123`——extras 仅传三项增强字段，锚点核实） |
| 输出 | 复制者名下新模板（S-02 聚合根新实例）+ 源模板 galleryCopyCount+1 |
| 幂等 | 非幂等：重复复制产生多副本、重复计数（现实现接受，PRD §12 如实记录）；落库 upsert 语义沿用 S-02（同名自有模板被覆盖） |
| 失败语义 | ②失败则复制失败（前端提示）；③失败不影响复制结果 |

（服务端无此子流程的聚合端点——「复制」在本 API 面上仅体现为计数端点 GAL-COPY。）

### 4.4 接口设计

**接口清单**：

| # | 编码 | 方法 | 路径 | 鉴权 | 用户类型 | 限流 | 说明 |
|---|------|------|------|------|---------|------|------|
| 1 | GAL-LIST | GET | `/api/gallery` | 匿名 | 访客+全部 | 120/min/IP（共享桶） | 广场列表（搜索/排序/游标） |
| 2 | GAL-DETAIL | GET | `/api/gallery/:id` | 匿名 | 访客+全部 | 同桶 | 广场详情（复制源） |
| 3 | GAL-COPY | POST | `/api/gallery/:id/copy` | requireAuth | 注册用户/管理员 | 同桶 | 复制热度计数 |
| 4 | GAL-UNPUBLISH | POST | `/api/gallery/:id/unpublish` | requireAuth+requireAdmin | 管理员 | 同桶 | 强制下架 |
| 5 | VISIBILITY | POST | `/api/configurations/:name/visibility` | requireAuth+严格属主 | 属主 | 无 | 发布/撤回/署名（路由属 S-02 文件，语义本域） |

动作接口：copy/unpublish/visibility（POST 动作子资源）。服务依赖清单：configurations 集合、parseObjectId、configDocs 投影、requireAuth/requireAdmin。工作流回调/MQ/标签重建：无。

**接口详情**：

#### GAL-LIST — GET /api/gallery

- 查询参数：`limit`（1–50，缺省 20，越界收敛）；`before`（epoch-ms 游标，>0 才生效）；`q`（关键字，trim + 截断 50 + 正则转义后 name 不区分大小写 $regex）；`sort`（`updated`｜`copies`，未知回落 updated；copies = galleryCopyCount 降序 + updatedAt 兜底）。
- 查询：`{isPublic:true, updatedAt<before?, name~q?}`，投影白名单 `{name,debateStages,timerSettings,updatedAt,galleryCopyCount,creditName}`，`limit+1` 探页。
- 响应 200：`{success:true, data:{items:[GalleryItem…], nextBefore: epoch-ms|null}}`（nextBefore=末条 updatedAt，null 即无更多）。
- 锚点：`server/routes/gallery.js:48-90`。

#### GAL-DETAIL — GET /api/gallery/:id

- 处理：`parseObjectId` 失败 → doc=null → 404；`findOne({_id, isPublic:true}, {projection:{ownerId:0,shareToken:0,shareEnabled:0}})` → 空即 404 `Template not found`（未发布=不存在，D3）。
- 响应 200：`{success:true, data:{...GalleryItem, ...toDisplayResponse(doc)}}`——读活文档：发布态模板的编辑实时反映到详情（保存抹除标志的行为见 §1.3 注记）。
- 锚点：`server/routes/gallery.js:92-114`。

#### GAL-COPY — POST /api/gallery/:id/copy

- 鉴权：requireAuth（401 匿名）。
- 请求体：无。
- 处理：非法 id → 404；`updateOne({_id, isPublic:true}, {$inc:{galleryCopyCount:1}})`；`modifiedCount===0` → 404（目标未公开或不存在，不可区分）。
- 响应 200：`{success:true, data:{counted:true}}`。
- 调用时序约束：仅应在 CFG-SAVE 落库成功后调用（§4.3 步骤③；服务端不校验先后，如实记录）。
- 锚点：`server/routes/gallery.js:118-138`。

#### GAL-UNPUBLISH — POST /api/gallery/:id/unpublish

- 鉴权：requireAuth+requireAdmin（401/403）。
- 请求体：无。
- 处理：非法 id → 404；`updateOne({_id, isPublic:true}, {$set:{isPublic:false, updatedAt:Date.now()}})`；幂等——重复下架（已未公开）返回 `{unpublished:false}`，200 不报错。
- 响应 200：`{success:true, data:{unpublished: boolean}}`。
- 附带语义：下架刷新 updatedAt（影响 S-02「最近更新」排序）；不删除模板、不通知属主；详情深链立即 404。
- 锚点：`server/routes/gallery.js:140-155`。

#### VISIBILITY — POST /api/configurations/:name/visibility（发布/撤回/署名）

- 鉴权：requireAuth（configurations 路由级）+ findOwnConfig 严格属主复核（admin 带 `?ownerId=` 也只能操作**自己**的模板：resolveOwnerId 解析后仍要求 `existing.ownerId === req.user.id`，`server/routes/configurations.js:238-256`）。
- 请求体：`{ "public": boolean, "creditName": string? }`。
- 处理：`isPublic = req.body.public === true`（缺省/非 true 即撤回，**未提供「只改署名不翻标志」的语义**，public 缺省等效撤回——如实归档）；creditName 仅在字段为 string 时处理：trim + slice(0,20)，空串归 null（清为匿名），缺省保持不变；`$set` 落库 + SSE 广播 `{ownerId,name}`。
- 响应 200：`{success:true, data:{isPublic, creditName?}}`——creditName 仅在本次写入为非空时返回（清空/未改不返回）。
- 错误：404（模板不存在）；403（非属主）；400（?ownerId 非法）；401。
- 锚点：`server/routes/configurations.js:346-376`。

**跨接口复用规则**：GAL-DETAIL 的响应是 VISIBILITY→CFG-SAVE（复制链路）的直接输入；toDisplayResponse 与 S-02/C-02 共用。**服务方法规格**：toGalleryItem(doc)→GalleryItem；modeSummary(timerSettings)→string。**枚举定义**：见 §3.4。

### 4.5 领域事件与集成

| 事件 | 载荷 | 触发点 | 消费方 |
|------|------|--------|--------|
| SSE change（经 S-02 路由广播） | `{ownerId, name}` | VISIBILITY 发布/撤回（`configurations.js:362-365`） | 属主设置页（发布状态即时同步）；不含广场侧推送（广场无登录态订阅） |

仓储契约：configurations 集合受限访问（读投影 + 两个条件写）。关联域调用：无直接调用（复制落库经客户端组合 S-02 接口；预置导入脚本直写集合）。

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 消费方 |
|------|--------|
| 广场匿名投影（GalleryItem/详情合并体） | 前端 GalleryPage（列表/详情/深链）、复制链路输入 |
| 复制计数端点 | 前端 GalleryService.markCopied（fire-and-forget） |
| 下架端点 | 管理台 AdminPage 广场治理 |
| isPublic 可见性规则 | D-02 预置导入脚本（--public 直发语义）、D-01 管理台配置列表展示 isPublic |

### 5.2 SQL 清单

无 SQL（MongoDB）。集合操作清单：

| 集合 | 操作 | 位置 |
|------|------|------|
| configurations | find(投影白名单)+sort+limit / findOne(isPublic 条件+排除投影) / updateOne($inc) / updateOne($set) | `server/routes/gallery.js:67-76,96-101,125-128,146-149`；visibility 写经 `configurations.js:358-361` |

### 5.3 DDL

无自有表/索引（复用 S-02 configurations 集合；广场查询依赖 `(isPublic, updatedAt)` partial 索引，见 S-02 §5.3）。

## 6. 更新记录

**变更类型词汇表**：同引擎分册（initial / interface_added / rule_changed / enum_added 等）。
**版本号规则**：`vMAJOR.MINOR`，接口不兼容变更升 MAJOR。

| 版本 | 日期 | 变更类型 | 变更说明 | 目标节 |
|------|------|---------|---------|--------|
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：5 接口（匿名浏览×2/计数/下架/发布署名）；匿名全链路规则、复制客户端组合子流程、下架幂等语义成文；CFG-SAVE 抹除发布标志的实现行为注记（§1.3/§4.2） | — |

### 模板符合性自检记录（M1~M5，逆向归档如实记录）

| # | 项 | 结果 |
|---|----|------|
| M1 | 章节结构完整 | ✅（2 章裁剪标注、4.3 为唯一子流程实设，🔒 章节全存在） |
| M2 | 接口路径三段式 | ⚠️ 部分符合：`GET /api/gallery` 列表为单段，其余 `/api/gallery/:id`、`/:id/copy`、`/:id/unpublish`、`/api/configurations/:name/visibility` 符合；已上线事实不改路径 |
| M3 | 枚举引用有定义 | ✅ gallerySort / visibilityState 本档定义；stageTimingMode 显式引用 S-02 §3.4 定义 |
| M4 | 占位符残留 | ✅ 无 |
| M5 | 变更记录含本次更新行 | ✅ §6 initial 行 |
