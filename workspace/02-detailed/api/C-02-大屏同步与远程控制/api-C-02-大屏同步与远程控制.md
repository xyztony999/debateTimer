# C-02 大屏同步与远程控制 API 设计

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定(逆向归档) |
| 最后更新 | 2026-11-11 |
| 模块编码 | C-02(核心业务域) |
| 子模块 | C-02-01 同步会话管理 / C-02-02 大屏跟随呈现 / C-02-03 设备配对 / C-02-04 远程遥控 |
| 上游依据 | 《C-02 大屏同步与远程控制 PRD》v1.0(DDD 建模:聚合根=同步会话 TimerSession)、应用架构 2.1.2 |
| 功能类型 | 业务流程类 + 集成对接(会话状态机 + 三端一服快照/指令/信令协议) |
| 主要实现 | `server/lib/timerSessions.js`(聚合根注册表)、`server/routes/configurations.js:234-342`(会话端点)、`server/routes/display.js`(大屏端点)、`server/routes/pairing.js`(配对)、`server/lib/sseHub.js`(SSE 基建,属 P-01) |

> **路由归属说明(如实归档)**:控制会话五端点物理上挂在 `/api/configurations/:name/session…` 路由下(历史原因,`server/routes/configurations.js:234` 注释「Control session (timer state sync)」),语义归属 C-02,本文按语义归档;配置 CRUD 本体(`GET/PUT/DELETE /api/configurations(:name)`、share、visibility)属 S-02,不在本文范围。

## 1. 模块设计概述

### 1.1 业务背景及目标

让现场大屏与远程设备实时跟随同一场比赛:计时主机(计时台)开启**同步会话**并逐秒上报计时快照;大屏经 SSE 订阅**只读跟随**;手机经**配对码**接入或同网 **P2P 直连**成为瘦遥控器。服务端持有一个**内存型会话注册表**(每 shareToken 至多一个活跃会话,进程重启即失),会话即本模块聚合根。业务目标(PRD G1):大屏与主机锁步同秒翻转;一场比赛一个权威(永不双主机);手机即遥控器(指令不丢不重);弱网优雅降级。

### 1.2 边界说明

| 做什么 | 不做什么(归属) |
|--------|---------------|
| 控制会话生命周期端点(开启/上报/停止)与冲突仲裁 | 计时决策引擎(C-01,会话只镜像与转发指令) |
| 大屏 SSE 快照流(state/session/command/signal/change)与状态查询端点 | SSE 基建/限流/重连通用机制(P-01/P-02,本文只定义其上的会话语义) |
| 配对端点(owner-scoped 4 位码仲裁) | share 开关与 token 生成/轮换(S-02,shareEnabled/shareToken 是本模块的会话前置) |
| 遥控指令中转(排队+单调序号)与 WebRTC 信令透传 | 记录保存业务模型(S-04,本模块只在会话结束时触发一次自动保存) |
| 快照校验/归一/三段时钟补偿 | 大屏页样式与横幅交互细节(D4) |

### 1.3 设计决策

| # | 决策 | 理由 | 依据 |
|---|------|------|------|
| D1 | 会话注册表纯内存(不落库) | 会话生命周期=一场比赛,持久化价值为零;进程重启由消费端 sessionId 代际检测自愈 | `server/lib/timerSessions.js:71-77`、PRD BR-C02-02 |
| D2 | 每 shareToken 至多一个活跃会话,新建即顶替(superseded) | 「一场比赛一个权威」;顶替广播 ended 让旧控制端回退 | `server/lib/timerSessions.js:122-125` |
| D3 | 快照 seq 单调 + sessionId 主权仲裁(409 session_taken) | 永不双主机:seq 防重放/乱序,sessionId 防「同 token 下被顶替的旧控制端继续上报」 | `server/lib/timerSessions.js:166-178,329-332` |
| D4 | 指令经 SSE 双流推送(token 流+owner 流),主机上报即 ack | 指令不丢(离线缓冲 ≤32)且不重(主机按 commandSeq 单调去重);无独立 ack 协议 | `server/lib/timerSessions.js:211-213,229-270` |
| D5 | 三段时钟补偿(上行 ≤2s / 在途 ≤3s / EMA 时钟偏差) | 端到端不引入系统性秒差,大屏与主机同秒翻转 | `server/lib/timerSessions.js:183-207`、`src/timer/snapshotCodec.js:14-44` |
| D6 | 信令透传不解释、不排队、不存储(≤32KB) | WebRTC 握手帧一次性;服务端零 WebRTC 语义 | `server/lib/timerSessions.js:272-296` |
| D7 | 配对 owner-scoped | 配对码只可能命中提交者本人的活跃会话,防跨用户劫持 | `server/routes/pairing.js:3-7`、`server/lib/timerSessions.js:298-313` |

### 1.4 领域对象总览

