# API 设计文档 — C-02 计时协同（控制会话与实时状态同步）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 待评审 |
| 模块编码 | C-02（核心业务域-实时协同展示） |
| 关联变更 | C-01-03 自由辩论（`stageTimingMode` 枚举扩展，经既有配置 save 生效） |
| 日期 | 2026-10-10 |
| 输入 | PRD《实时协同计时与自由辩论》v1.0 + 领域模型 timer-session.md v1.0 |

## 1. 模块设计概述

### 1.1 业务背景及目标

将控制端的计时状态实时同步到匿名大屏：控制端基于配置开启控制会话并上报状态快照，
服务端内存缓存并经既有 SSE hub 按分享令牌定向分发；显示端拉取/订阅并只读渲染。
目标：操作 → 大屏呈现 ≤ 1s；断线可恢复；不破坏既有独立展示行为。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 本模块负责 | 会话生命周期、快照校验/缓存/广播、显示端只读拉取 |
| 本模块不负责 | 计时计算（控制端权威，见 1.3 D-2）；模板 CRUD（既有 configurations 路由）；SSE 连接管理（sseHub 既有能力）；自由辩论切换逻辑（前端 C-01-03，仅经枚举透传） |
| 存储边界 | 进程内存（Map<shareToken, session>）；**不写 MongoDB**；进程重启即全部失效（PRD NFR/异常约定） |

### 1.3 设计决策

| # | 决策 | 理由 |
|---|------|------|
| D-1 | 会话寻址键 = 配置 shareToken | 显示端已有 token 寻址链路；新增独立 sessionId 寻址会让大屏链接与会话解耦，增加分发成本 |
| D-2 | 控制端权威计时，服务端只中转+缓存 | 避免服务端 tick 任务；与 sseHub 无状态风格一致 |
| D-3 | 快照 serverTime 由服务端盖戳 | 防控制端时钟漂移污染插值 |
| D-4 | seq 单调 + 服务端拒绝回退 | 幂等去重与乱序防护（BR-3/BR-7） |
| D-5 | 会话存内存不落库 | 生命周期=比赛时长（分钟级），持久化无业务价值（PRD §3.2） |
| D-6 | 复用 `/api/display/:token/stream` 增加事件类型，不新开连接 | 显示端单连接单订阅，降低连接数与复杂度 |

### 1.4 领域对象总览

| 对象 | 角色 | 来源 |
|------|------|------|
| 控制会话 TimerSession | 聚合根（本模块核心） | D2-2 领域模型 |
| 计时状态快照 TimerSnapshot | 值对象（仅保留最新） | D2-2 领域模型 |
| 配置文档（关联领域对象） | 外部聚合根（流程模板域） | 既有 `configurations` 集合 |
| 过程数据（本地计时态/钟偏/插值/连接） | 非领域 | 前端/通道层 |

### 1.5 上下文映射

| 对端 | 模式 | 契约 |
|------|------|------|
| 流程模板域（configurations） | 遵奉者 | 复用 `canAccessConfig`、`toDisplayResponse`、`isShareVisible` |
| 展示端（匿名） | OHS + 发布语言 | `GET /api/display/:token/state` + SSE `state`/`session` 事件（快照 JSON 即发布语言） |
| 权限域 | 遵奉者 | `requireAuth` + cookie 会话 + CSRF 中间件 |

## 2. 跨聚合根设计

不适用：本模块单聚合根（控制会话）。跨域引用（配置文档）见 1.5，无跨聚合根不变量与编排。

## 3. 应用/基础设施层设计

### 3.1 接口规范

| 项 | 规范 |
|----|------|
| 风格 | REST over Express；路径前缀 `/api`；JSON 信封 `{ success, data, message }`（与既有路由一致） |
| 方法语义 | POST=开启会话，PUT=上报快照，DELETE=结束会话，GET=只读拉取 |
| SSE | `text/event-stream`；事件名 `change`（既有配置变更）/ `state`（新增，快照）/ `session`（新增，会话生命周期）；心跳注释帧 `: ping` 由通道层负责 |
| 权限守卫 | 会话三接口：`requireAuth` + owner 校验 + CSRF；display 两接口：匿名 + `isShareVisible` |
| 用户类型标注 | 每个接口标注 [操作员] / [观众] / [管理员] |
| 时间单位 | 毫秒整数；时间戳为 Unix epoch ms |

