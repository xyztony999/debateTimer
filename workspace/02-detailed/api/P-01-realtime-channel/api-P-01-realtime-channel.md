# API 设计 — 实时通信通道（P-01-realtime-channel）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-11-11 |
| 模块编码 | P-01（平台支撑域，无子模块；文件夹 `P-01-realtime-channel`） |
| 状态 | 逆向归档（系统已上线，如实反映现有实现） |
| 输入 | P-01-realtime-channel PRD v1.0 + AA v1.0（平台支撑域）+ 现有代码 |
| 功能类型 | 工具类/平台技术机制（无聚合根、无状态机，承 PRD §7） |
| 实现索引 | server/lib/sseHub.js、server/lib/timerSessions.js、server/routes/display.js、server/routes/configurations.js:36-43、server/routes/pairing.js |

> 章节裁剪依据 d3-api 分册裁剪矩阵（工具类）：第 2 章不适用；第 3 章选填——通道协议并入 4.4；第 5 章不填。**本档为最简归档**：只记录通道机制契约（帧协议/事件目录/投递规则/容量约束）；会话业务端点（`/api/configurations/:name/session*`）的完整 HTTP 契约归 C-02 的 API 文档（P-01 PRD §7 结论），此处仅列机制级 I/O。

## 1. 模块设计概述

### 1.1 业务背景及目标

为零业务语义的实时推送提供可复用通道：**SSE Hub**（三类作用域客户端 + 具名事件定向投递）与**控制会话注册表**（按 shareToken 键控的内存态会话：快照/指令/信令中继 + 4 位配对码）。换一个领域可原样复用（AA v1.0 平台支撑域定义）。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 做什么 | SSE 连接建立协议与三类作用域投递规则；`GET /api/display/:token/stream`（display 流建立 + 快照重放）；会话注册表机制（创建/心跳过期/快照校验/指令与信令中继/配对）的 I/O 契约 |
| 不做什么 | 快照/指令的业务语义（计时语义归 C-01、会话业务语义归 C-02）；会话端点的完整 HTTP 契约（归 C-02 API 文档）；持久化（内存 Map，随进程存亡）；WebSocket（SSE 单向推送 + HTTP 上行已够用） |
| 用户类型 | 纯技术机制，不标注（AA v1.0）；使用方为 C-02 的主机控制台/display 页/遥控端 |

### 1.3 设计决策

| # | 决策 | 依据（代码） |
|---|------|-------------|
| PC-1 | 主机控制台监听**用户自流**（sendToOwner）而非再开 display 流：浏览器同源 HTTP/1.1 上限 6 连接且 SSE 永不释放，多余长流会饿死心跳请求 | server/lib/sseHub.js:50-53 注释 |
| PC-2 | 会话惰性过期：读时检查 `lastSeenAt`（默认 30s 超时即删），无常驻定时器 | server/lib/timerSessions.js:96-110 |
| PC-3 | 指令确认 = 快照回流（无独立 ack 通道）；指令队列仅为离线缓冲，主机上报快照即清空 | server/lib/timerSessions.js:210-212,226-228 |
| PC-4 | 快照每次投递重盖 `serverTime` 并携带 `sessionId`（代际守卫——消费者据此识别会话代际切换） | server/lib/timerSessions.js:28-40 |
| PC-5 | 连接关闭自动从 Hub 移除客户端；建立即发 `: connected` 注释帧 | server/lib/sseHub.js:9-15 |

### 1.4 领域对象总览

本域零业务对象、无聚合根（PRD §6）。会话记录/快照帧/指令帧/信令帧/change 载荷均为**过程数据**（P5 集成载荷、P6 平台托管），不建模，仅约束帧结构（见 4.1）。

### 1.5 上下文映射