| 对象 | 分类 | 说明 |
|------|------|------|
| 同步会话 TimerSession | **聚合根** | 内存注册表 Map<shareToken, session>,每 token 至多一个(`server/lib/timerSessions.js:75-77`) |
| 会话快照 TimerSnapshot | 值对象(发布语言) | 聚合根只保留最新一份 lastSnapshot,按 seq 整体替换(§4.4.8 wire schema) |
| 遥控指令 RemoteCommand | 值对象 | `{type, side?\|stageId?\|kind?, commandSeq, at}`,不可变帧(§4.4.6) |
| 待执行指令缓冲 pendingCommands | 域内实体(集合) | 离线缓冲 ≤32,主机上报即清(`server/lib/timerSessions.js:17,211-213`) |
| 配对码 PairingCode | 值对象 | 4 位数字,随会话生灭,同会话现存码去重(`server/lib/timerSessions.js:114-116,131-137`) |
| 子流程:会话自愈 recoverSession | 子流程(客户端) | 400 无活跃会话 → 退避重建(PRD §12) |
| 子流程:P2P 直连建立 | 子流程(客户端) | 信令经会话通道透传,3s 握手超时回退中转(PRD §12) |
| 关联领域对象 | — | 计时引擎状态(C-01,快照载荷来源)/ 赛制配置(S-02,share 生死)/ 用户账号(S-01/D-01,鉴权)/ 比赛记录(S-04,会话结束自动保存) |

### 1.5 上下文映射

| 集成边 | 模式 | 落点 |
|--------|------|------|
| C-02 ↔ C-01(核心↔核心) | OHS+PL | 快照=发布语言(`buildSnapshot`,`src/timer/snapshotCodec.js:54-79`);指令=命令消息(执行为引擎动作,`src/timer/useTimerSessionSync.js:538-568`) |
| C-02 ← S-02(核心←支撑) | ACL | 大屏配置投影 `toDisplayResponse` / `isShareVisible`(`server/lib/configDocs.js:268-286`);share 关闭/轮换杀会话(`server/routes/configurations.js:216-220`) |
| C-02 ← S-01/D-01 | 遵奉者 | `requireAuth` 中间件标准协议(`server/lib/authMiddleware.js`) |
| C-02 → S-04 | OHS | 会话结束/显式停止触发一次自动保存(`src/timer/useTimerSessionSync.js:284-289,419-426`) |
| C-02 ↔ 大屏/遥控浏览器 | ACL+PL | 匿名面仅暴露 shareToken 视角(display 路由),内部模型(ownerId/configId)不外泄 |

## 2. 跨聚合根设计

**不适用(裁剪)**:本模块单聚合根(同步会话)。与 C-01 引擎、S-04 记录的协作均为关联域边界交接(§1.5),不构成跨聚合根编排。

## 3. 应用/基础设施层设计

### 3.1 接口规范

- **路径格式**:既有实现为 `/api/{域}/{资源}(/{标识})/{动作}`,HTTP 动词表达语义(POST 开启、PUT 上报、DELETE 停止)。逆向归档如实记录,不追溯改写为三段式;新增接口应遵循三段式。
- **响应包络**:统一 `{ success: boolean, message?: string, data?: object, code?: string }`;`code` 仅在客户端需要机器可读仲裁时附带(D29 的 `session_taken`,由 `sendError` 统一透出,`server/routes/configurations.js:19-30`)。
- **时间语义**:全部 epoch 毫秒;出站快照每次投递刷新 `serverTime` 打点(D20,`server/lib/timerSessions.js:28-40`);`sessionId` 为会话代际标识(D23),随服务重启/重建变化。
- **SSE 帧**:`event: <名称>\ndata: <JSON>\n\n`;帧 JSON 紧凑单行。
- **用户类型标注**:每个接口标注允许的用户类型(计时操作员=模板 owner / 注册用户 / 大屏观众=匿名)。

### 3.2 依赖与约束

| 依赖 | 性质 | 约束 |
|------|------|------|
| `sseHub`(P-01) | 平台机制 | `sendToToken`(按 shareToken)/`sendToOwner`(按 userId)/`broadcast`(config change 路由)(`server/lib/sseHub.js:17-64`) |
| configurations 集合 | S-02 数据 | 只读消费 shareEnabled/shareToken/ownerId/name/debateStages;会话开启前置 `shareEnabled && shareToken`(`server/lib/timerSessions.js:118-121`) |
| `requireAuth` | S-01/D-01 | 会话端点(router 级,`server/routes/configurations.js:33-34`)与配对(路由级,`server/routes/pairing.js:11`) |
| display 限流器(P-02) | 平台机制 | /api/display 每IP 60/分钟默认,SSE 连接计数一次(`server/index.js:126`、`server/lib/rateLimits.js:33-39`) |
| 单进程内存 | 部署约束 | 注册表/缓冲/序号全部进程内存态,不可多实例水平扩展(单实例部署为既定形态) |

