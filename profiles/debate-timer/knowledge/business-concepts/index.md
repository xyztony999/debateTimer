<!-- kb-generated: 2026-11-11 | sources: 11 | assumptions: 0 | open: 0 -->

# 业务概念（business-concepts）

> 逆向归档自已上线系统与 D1 三文档 v1.0（`workspace/00-architecture/`）。术语基线 = BA 附录B；
> 计时/会话域概念从 `src/timer/` 代码注释提炼。API 契约与 PRD 明细见 profile 工作区
> `workspace/02-detailed/`（本文件只留概念索引，总量纪律见引擎 03-extension-guide §2）。

## 索引结构

| 节 | 内容 | 主要来源 |
|----|------|---------|
| §1 对象总表 | 8 个业务对象（对象/英文/定义） | AA v1.0 + 代码逆向 |
| §2 核心对象详解 | 每对象：定义 + 英文 + 关键字段 +（有则）状态机 | `src/timer/`、`server/` |
| §3 状态机表 | 侧钟相位机 / 客户端会话机 / 服务端会话生命周期 | engine.js、useTimerSessionSync.js |
| §4 角色表 | 5 类用户（角色/职责/操作对象） | AA v1.0、FL v1.0 |
| §5 业务规则 | 随对象挂的硬规则 | BA v1.0 + 代码 |
| §6 术语速查 | BA 附录B 全部 8 条 + 计时域扩展术语 | business-arch.md 附录B + 代码注释 |

## 1. 对象总表

| 对象 | 英文 | 定义 |
|------|------|------|
| 赛制模板 | Configuration | 一场比赛的流程蓝本：阶段序列、时长、计时模式、多语言阶段名、队名（`configurations` 集合） |
| 比赛阶段 | Stage | 模板内的一个计时单元：名称（多语言）/时长/单双模式/宽限/自动推进/PID 视觉 |
| 计时引擎状态 | EngineState | 前端纯 reducer 持有的三侧钟真值（`src/timer/engine.js`） |
| 控制会话 | TimerSession | 聚合根：主机开启的远程控制会话，服务端**内存**缓存（不落库） |
| 同步快照 | TimerSnapshot | 值对象：主机上报/大屏采纳的线上格式（毫秒线 + seq + serverTime） |
| 配对码 | PairingCode | 接入会话的 4 位数字凭证，会话创建时生成、结束即失效 |
| 比赛记录 | MatchLog | 逐阶段实绩（计划 vs 实际、超时次数）+ 模板/队名快照（`match_logs` 集合） |
| 用户/系统配置 | User / AppSetting | `users` 集合（首个注册用户成为管理员）；`app_settings` 单文档（注册开关等） |

## 2. 核心对象详解

### 2.1 赛制模板（Configuration）

- **关键字段**（`src/timer/useDebateConfig.js:20-32` EMPTY_CONFIG）：`name`、`stages`（id→模式）、
  `stageOrder`、`stageLabels`（多语言）、`stageGrace`、`stageAutoAdvance`、`teamNames{aff,neg}`、
  `stagePid/pidOptions`（时间线视觉）、`shareEnabled/shareToken`（分享）、广场侧 `isPublic/creditName`。
- **规则**：默认模板不可删；切换与最近使用记忆；深链预选（URL `name` 参数）。
- **来源**：`server/routes/configurations.js`、FL v1.0 模板设置菜单。

### 2.2 比赛阶段（Stage）

- **关键字段**：`stageId`、`label`（zh-Hans/en/fr-CA 三语，`src/locales/`）、`mode`（single/double/free）、
  `durationSec`、`graceSec`（0–300，默认关闭）、`autoAdvance`。
- **模式编码**：`MODE_STRING = { 0:'single', 1:'double', 2:'free' }`（`src/timer/engine.js:19`）。

### 2.3 计时引擎状态（EngineState）

- **定义**：纯 reducer 拥有三侧钟 `SIDES = ['single','aff','neg']`（`src/timer/engine.js:21`），
  音效/超时事件以 `events` 挂在状态上由组装 hook 消费清空，reducer 零副作用（engine.js 头注）。
- **侧钟字段**：`{ remaining, running, phase, graceLeft, blinkOverride }`；
  全局 `tickRemainderMs`（亚秒余数累积）、`advance`（自动推进倒计时）、`freeAutoSwitch`。
