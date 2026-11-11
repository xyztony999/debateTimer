# PRD — 实时通信通道（P-01）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-11-11 |
| 模块编码 | P-01（平台支撑域，无子模块） |
| 状态 | 逆向归档（系统已上线，如实反映现有实现） |
| 关联 | C-02 大屏同步与远程控制（会话业务语义的归属域）、C-01 比赛计时（快照生产方）、S-02 赛制模板管理（configurations 变更广播的来源） |
| 实现索引 | server/lib/sseHub.js、server/lib/timerSessions.js、server/routes/display.js、server/routes/configurations.js:36-43,258-342、server/routes/pairing.js、src/services/TimerSessionService.js、src/timer/rtcChannel.js、src/timer/useTimerSessionSync.js |

## 1. 业务目标与范围

### 1.1 业务目标（G1）

为「大屏跟随 / 遥控 / 模板台账刷新」提供零业务语义的实时通道：**SSE 服务端推送**（三种作用域的订阅与定向投递）+ **控制会话注册表**（按 shareToken 键控的内存态会话与指令/信令中继）+ **WebRTC 数据通道**（同网直连，失败回退服务器中转）。换一个领域可原样复用（AA v1.0 平台支撑域定义）。

### 1.2 功能范围（G2）

**做什么**：
- SSE Hub：三类客户端（匿名 shareToken 订阅 / 登录用户自流 / admin 全量），`change` 广播 + 具名事件定向投递（`state`/`session`/`command`/`signal`）
- 控制会话：创建（含 4 位配对码）、心跳过期（惰性判定）、快照上报（校验+时钟补偿）、指令中继（队列缓冲 + SSE 推送）、WebRTC 信令中继（一次性帧）、按配对码配对、快照重放
- 断线语义：EventSource 原生重连 + 连接恢复后经 `state` 重放/`GET state` 重新校准；显示端 5s 无快照转弱信号提示

**不做什么**：
- 不解释业务载荷——快照/指令/信令的结构校验服务于通道完整性（seq 单调、容量、字节数），计时语义归 C-01、会话业务语义归 C-02
- 不做持久化——会话随进程存亡（内存 Map），重启即清空；不做跨进程/多实例分发（单进程部署）
- 不做 WebSocket 长连接（SSE 单向推送 + HTTP 上行已满足单向广播 + 瘦指令场景）

### 1.3 决策记录（现有实现的关键取舍）

| # | 决策 | 依据（代码注释/实现） |
|---|------|---------------------|
| PC-1 | 主机控制台监听**用户自流**（sendToOwner）而非再开一条 display 流 | 浏览器同源 HTTP/1.1 上限 6 连接且 SSE 永不释放，多余长流会饿死心跳请求（server/lib/sseHub.js:50-53 注释） |
| PC-2 | 会话惰性过期：读时检查 `lastSeenAt`，无常驻定时器 | server/lib/timerSessions.js:96（INV-3 注释） |
| PC-3 | 指令确认 = 快照回流，无独立 ack 通道；队列仅为离线缓冲，主机上报即清空 | server/lib/timerSessions.js:226-228, 211-212 |
| PC-4 | 快照每次投递重盖 `serverTime` 并携带 `sessionId`（代际守卫） | server/lib/timerSessions.js:28-40（D20/D23 注释） |
| PC-5 | WebRTC 仅 host 候选（`iceServers: []`），3s 握手超时即放弃回退中转 | src/timer/rtcChannel.js:11-15, 40-44 |

## 2. 角色与对象

- **角色（G3）**：纯技术机制，无业务角色（AA v1.0 不标注用户类型）；使用方为主机控制台、大屏 display 页、遥控端（均属 C-02 的角色体系）。
- **领域对象（G4/G5）**：本域零业务对象。会话/快照/指令/信令帧均为通道承载的**过程数据**，见 §6。

## 3. 功能需求

### FR-1 SSE Hub（三种作用域）