### 3.3 权限模型

| 接口组 | 守卫 | 用户类型 | 规则 |
|--------|------|---------|------|
| 会话端点 `/api/configurations/:name/session…` | `requireAuth`(router 级)+ owner 校验 | 计时操作员(仅模板 owner) | 404 配置不存在;403 非 owner——**管理员不代控他人模板**(`server/routes/configurations.js:234-256`) |
| 配对 `POST /api/session/pair` | `requireAuth`(路由级) | 注册用户 | owner-scoped:只匹配提交者本人的活跃会话(`server/routes/pairing.js:3-7`) |
| display 三端点 `/api/display/:token…` | 匿名 + 每 IP 限流 | 大屏观众(无需登录) | 仅当 `shareEnabled && shareToken` 可见,否则 404(`server/lib/configDocs.js:284-286`) |
| 主机命令/信令接收 | 经 owner SSE 流(`/api/configurations/stream`) | 计时操作员 | 认证客户端只收自己的流,admin 收全部 change(`server/lib/sseHub.js:17-34`) |

### 3.4 公共规范(枚举池 / 错误码 / 配置项)

**枚举池**:

| 枚举 | 取值 | 出处 |
|------|------|------|
| stageMode | single / double / free | `server/lib/timerSessions.js:3` |
| phase(phaseAff/phaseNeg) | running / grace / locked | `server/lib/timerSessions.js:5` |
| activeSide | aff / neg / none | `server/lib/timerSessions.js:4` |
| command type | start / stop / reset / toggle / applyStage / soundCheck | `server/lib/timerSessions.js:14` |
| soundCheck kind | warn30 / end | `server/lib/timerSessions.js:15` |
| command side | single / aff / neg | `server/lib/timerSessions.js:16` |
| SSE 会话事件 type | started / ended / expired | `server/lib/timerSessions.js:79-94,155` |
| session 结束原因 reason | superseded / closed_by_operator / share_disabled / heartbeat_timeout | `server/lib/timerSessions.js:91-94,124,155,217-223` 及 `server/routes/configurations.js:219,337` |

**错误码表**(包络 `success:false` + HTTP 状态码 + 可选 `code`):

| HTTP | code | 场景 | 出处 |
|------|------|------|------|
| 400 | — | 快照校验失败(seq 落后/未知阶段/非法模式/时长宽限越界/phase⇔grace 不一致)、无活跃会话、sharing 未开启、指令/信令非法、配对码非 4 位 | `server/lib/timerSessions.js:22-26,325-406` |
| 401 | — | 未认证(requireAuth):`{success:false,message:'Authentication required'}` | `server/lib/authMiddleware.js:42` |
| 403 | — | 非 owner 操作配置会话;跨用户访问 | `server/routes/configurations.js:248-255` |
| 404 | — | 配置不存在;配对无匹配;display 链接不存在或未开放分享 | `server/routes/configurations.js:241-247`、`server/routes/pairing.js:14-19`、`server/routes/display.js:22-27` |
| 409 | `session_taken` | 上报携带的 sessionId ≠ 在席会话(主权仲裁);另:会话容量满(create,无 code) | `server/lib/timerSessions.js:172-178,126-130` |
| 429 | — | 待执行指令 >32;display 匿名限流(带 `Retry-After` 头) | `server/lib/timerSessions.js:257-261`、`server/lib/rateLimit.js:33-34` |
| 500 | — | 未分类异常(message 透出) | `server/routes/configurations.js:19-30` |

**配置项**(env 可调,默认值不变):

| 配置 | 默认 | 含义 | 出处 |
|------|------|------|------|
| DISPLAY_RATE_WINDOW_MS / DISPLAY_RATE_MAX | 60000 / 60 | display 匿名面限流窗口与阈值 | `server/lib/rateLimits.js:33-39` |
| 会话容量 capacity | 100 | 注册表容量(create 超限 409) | `server/lib/timerSessions.js:75` |
| heartbeatTimeoutMs | 30000 | 心跳超时(惰性过期判定) | `server/lib/timerSessions.js:75,105-108` |
| MAX_PENDING_COMMANDS | 32 | 待执行指令缓冲上限 | `server/lib/timerSessions.js:17` |
| MAX_SIGNAL_BYTES | 32KB | 信令帧上限 | `server/lib/timerSessions.js:19-20` |
| 上行补偿钳制 | 2000ms | captureServerAt 偏移上限 | `server/lib/timerSessions.js:187` |

## 4. 聚合根详细设计

### 4.1 领域模型

**管理模式声明**:不适用混合模式——会话为纯服务端内存态,无自管/托管来源之分。

**表结构组合**:**无数据库表**。聚合根存活于内存 `Map`(进程重启即失,BR-C02-02);无仓储契约、无 SQL。S-02 的 `configurations` 集合是会话的**前置只读输入**,不是本聚合根的存储(`server/lib/timerSessions.js:71-77`)。