- **告警窗口**：30 秒提醒闪烁窗 27–30s（`BLINK_WINDOW_HIGH/LOW`，engine.js:23-24）。

### 2.4 控制会话（TimerSession）

- **定义**：聚合根（api-timer-session.md §1.4）。寻址键 = 配置 `shareToken`（设计决策 D-1）；
  含 `sessionId`（代际标识）、`pairingCode`、心跳；**存进程内存 Map，不写 MongoDB，
  进程重启即失效**（api-timer-session.md §1.2/1.3 D-5）。
- **心跳超时**：30s（R10，`heartbeatTimeoutMs`，profile 工作区 INDEX session-generation 模块记录）。

### 2.5 同步快照（TimerSnapshot）

- **关键字段**：`remainingAffMs/remainingNegMs`、`graceAffMs/graceNegMs`（毫秒线）、
  `runningAff/Neg`、`phaseAff/Neg`、`seq`（单调递增）、`serverTime`（服务端盖戳）、`sessionId`。
- **映射唯一入口**：`src/timer/snapshotCodec.js`（头注：此前同映射手写三处）；
  单计时模式 single 钟镜像到双 wire 侧，服务端强制镜像（snapshotCodec.js:56-57）。
- **直连帧例外**：WebRTC 直连帧无 `serverTime`，在途补偿直通（snapshotCodec.js:20-21）。

### 2.6 配对码（PairingCode）

- 4 位数字；服务端按 配对码+owner 匹配活跃会话返回 configName/shareToken（`server/routes/pairing.js:4` 头注）；
  过期/轮换不做——会话结束即失效（prd/pairing-and-fixes.md §1 不做什么）。

### 2.7 比赛记录（MatchLog）

- **采集文档**：`{ startedAt, entries[] }`，entry = `{ stageId, label, mode, plannedSeconds,
  graceSeconds, actualAffSeconds, actualNegSeconds, overrunAff/Neg, enteredAt, exitedAt }`
  （`src/timer/matchCapture.js` 头注与 `beginStageCapture`）。
- **实绩口径**：`max(0, planned − remaining) + (grace − graceLeft)`，宽限耗尽计超时
  （matchCapture.js:14-20 与 README §比赛记录）。
- **快照留存**：模板与队名随记录留存，赛后改模板不影响历史（BA 附录B）。

### 2.8 用户与系统配置（User / AppSetting）

- 首个注册用户成为管理员（FL v1.0 §2.4 备注）；注册开关存 `app_settings` 单文档，
  未设置回落服务器 env 默认，首个管理员账号不受影响（`server/routes/admin.js:41-84`、AA v1.0 S-01-03）。

## 3. 状态机表

| 对象 | 状态 | 流转 | 触发 |
|------|------|------|------|
| 侧钟（Side） | running | → grace（有宽限）/ → locked（无宽限） | 时间到 |
| 侧钟（Side） | grace | → locked | 宽限耗尽（长鸣+红闪，「必须停」） |
| 客户端会话 | idle → starting → active | active ⇄ weak | 开启指令 / 弱信号检测（`src/timer/useTimerSessionSync.js:43`） |
| 显示端跟随 | following | → ended（回退独立计时页） | 主动停止 / 心跳超时 / 分享停用 |
| 主权仲裁 | 上报中 | → 让位终态（yield） | PUT 带 `sessionId` 与服务端不符 → 409 `session_taken`（`server/lib/timerSessions.js:166-179`、`src/timer/snapshotReporting.js:28-29`） |
| 会话恢复 | 可恢复 400 | → recoverSession 重建 | 「No active session」400 → 互斥+5s 退避+3 次上限（useTimerSessionSync.js:62-66 D26） |
| 自动推进 | 阶段彻底结束 | → 下一阶段 | 3 秒倒计时内无任何操作；末阶段不推进（BA v1.0 §2.2.1.5） |

## 4. 角色表

| 角色 | 职责 | 操作对象 |
|------|------|---------|
| 计时操作员 | 比赛现场驱动进程：计时控制/告警/远程控制/遥控/保存记录 | 计时台、控制会话、遥控器、MatchLog |
| 注册用户 | 日常管理自己的模板与记录 | Configuration、MatchLog、广场发布/复制 |
| 管理员 | 继承注册用户 + 治理：注册开关、广场下架、用户/配置治理、预置导入 | User、AppSetting、公开 Configuration |
| 访客 | 最低门槛准入与浏览：注册、匿名逛广场 | 账号注册、公开 Configuration（只读） |
| 大屏观众 | 分享链接只读观看，无需登录 | TimerSnapshot 镜像（只读） |