### 3.2 依赖与约束

| 依赖 | 用途 | 约束 |
|------|------|------|
| `server/lib/sseHub.js` | 定向广播 | 需扩展：按 shareToken 发送指定事件名（现为固定 `change`）；不改变既有签名行为 |
| `configurations` 集合 | 归属/分享校验、阶段定义校验 | 只读 |
| `requireAuth` / CSRF 中间件 | 写操作守卫 | 沿用既有 |
| 内存 | 会话表 | 上限 100 活跃会话（NFR-3），超出 409 |

### 3.3 权限模型

| 角色 | 能力 |
|------|------|
| 计时操作员（owner） | 开启/结束本人配置的会话；上报快照 |
| 观众（匿名持 token） | 拉取快照、订阅流、拉取配置（既有） |
| 管理员 | 不代控（不开启会话/不上报）；可如观众般只读 |

数据权限规则：写操作校验 `config.ownerId == user.id`；读操作校验 token 可见性
（`shareEnabled && shareToken 匹配`）。

### 3.4 公共规范

#### 3.4.1 枚举（登记入枚举池 `workspace/01-solution/common-spec/`）

| 枚举 | 值 | 说明 |
|------|-----|------|
| stageTimingMode | `single` / `double` / `free` | 阶段计时模式；`free` 本次新增；旧客户端遇 `free` 降级 `double`（BR-10）。对应前端 `TimerSetting`（0/1/2） |
| timerSessionStatus | `active` / `ended` / `expired` | 会话状态 |
| activeSide | `aff` / `neg` / `none` | 当前发言方 |
| sessionEventReason | `closed_by_operator` / `heartbeat_timeout` / `share_disabled` / `superseded` / `server_restart` | 会话结束/失活原因 |

#### 3.4.2 错误码（HTTP 状态 + message）

| 状态 | 条件 | message 示例 |
|------|------|-------------|
| 400 | 快照字段非法 / stageId 不在配置中 / seq 回退 | `Invalid snapshot: seq must be greater than N` |
| 401 | 未认证调用会话接口 | `Authentication required` |
| 403 | 非本人配置 | `Cannot control another user's configuration` |
| 404 | 配置不存在 / token 不可见 | `Configuration "X" not found` / `Display link not found` |
| 409 | 活跃会话数达上限 | `Session capacity reached` |
| 200 + active:false | 会话不存在/已失活（拉取接口正常返回） | — |

## 4. 聚合根详细设计：控制会话（TimerSession）

### 4.1 领域模型

**存储**：进程内存 `Map<shareToken, TimerSession>`（key = 配置当前有效 shareToken）。
**MongoDB 变更**：无新集合、无新字段（快照不落库）。配置集合 `timerSettings` 值域扩展由
既有 save 接口自然承载（服务端白名单校验增加 `free`）。

#### 领域对象及角色

| 对象 | 角色 | 说明 |
|------|------|------|
| TimerSession | 聚合根 | 一致性边界：seq 单调 + 失活即停发 |
| TimerSnapshot | 值对象 | 不可变整体替换 |

#### 字段（内存结构）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string(22) | ✓ | 服务端生成（复用 `lib/ids.js` 风格） |
| configId | ObjectId | ✓ | 关联领域对象（配置文档） |
| configName | string | ✓ | 冗余（日志与响应可读性） |
| shareToken | string | ✓ | 冗余自配置；Map 键；BR-2 |
| ownerId | ObjectId | ✓ | 归属人（写权限判定） |
| status | timerSessionStatus | ✓ | 状态机见 4.2 |
| startedAt | long | ✓ | 开启时间 |
| lastSeenAt | long | ✓ | 最近快照时间（失活判定基准） |
| lastSeq | int | ✓ | 最新已接受序号 |
| lastSnapshot | TimerSnapshot | ✓ | 最新快照缓存 |