**聚合根标识**:全局标识= `shareToken`(定位)+ `sessionId`(代际,`randomBytes(12)` hex,`server/lib/timerSessions.js:140`)。

**聚合根字段**(`server/lib/timerSessions.js:139-153`):

| 字段 | 类型 | 说明 |
|------|------|------|
| sessionId | string | 会话代际标识;重建即换新,消费端据此重置 seq 去重(D23) |
| configId / configName / ownerId | ref | 所属模板与 owner(配对与指令路由按 owner) |
| shareToken | string | 注册表键;每 token 至多一个活跃会话 |
| stageIds | Set<string> | 会话模板合法阶段集(快照 stageId 与 applyStage 指令的校验域) |
| startedAt / lastSeenAt | epoch ms | 创建时刻 / 最近心跳;`now - lastSeenAt > 30s` 判过期(读时惰性,`server/lib/timerSessions.js:97-110`) |
| lastSeq | int | 已接受最大快照 seq(单调门槛) |
| lastSnapshot | TimerSnapshot | 最新已验证快照(聚合内唯一保留) |
| lastCommandSeq | int | 已分配指令序号(单调递增) |
| pendingCommands | RemoteCommand[] | 待执行指令缓冲(≤32;主机上报即清空) |
| pairingCode | string(4 位) | 配对码;创建时与现存码去重(单轮扫描,`server/lib/timerSessions.js:131-137`) |

**不变量**:

| # | 不变量 | 出处 |
|---|--------|------|
| INV-C02-1 | 每 shareToken 至多一个活跃会话;create 同 token 旧会话必先按 superseded 结束 | `server/lib/timerSessions.js:122-125` |
| INV-C02-2 | lastSeq/lastSnapshot/lastSeenAt/pendingCommands 在注册表单线程内一致演进(A1) | `server/lib/timerSessions.js:161-215` |
| INV-C02-3 | 快照 seq 严格大于 lastSeq;落后者 400 | `server/lib/timerSessions.js:329-332` |
| INV-C02-4 | 携带不一致 sessionId 的上报必被 409 session_taken 拒绝(未携带按 legacy 仅 seq 校验) | `server/lib/timerSessions.js:166-178` |
| INV-C02-5 | 指令 commandSeq 全会话单调递增;缓冲上限 32 | `server/lib/timerSessions.js:257-265` |
| INV-C02-6 | 主机上报 ⇒ pendingCommands 清空(快照回流即指令 ack) | `server/lib/timerSessions.js:211-213` |
| INV-C02-7 | 出站快照必带投递时刷新的 serverTime 与 sessionId(D20/D23) | `server/lib/timerSessions.js:28-40` |

**领域服务**:无独立服务对象——`create/report/end/pushCommand/relaySignal/pairByCode/snapshotOf` 均为注册表闭包方法(`server/lib/timerSessions.js:322`)。

**业务常量**:见 §3.4 配置项;另 `MAX_REMAINING_MS=24h`、`MAX_GRACE_MS=300s`(`server/lib/timerSessions.js:6-7`)。

**标签池**:不适用(无标签/检索语义)。

### 4.2 状态模型

**会话生命周期(服务端聚合根)**:

```
create(前置 shareEnabled;同 token 旧会话广播 ended/superseded)
   ──▶ active ──(operator DELETE / share 关闭或轮换 token)──▶ ended(广播 ended)
        │  ▲
        │  └── report 刷新 lastSeenAt(心跳)
        └──(任意读操作发现 >30s 无心跳)──▶ expired(广播 expired,惰性清除,无定时器)
```

- 流转触发者:计时操作员(开启/停止)、S-02 配置层(share_disabled)、心跳超时(系统惰性判定)。
- 无驳回/撤回语义;无状态历史(会话不落库)。
- 顶替语义:同 token 重复 create → 旧会话 `ended/superseded`,新会话顶替(`server/lib/timerSessions.js:122-125,155`)。
- 过期语义:读时判定(任意 `get`),无后台定时器(`server/lib/timerSessions.js:96-110`)。

出处:`server/lib/timerSessions.js:96-110,118-158,217-224`、`server/routes/configurations.js:216-220,331-342`、PRD §6.1。消费端(控制端自愈/跟随横幅/遥控回退)状态机属客户端装配,见 PRD §6.2~§6.5,不在服务端接口契约内。

### 4.3 子流程设计