- 连接建立：`initSseResponse` 置 `text/event-stream` / `no-cache` / `keep-alive` / `X-Accel-Buffering: no`；`add` 即发 `: connected` 注释帧，连接关闭自动移除客户端（server/lib/sseHub.js:69-75, 9-14）
- 匿名 display 流：`GET /api/display/:token/stream`（校验分享可见性，404 若未分享；连接即重放当前快照方便晚加入者立即校准）（server/routes/display.js:19-44）
- 登录自流：`GET /api/configurations/stream`（携带 userId + isAdmin 标记）（server/routes/configurations.js:36-43）
- 投递规则（server/lib/sseHub.js:17-64）：
  - `broadcast(event)`：shareToken 客户端按 token 匹配；admin 全收；普通用户按 ownerId 匹配（`change` 事件，模板/台账变更用）
  - `sendToToken(token, event, payload)`：具名事件定向到订阅该 token 的 display 客户端（state/session/command/signal）
  - `sendToOwner(ownerId, event, payload)`：具名事件定向到该用户的登录自流（主机控制台在此收 command/signal）

### FR-2 控制会话注册表（内存，按 shareToken 键控）

- 创建 `POST /api/configurations/:name/session`（仅模板归属人）：要求 shareEnabled+shareToken；同 token 旧会话以 `ended/superseded` 让位；容量 100 满 409；生成 4 位配对码（同码冲突重摇一次）；广播 `session/started` + 初始快照（server/lib/timerSessions.js:118-158、server/routes/configurations.js:258-280）
- 心跳与过期：容量 100、心跳超时 30s（`heartbeatTimeoutMs=30000`），读时惰性判定过期即删并广播 `session/expired/heartbeat_timeout`（server/lib/timerSessions.js:75, 97-110）
- 快照上报 `PUT .../session/state`（仅归属人）：
  - 主权仲裁：携带不同 `sessionId` → 409 `session_taken`（让位提示语义，server/lib/timerSessions.js:166-178）
  - 校验：seq 单调递增（≤lastSeq 400）、stageId 必须在会话阶段集、stageMode ∈ single/double/free、剩余时间 0~24h、宽限 0~300s、grace 相位 ⇔ graceMs>0 一致性、单计时模式折叠双方（server/lib/timerSessions.js:325-406）
  - 上行链路补偿：按 `captureServerAt` 前移运行时钟，钳制 ≤2s（D32，server/lib/timerSessions.js:180-207）
  - 响应携带 `serverTime` 供 NTP-lite 钟偏测量（server/routes/configurations.js:293-293）
- 结束 `DELETE .../session`：广播 `session/ended/closed_by_operator`；分享关闭/换 token 亦以 `share_disabled` 结束会话（server/routes/configurations.js:218-220, 331-342）

### FR-3 指令与信令中继

- 指令 `POST .../session/command`（仅归属人）：type ∈ start/stop/reset/toggle/applyStage/soundCheck；applyStage 校验 stageId、soundCheck 校验 kind、其余必须携带合法 side(single/aff/neg)；队列上限 32（超出 429）；commandSeq 单调分配；`command` 事件同时推 display 流 + 主机自流（server/lib/timerSessions.js:14-20, 229-270）
- 信令 `POST .../session/signal`（仅归属人）：`to` ∈ host/remote、payload 为对象且 ≤32KB，不解释内容、不排队不落库，一次性转发为 `signal` 事件（server/lib/timerSessions.js:18-20, 274-296）
- 配对 `POST /api/session/pair`（登录用户）：4 位数字码 + 归属人作用域（只匹配自己的会话），返回 configName/shareToken（server/lib/timerSessions.js:299-313、server/routes/pairing.js:11-35）

### FR-4 客户端断线与重连语义

- EventSource 单连接订阅 display 流，监听 `state/session/command/signal` 四类具名事件；原生自动重连，不做 onerror 干预，重连成功（onOpen）后经 `loadDisplayState` 重新校准（src/services/TimerSessionService.js:159-222 注释）
- 主机心跳：会话激活/弱态下每 1s 上报快照（D22 节奏，src/timer/useTimerSessionSync.js:755-763；grep `setInterval` 命中 :758）
- 显示端弱信号：跟随中 5s 无快照转「弱信号」横幅（src/timer/useTimerSessionSync.js:779-787）
- 代际守卫：快照携带的 sessionId 变化即重置 seq 去重（服务重启代际切换不误判陈旧，src/timer/useTimerSessionSync.js:104-111）；钟偏 EMA 估计（robust 采样，偏离 >1500ms 丢弃，src/timer/useTimerSessionSync.js:113-121）
- P2P 直连：遥控端发起 offer/answer/ICE 经信令中继交换，DataChannel 3s 未开即放弃并回退服务器中转；直连帧不经服务端代际守卫（src/timer/rtcChannel.js:11, 40-44、src/timer/useTimerSessionSync.js:85-89）