（来源：AA v1.0 §1.3 范围；FL v1.0 五类用户 18 菜单组）

## 5. 业务规则

| # | 规则 | 挂靠对象 | 来源 |
|---|------|---------|------|
| BR-1 | 默认模板不可删除 | Configuration | BA v1.0 §2.1.2.2 |
| BR-2 | 宽限 0–300 秒可配，默认关闭；宽限耗尽计超时 | Stage / MatchLog | README §超时宽限 |
| BR-3 | seq 单调递增，服务端拒绝回退（幂等去重/乱序防护） | TimerSnapshot | api-timer-session.md §1.3 D-4 |
| BR-4 | 自由辩论：显式停止一方→对方自动计时；双方耗尽→锁定，重置恢复手动 | EngineState | engine.js freeHandover、BA 附录B |
| BR-5 | 自动推进 3 秒窗口内任意操作取消；末阶段不推进 | EngineState.advance | BA v1.0 §2.2.1.5 |
| BR-6 | 告警三节点（30s 提醒/时间到/必须停）铃声方案与音量本设备配置 | 告警提示 | `src/services/soundPrefs.js:17-19` |
| BR-7 | 模板与队名以快照随记录留存 | MatchLog | BA 附录B |
| BR-8 | 广场发布匿名不显归属人；管理员可强制下架 | 广场 | BA v1.0 §2.1.3 |
| BR-9 | 注册开关 app_settings 单文档优先，未设置回落 env；首个管理员不受影响 | AppSetting | admin.js:41、AA v1.0 S-01-03 |
| BR-10 | 大屏会话期间只读跟随；会话结束回退独立计时页，无活跃会话保持独立行为 | 大屏跟随 | README §大屏实时同步 |

## 6. 术语速查

**BA 附录B 原文 8 条**（business-arch.md 附录B）：赛制模板、自由辩论、超时宽限、大屏跟随、
配对码、远程遥控、快照、模板广场。

**计时/会话域扩展**（代码注释提炼）：

| 术语 | 定义 | 来源 |
|------|------|------|
| 时钟锚点（anchor） | `{ running, endAt, frozenMs }` 毫秒真值层：running 时按墙钟外推 endAt，停止时冻结 frozenMs；state 持有 + ref 镜像双轨 | `src/timer/useDebateTimer.js:64-80`（D38） |
| 余数累积（tickRemainderMs） | 逐拍亚秒余数跨拍携带，杜绝 floor() 每拍漏 0–300ms | `src/timer/engine.js:49,182-200`（D36） |
| Worker 心拍 | 专用 worker 每 250ms 发 tick，豁免后台标签页限流（回退 setInterval） | `src/timer/tickWorker.js`（D37） |
| 在途补偿（compensateInFlight） | 按 `now − serverTime − skew` 前移运行中的钟，上限 3s，超出视为钟偏丢弃 | `src/timer/snapshotCodec.js:11-45`（D21） |
| 钟偏 EMA | 主机侧（上报 RTT/2 采样 D33）/ 消费侧（SSE 帧到达采样 D34）对 API 服务器钟差的指数平滑估计 | `src/timer/useTimerSessionSync.js:69-71` |
| 会话代际（sessionId） | 快照信封携带的会话标识；变化即服务端重启了 seq 空间，消费端去重必须重置 | `server/lib/timerSessions.js:33`、useTimerSessionSync.js:59（D23） |
| 直连通道 | 同网 WebRTC DataChannel（仅 host 候选，无 STUN/TURN），信令走既有会话通道，3s 未开静默回退中转 | `src/timer/rtcChannel.js:1-22` |
| 遥控双模 | 手机作瘦遥控器发指令（服务器中转）+ 同网直连收快照副本，直连序号独立 1e9 空间 | profile 工作区 INDEX p2p-remote 模块 |
| UOMDC | 渥太华大学华语辩论社——本系统规则基准 | README §简介 |
| PID 时间线 | 比赛流程的地铁线路图式呈现（港铁现役 PID 风格：全线一色/已过褪灰/车标/换乘环） | profile 工作区 INDEX pid-timeline 系列（R5-R7） |