| 子流程 | 触发 | 输入 → 输出 | 与服务端接口的关系 |
|--------|------|------------|------------------|
| 会话自愈 recoverSession(客户端) | 上报失败分类=recover(400「No active session」) | 退避 5s×2ⁿ(封顶 30s)→ 重新调 `POST …/session` → 新 sessionId/pairingCode,seq 回退到初始快照 seq | 复用开启端点;自愈成功即补报一次(`src/timer/useTimerSessionSync.js:296-357,345`) |
| P2P 直连建立(客户端) | 进入遥控模式 | 信令 offer/answer/ice 经 `POST …/session/signal` 透传 → DataChannel open(≤3s 超时回退中转) | 复用信令端点;服务端不感知直连结果(`src/timer/rtcChannel.js:40-44`) |
| 配对发现/接管(客户端) | 打开配对对话框 / 跟随页接管 | 探测本模板活跃会话(direct connect)→ 接管=采纳当前快照+以在席 sessionId 恢复上报 | 接管不新建会话;原控制端下次心跳被判 409 让位(`src/timer/useTimerSessionSync.js:623-649,704-718`) |

### 4.4 接口设计

#### 4.4.1 接口清单

| # | 方法与路径 | 语义 | 权限 | 子模块 |
|---|-----------|------|------|--------|
| API-1 | `POST /api/configurations/:name/session` | 开启同步会话 | owner(认证) | C-02-01 |
| API-2 | `PUT /api/configurations/:name/session/state` | 上报计时快照(reportSnapshot) | owner(认证) | C-02-01 |
| API-3 | `POST /api/configurations/:name/session/command` | 遥控指令中转 | owner(认证) | C-02-04 |
| API-4 | `POST /api/configurations/:name/session/signal` | WebRTC 信令透传 | owner(认证) | C-02-04 |
| API-5 | `DELETE /api/configurations/:name/session` | 停止同步会话 | owner(认证) | C-02-01 |
| API-6 | `GET /api/display/:token` | 大屏配置投影 | 匿名(限流) | C-02-02 |
| API-7 | `GET /api/display/:token/state` | 大屏会话状态查询 | 匿名(限流) | C-02-02 |
| API-8 | `GET /api/display/:token/stream` | **SSE 快照流**(state/session/command/signal/change) | 匿名(限流) | C-02-02 |
| API-9 | `POST /api/session/pair` | 配对码接入 | 注册用户(认证) | C-02-03 |

#### 4.4.2 API-1 开启会话

`POST /api/configurations/:name/session`(`server/routes/configurations.js:258-280`)

- **请求**:无 body;`:name`=模板名(路径参数;`?ownerId=` 仅 admin 代读场景,owner 会话端点不适用)。
- **业务规则**:
  1. 前置 `shareEnabled && shareToken`,否则 400「Sharing must be enabled before starting a session」(`server/lib/timerSessions.js:118-121`;集成测试 `server/routes/sessionRoutes.test.js:322-330`)。
  2. 同 token 已有活跃会话 → 旧会话广播 `ended/superseded` 后被顶替(`server/lib/timerSessions.js:122-125`)。
  3. 容量满(100)→ 409「Session capacity reached」(`server/lib/timerSessions.js:126-130`)。
  4. 生成 4 位配对码,与现存会话码去重(单轮扫描,`server/lib/timerSessions.js:131-137`)。
  5. 客户端约束:starting 期 ref 级互斥防双击(双 create 会互相顶替,`src/timer/useTimerSessionSync.js:365-369`)。
- **校验规则**:owner 鉴权(404/403)见 §3.3。
- **响应 200**:`data: { sessionId, shareToken, pairingCode, displayUrl: "/display/{shareToken}", status: "active", startedAt, snapshot }`——snapshot 为初始快照(seq=0,首阶段满时长双侧,`server/lib/timerSessions.js:54-69`)。

#### 4.4.3 API-2 上报快照(reportSnapshot)

`PUT /api/configurations/:name/session/state`(`server/routes/configurations.js:282-298`)

- **请求 body**(快照 + 两个可选声明字段):

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| seq | int | ✓ | 严格递增(> lastSeq);主机本地累计 |
| stageId | string | ✓ | 须 ∈ 会话 stageIds |
| stageMode | enum | ✓ | single/double/free |
| remainingAffMs / remainingNegMs | int | ✓ | 0–24h 整数毫秒 |
| runningAff / runningNeg | bool | ✓ | 双侧运行标志 |
| activeSide | enum | ✓ | aff/neg/none(归一规则见下) |
| phaseAff / phaseNeg | enum | — | running/grace/locked;缺省 running |
| graceAffMs / graceNegMs | int | — | 0–300s;缺省 0 |
| sessionId | string | — | **主权声明(D29)**:携带且 ≠ 在席会话 → 409 session_taken |
| captureServerAt | epoch ms | — | **上行补偿(D32)**:主机估计的「值被捕获时的服务器时钟」 |