| 外部上下文 | 集成关系 | 映射模式 |
|-----------|---------|---------|
| C-02 大屏同步与远程控制 | 会话端点的业务语义与 HTTP 契约归属方；本域提供注册表与通道 | OHS（提供方） |
| C-01 比赛计时 | 快照结构校验服务通道完整性，语义透传 | PL |
| S-02 赛制模板管理 | configurations 变更的 `change` 广播来源 | PL |

## 2. 跨聚合根设计

不适用（无聚合根）。

## 3. 应用/基础设施层设计

选填章节，不设——通道协议与帧结构在 4.4 统一给出。

## 4. 聚合根详细设计（无聚合根模块的机制契约）

### 4.1 领域模型（过程数据帧结构）

| 帧 | 结构（发送侧） | 约束 |
|----|---------------|------|
| 快照 state | `{seq, stageId, stageMode, remainingAffMs, remainingNegMs, runningAff, runningNeg, activeSide, phaseAff, phaseNeg, graceAffMs, graceNegMs, serverTime, sessionId}` | seq 单调递增；remainingMs ∈ [0, 24h]；graceMs ∈ [0, 300s]；grace 相位 ⇔ graceMs>0 一致；serverTime/sessionId 每次投递重盖（timerSessions.js:28-40,325-406） |
| 指令 command | `{type, commandSeq, at, side?/stageId?/kind?}` | type ∈ 枚举 CMD；commandSeq 会话内单调分配（timerSessions.js:262-264） |
| 信令 signal | `{from: 'host'\|'remote', to, payload}` | payload 为对象且 ≤32KB，不解释内容（timerSessions.js:274-296） |
| 会话 session | `{type: 'started'\|'ended'\|'expired', reason, sessionId}` | reason ∈ superseded/heartbeat_timeout/closed_by_operator/share_disabled（timerSessions.js:79-94） |
| change | `{ownerId, name?, shareToken?}` | 台账/配置变更通知（sseHub.js:17-34） |

### 4.2 状态模型

不适用——无业务状态机。通道级存活语义：会话创建 → 心跳维持（主机每 1s 上报）→ 30s 无心跳读时惰性删除（`expired/heartbeat_timeout`）或显式结束（`ended/closed_by_operator|superseded|share_disabled`）。

### 4.3 子流程设计

不适用——会话全生命周期即通道本体，无独立子流程。

### 4.4 接口设计

#### 4.4.1 SSE 通道协议（机制契约）

**连接建立**（`initSseResponse`，sseHub.js:69-75）：响应头 `Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`、`X-Accel-Buffering: no`；注册后立即发 `: connected\n\n` 注释帧；连接关闭自动移除。

**三类客户端作用域**（sseHub.js:6-7）：

| 作用域 | 注册参数 | 建立端点 |
|--------|---------|---------|
| display（匿名） | `{res, shareToken}` | `GET /api/display/:token/stream`（见 4.4.2） |
| 用户自流（登录） | `{res, userId, isAdmin}` | `GET /api/configurations/stream`（requireAuth，configurations.js:36-43） |

**投递规则**（sseHub.js:17-64）：

| 函数 | 事件 | 投递面 |
|------|------|--------|
| `broadcast(event)` | `change` | shareToken 客户端按 token 匹配；admin 全收；普通用户按 ownerId 匹配 |
| `sendToToken(token, event, payload)` | state/session/command/signal | 订阅该 token 的 display 客户端 |
| `sendToOwner(ownerId, event, payload)` | command/signal | 该用户的登录自流（主机控制台在此监听，PC-1） |

**帧格式**：`event: <name>\ndata: <JSON>\n\n`（change/state/session/command/signal 五类具名事件 + `: connected` 注释帧）。

#### 4.4.2 通道端点（P-01 直接承载的 HTTP 面）