#### TimerSnapshot 字段（发布语言，亦为 PUT 请求体）

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| seq | int | ✓ | > 会话 lastSeq（否则 400） |
| stageId | string | ✓ | 必须存在于配置 stageOrder/debateStages |
| stageMode | stageTimingMode | ✓ | 枚举 |
| remainingAffMs | int | ✓ | 0 ≤ x ≤ 24h |
| remainingNegMs | int | ✓ | 0 ≤ x ≤ 24h；`single` 时等于 aff |
| runningAff | bool | ✓ | — |
| runningNeg | bool | ✓ | `single` 时恒 false |
| activeSide | activeSide | ✓ | `free` 时 aff/neg；其余 none |

（`serverTime` 仅出现在响应/SSE 载荷，由服务端盖戳，不接受客户端值——D-3。）

#### 不变量

| # | 不变量 |
|---|--------|
| INV-1 | seq 严格单调递增（会话内） |
| INV-2 | 快照 stageId ⊆ 配置阶段集合 |
| INV-3 | status=active ⇔ lastSeenAt 距今 ≤ 10s 且分享可见（惰性判定） |
| INV-4 | 同一 shareToken 至多一条 active 会话记录（覆盖即广播旧会话 superseded） |

#### 领域服务

| 服务 | 职责 |
|------|------|
| SessionRegistry（内存仓储） | create / get / supersede / touch / end；惰性过期（读取与广播时判定，无需定时器） |
| SnapshotValidator | 字段/枚举/seq/stageId 校验 |
| SessionBroadcaster | 组装 SSE 帧并按 token 定向发送（state / session 事件） |

### 4.2 状态模型

| 状态 | 含义 | 进入条件 | 触发角色 |
|------|------|---------|---------|
| active | 会话活跃，接受上报并广播 | 开启成功（覆盖旧会话时旧会话→superseded 广播后移除） | 计时操作员 |
| ended | 操作员主动结束 | DELETE 调用 | 计时操作员 |
| expired | 失活 | 心跳超时(>10s，惰性判定) / 分享停用或轮换 / 进程重启 | 系统 |

```
[无] --POST(开启,owner)--> active --DELETE--> ended（广播 session:ended）
                          active --超时/分享停用--> expired（广播 session:expired）
ended/expired（记录即除名，事件先发）--再次开启--> active（新 sessionId）
```

无驳回/撤回；无状态历史持久化（进程内存，事件即通知）。

### 4.3 子流程设计

无子流程（领域模型 Step 7 结论）。

### 4.4 接口设计

#### 接口清单

| # | 接口 | 方法 | 路径 | 权限 | 用户类型 |
|---|------|------|------|------|---------|
| 1 | 开启控制会话 | POST | `/api/configurations/:name/session` | auth+owner+CSRF | [操作员] |
| 2 | 结束控制会话 | DELETE | `/api/configurations/:name/session` | auth+owner+CSRF | [操作员] |
| 3 | 上报计时状态 | PUT | `/api/configurations/:name/session/state` | auth+owner+CSRF | [操作员] |
| 4 | 拉取最新快照 | GET | `/api/display/:token/state` | 匿名（token 可见） | [观众][操作员][管理员] |
| 5 | 显示端订阅流 | GET | `/api/display/:token/stream` | 匿名（token 可见） | [观众] — **既有接口，扩展事件** |
| 6 | 配置保存 | PUT/POST | `/api/configurations/:name`（既有） | auth+CSRF | [操作员] — **变更：timerSettings 白名单 +`free`** |

#### 接口详情

**#1 开启控制会话** `POST /api/configurations/:name/session`

- 前置：配置存在且 owner；`shareEnabled=true` 且 shareToken 有效，否则 400
  `Sharing must be enabled before starting a session`
- 行为：惰性清理该 token 旧会话（active→superseded 并广播）；创建 active 会话与初始快照
  （seq=0，取配置第一阶段就绪态）；广播 `session:{type:'started'}`
- 请求体：无
- 响应 `data`：

```json
{
  "sessionId": "9c2f…",
  "shareToken": "aB3x…",
  "displayUrl": "/display/aB3x…",
  "status": "active",
  "startedAt": 1760000000000
}
```

**#2 结束控制会话** `DELETE /api/configurations/:name/session`

- 行为：active → ended，广播 `session:{type:'ended', reason:'closed_by_operator'}`，移除记录
- 响应 `data`：`{ "ended": true }`；会话本就不存在时仍返回 200（幂等）