- **业务规则与校验**(`server/lib/timerSessions.js:161-215,325-406`;单测 `server/lib/timerSessions.test.js:69-155,406-478`):
  1. 无活跃会话(不存在或心跳超时惰性过期)→ 400「No active session」。
  2. **sessionId 仲裁**:body.sessionId 为字符串且 ≠ session.sessionId → **409 + code=session_taken**「Session is held by another controller」;未携带 sessionId 保持 legacy 行为(仅 seq 校验,兼容旧客户端)。
  3. seq 必须为整数且 > lastSeq,否则 400「Invalid snapshot: seq must be greater than N」(客户端分类为 ignore,不结束会话)。
  4. stageId 未知 → 400;stageMode 非法 → 400;remaining 非整数或 ∉ [0, 24h] → 400;grace ∉ [0, 300s] → 400。
  5. **phase⇔grace 严格一致**:`(phase === 'grace') !== (graceMs > 0)` → 400。
  6. **服务端权威归一**:single → Neg 镜像 Aff、runningNeg=false、activeSide='none'、phaseNeg=phaseAff、graceNeg=graceAff;double → activeSide='none';free → activeSide ∈ {aff,neg,none} 否则 400。
  7. **上行补偿**:captureServerAt 为正有限数时,`uplinkMs = clamp(now − captureServerAt, 0, 2000)`,运行中侧的 remaining/grace 按其前移(不小于 0);非法值钳制或跳过。
  8. 入库:更新 lastSnapshot/lastSeq/lastSeenAt,**清空 pendingCommands**(上报即指令消费确认);向 token 流广播 `state` 帧(打新 serverTime+sessionId 戳)。
- **响应 200**:`data: { accepted: true, seq: <lastSeq>, serverTime: <Date.now()> }`——serverTime 供主机 NTP-lite 偏差测量(`sample = serverTime − (t0 + RTT/2)`,EMA 0.9/0.1,`src/timer/useTimerSessionSync.js:247-259`)。
- **失败处置(客户端契约,`src/timer/snapshotReporting.js:27-42`)**:409+session_taken → **yield 让位**(清会话、提示「另一设备正在控制」,不自愈、不保存记录);403/404 → end(结束+自动保存);400+No active session → recover(自愈重建);400+seq must be greater → ignore;其余 → retry。连续失败 ≥2 → 弱信号态。

#### 4.4.4 API-3 遥控指令中转

`POST /api/configurations/:name/session/command`(`server/routes/configurations.js:315-329`)

- **请求 body**:按 type 白名单分派(`server/lib/timerSessions.js:229-270`):

| type | 附加字段 | 校验 |
|------|---------|------|
| start / stop / reset / toggle | side ∈ {single, aff, neg} | 缺失/非法 → 400 |
| applyStage | stageId | 须 ∈ 会话 stageIds,否则 400 |
| soundCheck | kind ∈ {warn30, end} | 非法 → 400 |

- **业务规则**:待执行缓冲 ≥32 → 429「Too many pending commands」;入队并分配全会话单调 `commandSeq` 与 `at`;指令帧同时推 token 流(大屏+遥控端)与 owner 流(主机执行);主机按 commandSeq 单调去重,直连序号从 1e9 起并入同一单调空间(双源不重放,`src/timer/useTimerSessionSync.js:505-511,538-543`)。
- **ack 语义**:无独立 ack——主机执行后的下一个回流快照即隐式 ack;主机上报即清空缓冲(`server/lib/timerSessions.js:211-213`;单测 `server/lib/timerSessions.test.js:277-300`)。
- **响应 200**:`data: { commandSeq }`。

#### 4.4.5 API-4 信令透传

`POST /api/configurations/:name/session/signal`(`server/routes/configurations.js:301-312`)

- **请求 body**:`{ to: 'host' | 'remote', payload: object }`;to 非法 → 400;payload 非对象 → 400;序列化 >32KB → 400「Signal payload too large」。
- **业务规则**:一次性透传,不排队、不存储、内容不解释;帧 `{ from: to==='host' ? 'remote' : 'host', to, payload }` 推 token 流 + owner 流(`server/lib/timerSessions.js:272-296`)。
- **响应 200**:`data: { relayed: true }`。

#### 4.4.6 API-5 停止会话

`DELETE /api/configurations/:name/session`(`server/routes/configurations.js:331-342`)

- **业务规则**:owner 鉴权同前;`end` 幂等——无活跃会话返回 false 但响应仍成功(消费端视角幂等,单测 `server/lib/timerSessions.test.js:170-177`);广播 `session: ended, reason: closed_by_operator`。
- **客户端联动**:显式停止清角色记忆并触发比赛记录自动保存(`src/timer/useTimerSessionSync.js:412-427`)。
- **响应 200**:`data: { ended: true }`。
- **同类服务端触发**:share 关闭/轮换 token 时由 S-02 配置端点以 `reason: share_disabled` 杀会话(`server/routes/configurations.js:216-220`),等价于本端点效果。

#### 4.4.7 API-6/7/8 大屏端点(display 路由,匿名)