| # | 方法 | 路径 | 契约 | 代码 |
|---|------|------|------|------|
| C1 | GET | `/api/display/:token/stream` | 匿名 display SSE 流：token 非可见分享态 → 404 `Display link not found`；建立即重放当前快照（`state` 事件，重盖 serverTime）供晚加入者立即校准；连接注册入 display 作用域 | display.js:19-44 |
| C2 | GET | `/api/configurations/stream` | 登录用户自流（requireAuth）：注册 `{userId, isAdmin}`，承载 `change` + 该用户的 command/signal | configurations.js:36-43 |
| C3 | POST | `/api/session/pair` | 4 位数字码配对（requireAuth）：码格式 `/^\d{4}$/` 否则 400；只匹配**本人**会话（owner 作用域）；命中返回 `{configName, shareToken}`，未命中 404 `未找到匹配的远程控制会话` | pairing.js:11-35、timerSessions.js:299-313 |

#### 4.4.3 会话注册表机制 I/O（HTTP 契约归 C-02 API 文档，此处记机制级 I/O）

| 机制 | 输入 | 输出/错误 | 代码 |
|------|------|----------|------|
| create | 归属人配置文档（要求 shareEnabled+shareToken） | 会话对象（sessionId=24hex、4 位配对码、初始快照）；同 token 旧会话 `ended/superseded` 让位；容量 100 满抛 409 `Session capacity reached`；配对码同码冲突重摇一次 | timerSessions.js:118-158 |
| report | 快照 body（+可选 sessionId/captureServerAt） | 校验入库 + 广播 state；不同 sessionId → 409 `session_taken`；seq ≤ lastSeq → 400；`captureServerAt` 上行补偿前移运行时钟（钳 ≤2s）；上报后清空指令队列 | timerSessions.js:160-215,325-406 |
| end | shareToken + reason | 广播 `session/ended/<reason>` | timerSessions.js:217-224 |
| pushCommand | `{type, ...}` | 白名单校验（type ∉ CMD → 400）；队列 ≥32 → 429 `Too many pending commands`；分配 commandSeq 后双推（display 流 + 主机自流） | timerSessions.js:229-270 |
| relaySignal | `{to: 'host'\|'remote', payload}` | to 非法/payload 非对象/>32KB → 400；一次性转发 `signal` 帧（不排队不落库） | timerSessions.js:274-296 |
| pairByCode | ownerId + 4 位码 | 命中本人会话或 null；过期会话跳过 | timerSessions.js:299-313 |
| snapshotOf | shareToken | 重盖 serverTime/sessionId 的快照或 null | timerSessions.js:317-320 |

#### 4.4.4 枚举定义（通道白名单，已入池 enum-pool.md，编号如下）

- `stageMode`: EP-TIMER-01——`single` / `double` / `free`（timerSessions.js:3）
- `activeSide`: EP-TIMER-03——`aff` / `neg` / `none`（timerSessions.js:4）
- `phase`: EP-TIMER-02——`running` / `grace` / `locked`（timerSessions.js:5）
- `commandType`: EP-SESSION-06——`start` / `stop` / `reset` / `toggle` / `applyStage` / `soundCheck`（timerSessions.js:14）
- `soundCheckKind`: EP-TIMER-06——`warn30` / `end`（timerSessions.js:15）
- `commandSide`: EP-TIMER-04——`single` / `aff` / `neg`（timerSessions.js:16）
- `signalTarget`: EP-SESSION-07——`host` / `remote`（timerSessions.js:280-282）

### 4.5 领域事件与集成

无 MQ、无领域事件持久化。集成即 SSE 投递本身（4.4.1）；断线语义由客户端侧承担（EventSource 原生重连 + 重放校准 + 直连回退，归 C-02/前端规格，P-01 PRD FR-4）。

## 5. 模块清单汇总

工具类不填。通道端点消费方：display 页（C1）、主机控制台（C2）、遥控端（C3 与 session 端点，归 C-02 文档）。

## 6. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档初稿（平台支撑域最简归档）：SSE 帧协议/三类作用域投递规则/通道端点 C1~C3/会话注册表机制 I/O；会话业务端点完整契约归 C-02 API 文档。验证：`bun test server/` 85 pass / 0 fail（本归档会话执行） |