## 4. 非功能需求（N1/N2）

- 时延：指令端到端（遥控按钮 → 主机执行 → 大屏呈现）≤1s（网络正常，历史 PRD 承诺延续）
- 容量：并发会话 ≤100（capacity=100，超出 409）；单会话待处理指令 ≤32；信令帧 ≤32KB
- 存活：会话心跳 30s 超时；显示端弱信号判定 5s
- 降级：P2P 直连失败/断开无缝回退服务器中转；SSE 断线原生重连 + 重放校准
- 单进程内存态：重启丢会话，客户端以代际守卫+重放自愈（N2 异常场景）

## 5. 验收标准

1. 会话全生命周期（start→report→read→subscribe→end）与「未开分享不能开会话」在服务端套件通过（`bun test server/` → sessionRoutes.test.js、displayRoutes.test.js，2026-11-11 执行，85 pass / 0 fail）
2. 匿名调用 requireAuth 挂载的会话接口被拒绝（sessionRoutes.test.js「unauthenticated callers are rejected」）
3. 快照校验（seq/stageId/mode/grace 一致性）由 validateSnapshot 全量单测约束（server/lib/timerSessions.test.js，随上述套件通过）
4. 指令 429（队列满）、信令 32KB 上限、配对码 4 位与归属作用域：代码路径见 §3 FR-3 引用行；timerSessions.test.js 覆盖其中会话级行为
5. 显示端弱信号/断线重连/直连回退：客户端行为，本归档会话未运行浏览器端测试（历史 PageSpec 决策 D20-D34 固化于代码注释与既有测试）

## 6. 领域建模（D2-2，平台支撑域裁剪）

| 项目 | 内容 |
|------|------|
| 本域名称 | 实时通信通道（P-01） |
| 领域分层 | 平台支撑域（零业务语义纯技术机制，AA v1.0） |
| 聚合根 | 无（ControlSession 注册表为技术机制，业务语义的「同步会话」聚合根归 C-02） |

### 领域对象清单（全部为过程数据，不建模）

| 数据项 | 类别 | 处理方式 |
|--------|------|---------|
| 会话记录（sessionId/pairingCode/lastSeq/pendingCommands 等） | P6 平台托管 | 内存 Map，随进程存亡；业务投影归 C-02 |
| 快照帧（seq/stageId/remainingMs/...） | P5 集成载荷 | 结构校验后透传；语义归 C-01 |
| 指令帧（type/side/stageId/commandSeq） | P5 集成载荷 | 白名单校验 + 队列缓冲 |
| 信令帧（from/to/payload） | P5 集成载荷 | 不解释，一次性转发 |
| change 事件载荷（ownerId/name/shareToken） | P5 集成载荷 | 台账刷新通知 |

## 7. PRD 完备性自检（D2-1）

功能类型：**平台技术机制（通道）**——T 类大多不适用。

G1 ✅ §1.1｜G2 ✅ §1.2｜G3 ✅ §2（技术机制不标注业务角色）｜G4/G5 ✅ §6（零业务对象，过程数据已分类）｜T1-T5 不适用（无业务字段/状态流转/查询/导出；通道帧结构已在 FR 详列）｜T6 不适用（无外部系统）｜N1/N2 ✅ §4

**结论**：通过，可进入 D3（C-02 会话端点与 display 流的接口契约在其 API 文档中细化）。

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.0 | 2026-11-11 | 逆向归档初稿：按 D2 分册模板从现有实现（sseHub/timerSessions/rtcChannel 及挂载路由）归纳生成；平台支撑域按裁剪深度输出 |