路由文件 `server/routes/display.js`(工厂注入 configurations/sse/timerSessions,`server/index.js:126` 挂载限流器)。三端点共享可见性守卫:`findShared`——token 为空、文档不存在、或 `!(shareEnabled && shareToken)` → **404「Display link not found」**(`server/routes/display.js:8-17`、`server/lib/configDocs.js:284-286`)。

**API-6 `GET /api/display/:token`**(`server/routes/display.js:75-90`)
- 大屏配置投影 `toDisplayResponse`(`server/lib/configDocs.js:268-282`):`name, schemaVersion, debateStages, timerSettings, stageOrder, stageLabels, stageGrace, stageAutoAdvance, stagePid, pidOptions?, teamNames?`。**不含** ownerId/shareToken/shareEnabled 等内部字段(匿名面 ACL)。
- **响应 200**:`data: { …投影 }`。

**API-7 `GET /api/display/:token/state`**(`server/routes/display.js:46-73`)
- 无活跃会话(不存在或已过期):`data: { active: false }`。
- 有:`data: { active: true, startedAt, snapshot }`;snapshot 为打新戳快照(serverTime+sessionId)。
- 用途:订阅前初始校准与 SSE 每次重连后的重新校准(`src/timer/useTimerSessionSync.js:799-878`)。

**API-8 `GET /api/display/:token/stream`(SSE 快照流)**(`server/routes/display.js:19-44`)
- **响应头**:`text/event-stream` + `Cache-Control: no-cache` + `Connection: keep-alive` + `X-Accel-Buffering: no`(`server/lib/sseHub.js:69-75`)。
- **连接即重放**:订阅成功后立即把当前快照作为一帧 `state` 事件发出(serverTime 打投递时刻的新戳),迟到订阅者立即追平,无需等待下一次上报(`server/routes/display.js:31-39`)。
- **承载事件**(事件名 → 载荷,见 §4.5):`state` / `session` / `command` / `signal` / `change`(配置变更:`sse.broadcast` 对 shareToken 客户端按事件内 shareToken 匹配投递,`server/lib/sseHub.js:17-34`;大屏页以同一流驱动配置跟随与计时跟随,`src/timer/useDebateConfig.js:120-128`、`src/services/ConfigurationService.js:168-169`)。
- **限流**:长连接在建立时计数一次(60/min 默认,`server/lib/rateLimits.js:33-39`;行为测试 `server/routes/displayRoutes.test.js:76`)。
- **无服务端周期心跳帧**:仅连接建立时写一次 `: connected` 注释帧(`server/lib/sseHub.js:9-15`);断线恢复依赖 EventSource 原生重连 + onOpen 重校准。

#### 4.4.8 API-9 配对

`POST /api/session/pair`(`server/routes/pairing.js:11-35`;`server/lib/timerSessions.js:298-313`)

- **请求 body**:`{ code: string }`——必须恰为 4 位数字,否则 400「Pairing code must be 4 digits」。
- **业务规则(owner-scoped 仲裁)**:遍历注册表,跳过心跳超时会话;仅当 `pairingCode` 匹配**且**会话 `ownerId` === 提交者时命中;无匹配 → **404「未找到匹配的远程控制会话」**(跨用户码必不命中,单测 `server/lib/timerSessions.test.js:350-375`)。码随会话生灭,不由客户端持久化。
- **响应 200**:`data: { configName, shareToken }`——客户端据此绑定主机模板直入遥控模式(`src/timer/useTimerSessionSync.js:653-662`)。

#### 4.4.9 跨接口复用规则 / 枚举定义

- 快照 wire schema 为 API-1(初始快照)/API-2(上报)/API-7(查询)/API-8(state 帧)共用,出站统一经 `toSnapshot` 打戳(`server/lib/timerSessions.js:28-40`);客户端编解码单一实现 `src/timer/snapshotCodec.js`。
- 指令帧为 API-3 响应、token 流 `command` 帧、owner 流 `command` 帧共用。
- 所有枚举见 §3.4 枚举池;错误码见 §3.4 错误码表。

#### 4.4.10 wire schema:会话快照 TimerSnapshot(发布语言)

```
Snapshot ::= {
  seq: int,                                  // 单调序号(线端恒 ≥1;0 保留给回退帧)
  stageId: string, stageMode: 'single'|'double'|'free',
  remainingAffMs: int, remainingNegMs: int,  // 0–24h 毫秒;single 模式 Neg 镜像 Aff
  runningAff: bool, runningNeg: bool,
  activeSide: 'aff'|'neg'|'none',            // 仅 free 非 none
  phaseAff: 'running'|'grace'|'locked', phaseNeg: 同,   // ⇔ graceMs>0 严格一致
  graceAffMs: int, graceNegMs: int,          // 0–300s
  serverTime: epoch ms,                      // 每次投递刷新(D20)
  sessionId: string                          // 会话代际(D23);直连帧可不带
}
```