**#3 上报计时状态** `PUT /api/configurations/:name/session/state`

- 前置：存在 active 会话（过期则先惰性清理并 400 `No active session`）
- 请求体：TimerSnapshot（见 4.1；不含 serverTime）
- 行为：校验（SnapshotValidator）→ 盖戳 serverTime → 更新 lastSnapshot/lastSeq/lastSeenAt →
  广播 `state`（载荷 = 快照含 serverTime）
- 响应 `data`：`{ "accepted": true, "seq": 42 }`

**#4 拉取最新快照** `GET /api/display/:token/state`

- 用途：显示端初载与断线重连恢复（PRD FR-3/FR-4）
- 响应 `data`（会话活跃）：

```json
{
  "active": true,
  "startedAt": 1760000000000,
  "snapshot": { "seq": 42, "stageId": "free_debate", "stageMode": "free",
    "remainingAffMs": 95000, "remainingNegMs": 61000,
    "runningAff": false, "runningNeg": true, "activeSide": "neg",
    "serverTime": 1760000123456 }
}
```

- 会话不活跃：`{ "active": false }`（HTTP 200）

**#5 显示端订阅流（既有接口扩展）** `GET /api/display/:token/stream`

- 新增事件（与既有 `change` 并存）：

| event | data | 时机 |
|-------|------|------|
| `state` | 快照 JSON（含 serverTime） | 每次 #3 接受后；新订阅者连接时立即补发当前缓存 |
| `session` | `{ "type": "started" / "ended" / "expired", "sessionId": "…", "reason": sessionEventReason }` | 会话生命周期变化 |

**#6 配置保存（既有接口变更）**

- `timerSettings` 白名单由 `single|double` 扩展为 `single|double|free`；其余行为不变
- 变更类型：`enum_value_added`

#### 服务方法规格（SessionRegistry）

| 方法 | 签名 | 规则 |
|------|------|------|
| create | `(config, user) => session` | INV-4：同 token 旧 active 会话先 supersede |
| get | `(shareToken) => session \| null` | INV-3：惰性过期（过期→广播 expired→移除→null） |
| touch | `(session, snapshot) => session` | INV-1/INV-2 校验后更新 |
| end | `(session, reason) => void` | 广播后移除 |

#### MQ 事件确认

无 MQ；领域事件经 SSE 发布（4.5）。

### 4.5 领域事件与集成

| 领域事件 | SSE 映射 | 载荷 |
|---------|---------|------|
| SessionStarted | `session` type=started | sessionId |
| SnapshotUpdated | `state` | 快照（含 serverTime） |
| SessionEnded | `session` type=ended | sessionId + reason |
| SessionExpired | `session` type=expired | sessionId + reason |

**仓储契约**：SessionRegistry（内存）——`create/get/touch/end`，见 4.4；不持久化。
**关联域调用**：开启时 `configurations.findOne({ownerId, name})` + 分享校验（只读）。

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 消费方 | 契约 |
|------|--------|------|
| 控制会话 API（#1–#3） | 控制端前端 | §4.4 |
| 显示端只读 API（#4–#5） | 显示端前端 | §4.4 |

### 5.2 存储清单（SQL 清单的本栈等价物）

| 存储 | 变更 | 说明 |
|------|------|------|
| MongoDB `configurations` | 无结构变更 | `timerSettings` 值域扩展（应用层白名单） |
| 进程内存 sessions Map | 新增 | `Map<shareToken, session>`，容量 ≤100 |

### 5.3 DDL

不适用（无新集合/索引；内存结构无 DDL）。

## 6. 更新记录

| 类型 | 目标 | 说明 |
|------|------|------|
| initial | C-02 | 首次生成：控制会话聚合根 + 快照值对象 + 5 个接口（2 既有变更） |
| enum_value_added | stageTimingMode | +`free`（#6 配置保存白名单） |
| interface_added | #1 #2 #3 #4 | 会话开启/结束/上报/拉取 |
| interface_changed | #5 display stream | 新增 `state`/`session` 事件类型 |
| event_added | state / session | SSE 领域事件 |

> 版本规则：v1.0（initial）；后续按词汇表递增 minor。

## 更新日志

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-10-10 | initial（见上表） |