出处:`server/lib/timerSessions.js:391-405`(校验归一产物)、`28-40`(出站打戳)、`src/timer/snapshotCodec.js:54-79`(客户端编码)。

### 4.5 领域事件与集成

**事件通道(进程内 SSE,非 MQ)**:

| SSE 事件 | 载荷 | 投递目标 | 触发点 |
|----------|------|---------|--------|
| `state` | Snapshot(打戳) | token 流 | create、report、连接重放(快照广播) |
| `session` | `{ type: started\|ended\|expired, reason: superseded\|closed_by_operator\|share_disabled\|heartbeat_timeout\|null, sessionId }` | token 流 | 会话生命周期跃迁(`server/lib/timerSessions.js:79-85,155,217-223`) |
| `command` | `{ type, side?\|stageId?\|kind?, commandSeq, at }` | token 流 + owner 流 | API-3 |
| `signal` | `{ from, to, payload }` | token 流 + owner 流 | API-4 |
| `change`(S-02 配置事件,借道同流) | `{ ownerId?, name?, shareToken? }` | owner 流(本人/admin 全量)与 shareToken 匹配的 display 流 | 配置 CRUD/share/visibility 广播(`server/routes/configurations.js:117-121,203-214,362-365`) |

**流拓扑(连接经济性,BR-C02-08)**:主机页恒 1 条认证流 `/api/configurations/stream`(命令/信令/配置变更复用,浏览器同源 HTTP/1.1 6 连接上限约束,`server/lib/sseHub.js:50-64`、`src/timer/useDebateTimer.js:42-51`);大屏/遥控 1 条 display 流 `/api/display/:token/stream`。

**MQ 映射**:无(无消息中间件;SSE 即集成事件通道)。

**仓储契约**:无——聚合根纯内存;无 DAO/ORM。持久化边界外的 S-02 configurations 集合与 S-04 match_logs 集合归各域文档。

**关联域调用**:

| 调用 | 方向 | 落点 |
|------|------|------|
| share 关闭/轮换 → 杀活会话(share_disabled) | S-02 → C-02 | `server/routes/configurations.js:216-220` |
| 会话结束 → 比赛记录自动保存(一次) | C-02 → S-04 | `src/timer/useTimerSessionSync.js:284-289,419-426` |
| 快照载荷来源/指令执行目标 | C-01 ⇄ C-02 | `src/timer/snapshotCodec.js:54-79`、`src/timer/useTimerSessionSync.js:538-568` |
| 鉴权结论 | S-01/D-01 → C-02 | `server/lib/authMiddleware.js`(401「Authentication required」) |

## 5. 模块清单汇总

### 5.1 对外服务清单

| 服务 | 端点/事件 | 权限 | 文档节 |
|------|----------|------|--------|
| 开启会话 | POST /api/configurations/:name/session | owner | §4.4.2 |
| 上报快照 | PUT /api/configurations/:name/session/state | owner | §4.4.3 |
| 指令中转 | POST /api/configurations/:name/session/command | owner | §4.4.4 |
| 信令透传 | POST /api/configurations/:name/session/signal | owner | §4.4.5 |
| 停止会话 | DELETE /api/configurations/:name/session | owner | §4.4.6 |
| 大屏配置 | GET /api/display/:token | 匿名 | §4.4.7 |
| 会话状态查询 | GET /api/display/:token/state | 匿名 | §4.4.7 |
| SSE 快照流 | GET /api/display/:token/stream | 匿名 | §4.4.7 |
| 配对 | POST /api/session/pair | 认证 | §4.4.8 |
| SSE 事件协议 | state/session/command/signal/change | 按流 | §4.5 |

### 5.2 SQL 清单

无(会话及其快照、指令缓冲、配对码均为内存态;本模块零数据库写入)。

### 5.3 DDL

无。

## 6. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档初始版:按现有实现归档 9 个接口(含 PUT reportSnapshot 的 sessionId 主权仲裁与 captureServerAt 上行补偿语义、SSE 快照流事件协议、owner-scoped 配对仲裁)、聚合根内存模型、错误码表与限流/容量配置 |

**变更类型词汇表**与**版本号规则**:同 D3 分册;快照 wire schema / SSE 帧结构变更视同 `interface_changed`。

---

## 附:归档核对说明(逆向归档)

- 本文所有端点行为均对照实现与测试逐条核对:会话生命周期集成测试 `server/routes/sessionRoutes.test.js:245-330`(start→report→read→subscribe→end、sharing 前置 400、未认证拒绝);注册表行为 `server/lib/timerSessions.test.js`(superseded/惰性过期/409 session_taken/上行补偿/指令排队/信令透传/配对仲裁/代际打戳);display 限流 `server/routes/displayRoutes.test.js:76`。
- 路由物理挂载与语义归属的差异(会话端点在 configurations 路由文件内)已在文档头声明。
