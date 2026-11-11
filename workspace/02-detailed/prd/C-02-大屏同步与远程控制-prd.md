# C-02 大屏同步与远程控制 PRD

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定(逆向归档) |
| 最后更新 | 2026-11-11 |
| 模块编码 | C-02(核心业务域) |
| 子模块 | C-02-01 同步会话管理 / C-02-02 大屏跟随呈现 / C-02-03 设备配对 / C-02-04 远程遥控 |
| 上游依据 | 《应用架构》2.1.2、《功能清单》2.1.1.2 与 2.5.1.1、《业务架构》2.2.2(v1.0) |
| 功能类型 | 业务流程 + 集成对接(会话状态机 + 三端一服快照/指令/信令协议) |
| 关联模块 | C-01 比赛计时 / S-02 赛制模板管理 / S-01+D-01 账号权限 / S-04 比赛记录 / P-01 实时通信通道 / P-02 接口防护 |

## 第一部分:文档概述

### 1.1 背景与目标

系统已上线运行,本文档为**逆向归档**:按 D2 分册模板将 C-02 的现有实现归纳为 PRD。C-02 让现场大屏与远程设备实时跟随同一场比赛:操作员主机(计时台)开启**同步会话**并逐秒上报计时快照;大屏经 SSE 订阅**只读跟随**;手机经**配对码**或同网**P2P 直连**成为瘦遥控器向主机发计时指令。服务端持有一个**内存型会话注册表**(每 shareToken 至多一个活跃会话),会话即本模块聚合根。

> 依据核对:任务书引用路径 `src/hooks/useTimerSessionSync.js`,仓库实际路径为 `src/timer/useTimerSessionSync.js`(无 `src/hooks/` 目录,已按实际路径研读);`src/timer/rtcChannel.js`、`server/routes/display.js`、`server/routes/pairing.js` 与任务书一致。

### 1.2 文档定位

| 定位 | 说明 |
|------|------|
| 本文档做什么 | 定义 C-02 的业务目标、功能范围、会话领域模型、状态流转、协议规则与非功能要求;完成 DDD 战术建模(聚合根=同步会话) |
| 本文档不做什么 | 不展开计时引擎本身(C-01 PRD)、不定义接口报文细节(D3 产出)、不展开 SSE/限流等纯技术机制内部(P-01/P-02,AA 2.4)、不覆盖大屏页样式规格(D4 产出) |

### 1.3 范围

| 范围 | 说明 |
|------|------|
| 业务域 | 辩论赛计时与赛事支持 · 赛中执行 |
| 模块边界 | 控制会话(服务端注册表+客户端装配)、显示跟随、配对、双通道遥控 |
| 涉及菜单(FL) | 开启远程控制(2.1.1.2)、遥控器(2.1.1.2)、大屏跟随呈现(2.5.1.1) |

## 第二部分:业务目标与角色

### 2.1 业务目标(G1)

| # | 目标 | 说明 |
|---|------|------|
| G1-1 | 大屏与主机锁步 | 大屏倒计时与主机同秒翻转(毫秒真相同步+在途/时钟补偿),断线自动重连并重校准 |
| G1-2 | 一场比赛一个权威 | 每 shareToken 至多一个活跃控制会话;冲突时仲裁让位,永不双主机 |
| G1-3 | 手机即遥控器 | 配对码/同网直连让手机瘦遥控主机,指令不丢不重(单调序号去重) |
| G1-4 | 弱网优雅降级 | 直连失败回退服务器中转;会话失效自愈重建;遥控失联回退本地计时;大屏回退独立计时 |

### 2.2 角色定义(G3)

| 角色 | 职责 | 代码入口 |
|------|------|---------|
| 计时操作员(主机) | 开启/停止会话,分享大屏链接,展示配对码,执行遥控指令,处理让位/自愈提示 | `src/timer/useTimerSessionSync.js:365-427`、`src/TimerControlPage.jsx:365-411` |
| 计时操作员(遥控端) | 配对接入或开启遥控模式,发送启停/重置/换边/换阶段/铃声测试指令 | `src/timer/useTimerSessionSync.js:446-532` |
| 大屏观众 | 经分享链接只读跟随;无需登录 | `src/TimerDisplayPage.jsx:19`、`server/routes/display.js`(匿名路由) |
| 系统(服务端) | 会话注册、快照校验与广播、指令排队转发、信令透传、配对仲裁 | `server/lib/timerSessions.js:75-323` |

## 第三部分:功能范围(G2)

### 3.1 做什么

| 子模块 | 功能点概要 |
|--------|-----------|
| C-02-01 同步会话管理 | 开启/停止同步会话;分享大屏链接;展示配对码;逐秒心跳上报+跃迁即时上报;会话失效自动重建;冲突仲裁让位;控制台跟随探测与接管;角色记忆静默恢复 |
| C-02-02 大屏跟随呈现 | 只读镜像阶段与倒计时;SSE 订阅+连接即重放;断线重连重校准;弱信号横幅;会话结束冻结/回退;告警呈现侧(铃声/闪烁/语音,设备本地偏好) |
| C-02-03 设备配对 | 会话创建生成 4 位配对码;owner-scoped 配对;配对成功直入遥控模式;配对对话框发现活跃会话直接连接 |
| C-02-04 远程遥控 | 六类指令(启停/重置/换边/换阶段/铃声测试);P2P 同网直连优先、失败回退服务器中转;指令单调序号去重;失联回退本地计时 |

### 3.2 不做什么(边界)

| # | 边界 | 归属 |
|---|------|------|
| B-1 | 计时决策(相位机/告警/推进) | C-01(会话只镜像与转发指令,主机引擎仍为唯一权威) |
| B-2 | share 开关与 token 生成/轮换 UI | S-02(C-02 只消费 shareEnabled/shareToken;开关关闭由配置层杀会话) |
| B-3 | SSE 基建、限流、断线重连通用机制 | P-01/P-02(本文只定义其上的会话语义) |
| B-4 | 记录自动保存的业务模型 | S-04(C-02 只在会话结束时触发一次自动保存) |
| B-5 | 大屏全屏/语言切换/声音面板等页面本地交互 | D4 交互设计 |
| B-6 | 跨网络(NAT 之外)P2P 打洞 | 不支持(iceServers 为空,仅同网 host 候选) |

## 第四部分:功能需求(FR)

### 4.1 C-02-01 同步会话管理

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C02-01-01 | 开启会话:仅模板 owner 可发起,前置 shareEnabled+shareToken;成功返回 sessionId/shareToken/pairingCode/displayUrl/初始快照;客户端置 starting 防双击(ref 级互斥) | `server/routes/configurations.js:258-280`、`server/lib/timerSessions.js:118-158`、`src/timer/useTimerSessionSync.js:365-410` |
| FR-C02-01-02 | 同 token 重复开启 → 旧会话按 superseded 结束并广播 ended(新会话顶替) | `server/lib/timerSessions.js:122-125` |
| FR-C02-01-03 | 会话容量上限 100,超限 409 | `server/lib/timerSessions.js:75,126-130` |
| FR-C02-01-04 | 停止会话:显式停止清空会话与角色记忆,并触发比赛记录自动保存;分享关闭/轮换 token 时服务端按 share_disabled 杀活会话 | `src/timer/useTimerSessionSync.js:412-427`、`server/routes/configurations.js:216-220` |
| FR-C02-01-05 | 心跳:活跃/弱信号态下 1s 节拍上报快照(D22);状态跃迁(阶段/运行/锁定/试听闪烁变化)即时补报 | `src/timer/useTimerSessionSync.js:745-762` |
| FR-C02-01-06 | 心跳超时 30s 惰性过期(读时判定,无定时器),广播 expired | `server/lib/timerSessions.js:75,97-110` |
| FR-C02-01-07 | 快照上报校验:seq 单调递增;stageId 须在会话模板内;模式/时长/宽限/相位合法;单计时折叠双侧;phase⇔graceMs 严格一致 | `server/lib/timerSessions.js:325-406` |
| FR-C02-01-08 | 主权仲裁(D29):上报携带的 sessionId 与在席会话不符 → 409+code=session_taken,客户端让位——清会话、提示「另一设备正在控制」,不自愈不抢存记录 | `server/lib/timerSessions.js:166-178`、`src/timer/snapshotReporting.js:28-30`、`src/timer/useTimerSessionSync.js:269-279` |
| FR-C02-01-09 | 失败分类处置(yield/end/recover/ignore/retry):403/404 结束会话+自动保存;400 无会话触发自愈;400 seq 落后仅忽略;其余重试;连续失败 ≥2 置弱信号态 | `src/timer/snapshotReporting.js:27-42`、`src/timer/useTimerSessionSync.js:244-292` |
| FR-C02-01-10 | 会话自愈:400「无活跃会话」时按指数退避(5s×2ⁿ,封顶 30s)重建会话、重置退避、提示已重连;重建同样走开启前置校验 | `src/timer/useTimerSessionSync.js:296-357` |
| FR-C02-01-11 | 会话代际(D23):快照 sessionId 变化 → 消费端 seq 去重重置,避免服务重启后所有帧被判过期 | `src/timer/useTimerSessionSync.js:100-111`、`src/timer/useTimerSessionSync.js:827-830` |
| FR-C02-01-12 | 上行补偿(D32):快照附 captureServerAt,服务端把运行钟按上行耗时(≤2s 钳制)推进后再入库广播 | `server/lib/timerSessions.js:183-207` |
| FR-C02-01-13 | 会话状态指示:idle/starting/active/weak;weak 以警告色 chip 呈现 | `src/timer/useTimerSessionSync.js:43`、`src/TimerControlPage.jsx:386-394` |
| FR-C02-01-14 | 分享大屏链接:复制 `/display/{shareToken}` 到剪贴板,失败降级为展示原文 | `src/timer/useTimerSessionSync.js:730-743` |
| FR-C02-01-15 | 控制台跟随/接管:配对对话框探测本模板活跃会话(direct connect);跟随页可一键接管——采纳当前快照、停止跟随订阅、以在席 sessionId 恢复上报,原控制端在下次心跳后被判让位 | `src/timer/useTimerSessionSync.js:623-649,704-718`、`src/TimerControlPage.jsx:373-385` |
| FR-C02-01-16 | 角色记忆静默恢复(R4):本机开过的会话→静默恢复上报;本机遥控过的会话→静默恢复遥控;均失效则清记忆不弹窗 | `src/timer/useTimerSessionSync.js:10-19,668-700` |

### 4.2 C-02-02 大屏跟随呈现

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C02-02-01 | 只读镜像:大屏跟随态下时钟与阶段只读(readonly=following),主机为唯一驱动方;跟随由控制台页发起时同样适用(BR-5 快捷键禁用) | `src/TimerDisplayPage.jsx:164-166`、`src/timer/useTimerSessionSync.js:429-439` |
| FR-C02-02-02 | 订阅通道:display SSE 流(state/session/signal 事件),连接建立即重放当前快照(打新 serverTime 戳),迟到订阅者立即追平 | `server/routes/display.js:19-44`、`src/services/TimerSessionService.js:159-222` |
| FR-C02-02-03 | 初始校准:订阅前先 GET state 采纳活跃会话快照;SSE 每次重连(onOpen)后重新拉取校准 | `src/timer/useTimerSessionSync.js:799-878`、`src/services/TimerSessionService.js:211-216` |
| FR-C02-02-04 | 平滑采纳(D35):结构未变且每个活跃侧偏差 <200ms(宽限 1s 容差)→ 保留本地节拍不回拨;采纳换算四舍五入防系统性 -1s | `src/timer/useTimerSessionSync.js:160-179`、`src/timer/snapshotCodec.js:90-95` |
| FR-C02-02-05 | 在途补偿(D21):按 serverTime+本地时钟偏差估计把运行钟推进在途耗时(≤3s 钳制)再采纳 | `src/timer/snapshotCodec.js:14-44`、`src/timer/useTimerSessionSync.js:130-158` |
| FR-C02-02-06 | 时钟偏差估计(D34):消费端按每帧 (local−server) 样本 EMA(0.9/0.1),离群 >1500ms 丢弃 | `src/timer/useTimerSessionSync.js:115-122` |
| FR-C02-02-07 | 弱信号:跟随中 5s 无快照 → weak 横幅;恢复帧回 following | `src/timer/useTimerSessionSync.js:774-785,818-823` |
| FR-C02-02-08 | 会话结束/过期:跟随端冻结镜像时钟(STOP_ALL),ended 横幅展示 8s 后消退;会话页回退为可独立操作的计时页 | `src/timer/useTimerSessionSync.js:832-860`、`src/TimerDisplayPage.jsx:13-17` |
| FR-C02-02-09 | 采纳即锚定:快照毫秒直接写入墙钟锚点,保留主机子秒相位(D38) | `src/timer/useTimerSessionSync.js:130-158` |
| FR-C02-02-10 | 告警呈现侧(C-01-04):大屏以本地偏好播放铃声/闪烁/TTS,与主机互不覆盖 | `src/TimerDisplayPage.jsx:125-149`、`src/services/soundPrefs.js:115-126` |
| FR-C02-02-11 | display 匿名面限流:60 次/分钟(默认,env 可调),SSE 连接计数一次 | `server/lib/rateLimits.js:33-38`、`server/index.js:126` |

### 4.3 C-02-03 设备配对

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C02-03-01 | 配对码:会话创建时生成 4 位数字码,与同会话现存码去重;随会话生灭;主机以 chip 展示 | `server/lib/timerSessions.js:114-116,131-137`、`src/TimerControlPage.jsx:365-372` |
| FR-C02-03-02 | 配对仲裁:POST /api/session/pair 需登录,**仅匹配提交者本人的活跃会话**(owner-scoped);无匹配 404 | `server/routes/pairing.js:11-35`、`server/lib/timerSessions.js:299-313` |
| FR-C02-03-03 | 配对成功返回 configName+shareToken,写入 lastRemote 记忆并直入遥控模式(绑定主机模板,非本机模板) | `src/timer/useTimerSessionSync.js:653-662,446-463` |
| FR-C02-03-04 | 配对对话框发现:打开对话框时探测本模板活跃会话,命中则展示「检测到会话:名称」+直接连接按钮;无自动弹窗 | `src/timer/useTimerSessionSync.js:704-718`、`src/TimerControlPage.jsx:501-561` |
| FR-C02-03-05 | 配对码输入净化:仅数字、最多 4 位,未满 4 位禁提交 | `src/TimerControlPage.jsx:532-559` |

### 4.4 C-02-04 远程遥控

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C02-04-01 | 指令集(白名单):start/stop/reset/toggle/applyStage/soundCheck;按类型校验 side(single/aff/neg)/stageId(须在会话模板内)/kind(warn30/end) | `server/lib/timerSessions.js:14-17,229-256` |
| FR-C02-04-02 | 双通道:遥控按钮 P2P 直连开则走 DataChannel(~同网毫秒级),否则 POST 服务器中转;主机下一个回流快照即隐式 ack | `src/timer/useTimerSessionSync.js:500-514`、`src/services/TimerSessionService.js:88-109` |
| FR-C02-04-03 | 服务器中转:指令排队(待执行 ≤32,超限 429)、分配 commandSeq、SSE 同时推送 display 流(token)与主机 config 流(owner) | `server/lib/timerSessions.js:229-270`、`server/lib/sseHub.js:38-64` |
| FR-C02-04-04 | 指令去重:主机按 commandSeq 单调过滤;直连序号从 1e9 起与中转序号共用一个单调空间,双源(直连+SSE)同帧不重放 | `src/timer/useTimerSessionSync.js:505-511,538-543` |
| FR-C02-04-05 | 主机执行:command SSE 事件与 DataChannel 消息统一进 applyHostCommand,经 toggle→START/STOP 翻译后与本地操作交织进同一 reducer,无额外锁 | `src/timer/useTimerSessionSync.js:538-568,573-616` |
| FR-C02-04-06 | 铃声测试遥控:soundCheck 指令在主机(会场音箱)播放,不在遥控端出声 | `src/timer/useTimerSessionSync.js:549-552`、`src/TimerControlPage.jsx:148-153` |
| FR-C02-04-07 | P2P 直连:WebRTC DataChannel,iceServers 为空(仅同网 host 候选);信令 offer/answer/ice 经会话通道一次性透传(≤32KB,不排队不存储);3s 握手超时即放弃回退中转;ICE 先到缓冲 | `src/timer/rtcChannel.js:11-16,26-28,40-44,94-104`、`server/lib/timerSessions.js:272-296` |
| FR-C02-04-08 | 遥控失联回退:中转返回 400/403/404(会话消失)→ 清 lastRemote 记忆、关直连、退出遥控、回本地计时并提示「遥控失联」 | `src/timer/useTimerSessionSync.js:515-529` |
| FR-C02-04-09 | 遥控端视图:遥控模式与跟随共用快照订阅;会话结束时遥控端**回退本地计时**(引擎继续走)而非冻结 | `src/timer/useTimerSessionSync.js:832-847` |
| FR-C02-04-10 | 链路指示:遥控 chip 显示「遥控模式 · 直连/经服务器」;rtcState off/connecting/open | `src/TimerControlPage.jsx:375-381`、`src/timer/useTimerSessionSync.js:85,484-489` |

## 第五部分:领域对象与业务字段(G4/G5/T1)

### 5.1 对象关系(G5)

```
计时引擎状态(C-01 聚合根,关联领域对象)
   │ buildSnapshot(发布语言编码) / applyHostCommand(命令解码执行)
   ▼
┌─ 同步会话 TimerSession(聚合根,服务端注册表,每 token 一个)──────┐
│  ├─ 会话快照 TimerSnapshot(值对象,按 seq 整体替换)              │
│  ├─ 待执行指令缓冲 pendingCommands(域内实体集合,上报即清)       │
│  └─ 配对码 PairingCode(值对象,随会话生灭)                      │
└────────────────────────────────────────────────────────────┬──┘
   SSE state/session/command/signal(token 流 + owner 流)      │ pairByCode(owner-scoped)
   ▼                                                          ▼
大屏/跟随页(只读采纳)      遥控端(指令+直连握手)      手机配对(4 位码)
```

- 会话与快照:一个会话聚合内**只保留最新快照**(lastSnapshot),消费端自行按 seq 去重与平滑——聚合不承担历史留痕。
- 指令与快照构成闭环:指令发出 → 主机执行 → 快照回流即 ack;主机上报即清空待执行缓冲。

### 5.2 领域对象与业务字段(T1)

**聚合根:同步会话(TimerSession)**(`server/lib/timerSessions.js:139-153`)

| 字段 | 类型 | 说明 |
|------|------|------|
| sessionId | string(randomBytes 12 hex) | 会话代际标识;服务重启/重建即换新(D23) |
| configId / configName / ownerId | ref | 所属模板与 owner(配对与指令路由按 owner) |
| shareToken | string | 会话键(每 token 至多一个活跃会话) |
| stageIds | Set | 会话模板的合法阶段集(快照/指令校验用) |
| startedAt / lastSeenAt | epoch ms | 创建与最近心跳;超时 30s 判过期 |
| lastSeq | int | 已接受最大快照 seq(单调门槛) |
| lastSnapshot | TimerSnapshot | 最新已验证快照(唯一保留) |
| lastCommandSeq | int | 已分配指令序号(单调递增) |
| pendingCommands | RemoteCommand[] | 离线指令缓冲(≤32,主机上报即清) |
| pairingCode | string(4 位) | 配对码,与同会话现存码去重 |

**值对象:会话快照(TimerSnapshot,发布语言)**(`server/lib/timerSessions.js:391-405`、`src/timer/snapshotCodec.js:54-79`)

| 字段 | 类型 | 说明 |
|------|------|------|
| seq | int | 单调序号(线端恒 ≥1;0 保留给回退帧) |
| stageId / stageMode | string/enum | 当前阶段与模式(single/double/free) |
| remainingAffMs / remainingNegMs | int | 双侧剩余毫秒(单模式 Neg 镜像 Aff;0–24h) |
| runningAff / runningNeg | bool | 双侧运行标志 |
| phaseAff / phaseNeg | enum | running/grace/locked(须与 graceMs>0 严格一致) |
| graceAffMs / graceNegMs | int | 宽限余量毫秒(0–300s) |
| activeSide | enum | aff/neg/none(仅 free 模式非 none) |
| serverTime | int | 出站打点(每次投递刷新,D20) |
| sessionId | string | 会话代际(D23);直连帧可不带 |

**值对象:遥控指令(RemoteCommand)**(`server/lib/timerSessions.js:236-269`)——`{type: start|stop|reset|toggle|applyStage|soundCheck, side?|stageId?|kind?, commandSeq, at}`;不可变帧。

**域内实体:待执行指令缓冲(pendingCommands)**——会话内的指令排队,离线时缓冲、上报即清空;上限 32。

**客户端投影(同一上下文,装配方内)**:

| 对象 | 分类 | 字段 | 出处 |
|------|------|------|------|
| 会话句柄 sessionRef | 域内实体(客户端) | shareToken, sessionId, displayUrl, failures | `src/timer/useTimerSessionSync.js:56` |
| 跟随订阅 activeFollowToken | 域内实体 | shareToken(shareToken 或 followToken) | `src/timer/useTimerSessionSync.js:798` |
| 角色记忆 selfHost/lastRemote | 过程数据(设备本地) | configName, shareToken, pairingCode | `src/timer/useTimerSessionSync.js:10-19` |
| 直连控制器 rtcChannel/hostChannel | 域内实体(客户端) | isOpen/send/close, rtcState | `src/timer/rtcChannel.js:106-123,198-214` |

### 5.3 关键枚举字段汇总

| 枚举 | 取值 | 出处 |
|------|------|------|
| 指令类型 type | start / stop / reset / toggle / applyStage / soundCheck | `server/lib/timerSessions.js:14` |
| soundCheck kind | warn30 / end | `server/lib/timerSessions.js:15` |
| 指令侧 side | single / aff / neg | `server/lib/timerSessions.js:16` |
| 快照相位 phase | running / grace / locked | `server/lib/timerSessions.js:5` |
| activeSide | aff / neg / none | `server/lib/timerSessions.js:4` |
| 控制端会话态 sessionState | idle / starting / active / weak | `src/timer/useTimerSessionSync.js:43` |
| 显示横幅 displayBanner | following / weak / ended | `src/timer/useTimerSessionSync.js:47` |
| 直连状态 rtcState | off / connecting / open | `src/timer/useTimerSessionSync.js:85` |
| SSE 会话事件 type | started / ended / expired | `src/timer/useTimerSessionSync.js:825-861` |
| 上报失败处置 | yield / end / recover / ignore / retry | `src/timer/snapshotReporting.js:27-42` |

## 第六部分:状态流转(T2)

### 6.1 会话生命周期(服务端聚合根)

```
        create(shareEnabled 前置;同 token 旧会话 superseded)
   ──▶ active ──(operator DELETE / share 关闭或轮换)──▶ ended(广播 ended)
        │  ▲
        │  └── 心跳 report(lastSeenAt 刷新)
        └──(读时发现 >30s 无心跳)──▶ expired(广播 expired,惰性清除)
```

出处:`server/lib/timerSessions.js:75,97-110,118-158,217-224`、`server/routes/configurations.js:216-220,331-342`。

### 6.2 控制端会话态(客户端)

```
idle ──(start 成功)──▶ active ⇄(连续失败≥2/自愈失败) weak
 ▲    ──(starting 请求中,ref 互斥防双击)
 └──(显式停止 / 403,404 end / 409 session_taken 让位)
active|weak ──(400 无活跃会话)── recoverSession(退避 5s×2ⁿ≤30s)──▶ active(提示已重连)
```

出处:`src/timer/useTimerSessionSync.js:43,244-292,296-357,365-427`、`src/timer/snapshotReporting.js:27-42`。

### 6.3 跟随/显示端横幅

```
(无) ──(订阅到活跃会话/started)──▶ following ──(5s 无快照)──▶ weak ──(帧恢复)──▶ following
   following|weak ──(ended/expired)──▶ ended(展示 8s)──▶ (无);时钟:跟随端冻结,遥控端回本地
```

出处:`src/timer/useTimerSessionSync.js:774-785,818-860`。

### 6.4 直连链路(遥控↔主机)

```
off ──(进入遥控模式)── connecting ──(DataChannel open ≤3s)── open
                          │(握手超时/失败/关闭)│(open 后断开)
                          ▼                  ▼
                         off(回退服务器中转)  off(自动回退,UI 不变)
```

出处:`src/timer/rtcChannel.js:40-53`、`src/timer/useTimerSessionSync.js:464-498`。

### 6.5 冲突仲裁流(会话代际)

```
控制台 A 在席(会话 S1) ── 控制台 B create ──▶ S1 superseded(A 收 ended 回退独立)
控制台 A 持旧 S1 上报 ──▶ 409 session_taken ──▶ A 让位(提示「另一设备正在控制」,不自愈)
会话重建(服务重启) ──▶ sessionId 变化 ──▶ 消费端 seq 去重重置(D23)
```

出处:`server/lib/timerSessions.js:122-125,166-178`、`src/timer/useTimerSessionSync.js:100-111,269-279`。

## 第七部分:业务规则(N3)

| # | 规则 | 出处 |
|---|------|------|
| BR-C02-01 | 每 shareToken 至多一个活跃会话;新建即顶替(旧会话广播 ended/superseded) | `server/lib/timerSessions.js:122-125` |
| BR-C02-02 | 会话只在内存,进程重启即失;消费端以 sessionId 代际检测自愈(D23) | `server/lib/timerSessions.js:71-74`、`src/timer/useTimerSessionSync.js:100-111` |
| BR-C02-03 | 快照 seq 必须严格大于 lastSeq;落后帧 400(客户端 ignore 不结束会话) | `server/lib/timerSessions.js:329-332`、`src/timer/snapshotReporting.js:36-38` |
| BR-C02-04 | 快照字段域:remaining 0–24h、grace 0–300s、phase⇔graceMs 一致、单模式折叠双侧(服务端权威归一) | `server/lib/timerSessions.js:6-7,325-406` |
| BR-C02-05 | 主权唯一(D29):携带不一致 sessionId 的上报被 409 拒绝,客户端让位且**不自动保存记录**(赢家负责保存) | `server/lib/timerSessions.js:166-178`、`src/timer/useTimerSessionSync.js:269-279` |
| BR-C02-06 | 上行补偿钳制 ≤2s(D32);在途补偿钳制 ≤3s(D21);离群时钟样本(>1500ms)不进 EMA(D33/D34) | `server/lib/timerSessions.js:183-207`、`src/timer/snapshotCodec.js:14`、`src/timer/useTimerSessionSync.js:115-122,249-259` |
| BR-C02-07 | 平滑采纳(D35):同结构且活跃侧偏差 <200ms(宽限 1s)保留本地节拍;seq 仍在跳过时前推,防陈旧帧复活去重窗口 | `src/timer/useTimerSessionSync.js:160-179` |
| BR-C02-08 | 主机命令监听复用 config SSE 流(每主机页仅 1 条 SSE,防 6 连接同源上限饿死心跳);display 流供大屏与遥控 | `src/timer/useDebateTimer.js:43-51`、`server/lib/sseHub.js:50-64` |
| BR-C02-09 | 指令白名单+域校验;applyStage 的 stageId 须在会话模板阶段集内;待执行 >32 → 429 | `server/lib/timerSessions.js:229-261` |
| BR-C02-10 | 主机上报即视为指令消费(pendingCommands 清空);快照回流是唯一 ack | `server/lib/timerSessions.js:211-213` |
| BR-C02-11 | 配对 owner-scoped:4 位码只在**本人**活跃会话中匹配;码随会话生灭 | `server/routes/pairing.js:11-35`、`server/lib/timerSessions.js:299-313` |
| BR-C02-12 | 直连仅同网(iceServers=[])+3s 握手超时;信令透传不解释、不排队、不存储(≤32KB) | `src/timer/rtcChannel.js:13-16,40-44`、`server/lib/timerSessions.js:272-296` |
| BR-C02-13 | 会话 ended/expired:跟随端冻结(STOP_ALL),遥控端回退本地计时并清角色记忆;两态横幅 8s 后消退 | `src/timer/useTimerSessionSync.js:825-860` |
| BR-C02-14 | 显式停止与 403/404 end 均触发比赛记录自动保存;让位(yield)不保存 | `src/timer/useTimerSessionSync.js:269-292,419-426` |
| BR-C02-15 | 跟随者不能在自己的跟随态上再开会话(followToken 拦截);接管前必须先解除跟随订阅,防旧流覆盖接管态 | `src/timer/useTimerSessionSync.js:370-372,623-640` |
| BR-C02-16 | 控制台跟随/遥控不驱动本地引擎(readonly),按钮转译为远程指令;退出遥控恢复本地驱动 | `src/TimerControlPage.jsx:136-154` |
| BR-C02-17 | display 匿名面限流 60/min(默认),429+Retry-After 由 P-02 统一返回 | `server/lib/rateLimits.js:33-38` |

## 第八部分:非功能性要求(N1)

| # | 要求 | 现状依据 |
|---|------|---------|
| NFR-C02-01 | 同步时延:心跳 1s(D22);P2P 同网直连毫秒级(设计目标 ~5ms);采纳偏差 <200ms 不回拨 | `src/timer/useTimerSessionSync.js:754-762,500-514,160-179` |
| NFR-C02-02 | 容量:会话注册表 100、待执行指令 32、信令帧 32KB;全部内存态 | `server/lib/timerSessions.js:17-20,126-130,257-261,288-290` |
| NFR-C02-03 | 断线韧性:EventSource 原生重连+onOpen 重校准;上报自愈退避 ≤30s;直连断开自动回中转 | `src/services/TimerSessionService.js:211-216`、`src/timer/useTimerSessionSync.js:296-357` |
| NFR-C02-04 | 时序一致性:上行/在途/时钟偏差三段补偿+四舍五入换算,端到端不引入系统性秒差 | `server/lib/timerSessions.js:183-207`、`src/timer/snapshotCodec.js:14-44,90-95` |
| NFR-C02-05 | 连接经济性:主机页恒 1 条 SSE(命令/信令/配置变更复用),大屏 1 条 display 流 | `src/timer/useDebateTimer.js:43-51`、`server/lib/sseHub.js:50-54` |

## 第九部分:异常场景与降级(N2)

| # | 场景 | 处理 | 出处 |
|---|------|------|------|
| EX-C02-01 | 服务器重启(会话全失) | 上报 400 无会话 → 自愈重建;消费端 sessionId 代际检测重置 seq | `src/timer/useTimerSessionSync.js:296-357,100-111` |
| EX-C02-02 | 双控制台争席 | 新建顶替旧会话;旧控制台收 ended 回退;持旧 id 上报被 409 让位 | `server/lib/timerSessions.js:122-178` |
| EX-C02-03 | 心跳断网 | failures≥2 置 weak;退避自愈;期间会话可能被服务端过期,恢复后重建 | `src/timer/useTimerSessionSync.js:262-268,346-354` |
| EX-C02-04 | SSE 断流 | EventSource 原生重连;重连 onOpen 拉 state 校准;大屏 5s 无帧置 weak 横幅 | `src/services/TimerSessionService.js:211-216`、`src/timer/useTimerSessionSync.js:774-785` |
| EX-C02-05 | 直连不可达(跨网/防火墙) | 3s 握手超时静默回退服务器中转,UI 链路指示切「经服务器」 | `src/timer/rtcChannel.js:40-44`、`src/TimerControlPage.jsx:375-381` |
| EX-C02-06 | 遥控中会话消失 | 清记忆/关直连/退遥控/回本地计时+提示;会话 ended 事件同路径兜底 | `src/timer/useTimerSessionSync.js:515-529,832-847` |
| EX-C02-07 | share 被关闭/轮换 token | 服务端杀活会话(displays 回退独立计时);主机下次上报 404 → 结束+自动保存 | `server/routes/configurations.js:216-220`、`src/timer/useTimerSessionSync.js:283-292` |
| EX-C02-08 | 陈旧帧/乱序 | seq 去重(低序丢弃)、直连序号并入同一单调空间、跳过帧仍前推 seq | `src/timer/useTimerSessionSync.js:100-111,185-190,505-511` |
| EX-C02-09 | 复制链接权限失败 | 降级为 snackbar 展示链接原文 | `src/timer/useTimerSessionSync.js:736-742` |
| EX-C02-10 | 匿名滥用 display 面 | 60/min 限流,429+Retry-After | `server/lib/rateLimits.js:33-38` |

## 第十部分:历史与留痕(N4)

- 会话及其快照为**纯内存态**:不落库、无历史查询;留痕要素只有 seq/serverTime/sessionId(用于代际与顺序仲裁)。比赛过程留痕由 C-01 采集→S-04 记录承担,会话结束时触发一次自动保存(BR-C02-14)。
- 角色记忆(selfHost/lastRemote)为设备本地 localStorage 便利状态,清会话即清,不构成审计数据(`src/timer/useTimerSessionSync.js:10-19`)。

## 第十一部分:被引用关系(T1a)

| 被谁引用 | 引用什么 | 方式 |
|---------|---------|------|
| C-01 运行时 | 会话开启/上报/指令执行入口(装配钩子注入) | 进程内调用,`src/timer/useDebateTimer.js:407-433` |
| S-02 配置层 | shareEnabled/shareToken 决定会话生死;配置 SSE change 广播 | 发布/订阅,`server/routes/configurations.js:216-220` |
| S-04 记录 | 会话结束/显式停止触发 saveMatchRecord(true) | 服务调用,`src/timer/useTimerSessionSync.js:419-426` |
| S-01/D-01 | requireAuth 保护配对与配置会话端点;owner 鉴权 | 中间件,`server/routes/pairing.js:11`、`server/lib/authPolicy.js` |
| P-01/P-02 | SSE 基建与限流被本模块消费 | 平台支撑,`server/lib/sseHub.js`、`server/lib/rateLimits.js` |

## 第十二部分:DDD 领域建模(D2-2)

### Step 0:PRD 范围判定

PRD 标注模块名 C-02 → **范围明确**,跳过 Step 1~3,直接战术设计。术语边界补充:「会话」在本域=**比赛同步会话**(内存型、随赛事生灭);在 S-01 指**登录会话**(数据库持久化,`server/lib/session.js:30-51`)——同词异义,已由模块边界分离,不需另拆域(B1 判定:归入当前域,以「同步会话」专名消歧)。

### 本域信息(必输出)

| 项目 | 内容 |
|------|------|
| 本域名称 | C-02 大屏同步与远程控制 |
| 领域分层 | 核心域(AA 2.1:有会话状态机与聚合根) |
| 聚合根 | 同步会话(TimerSession,一致性边界=最新快照+待执行指令缓冲+配对码,服务端注册表) |

### 聚合根识别(A1-A4,对同步会话)

| 测试 | 判定 | 依据 |
|------|------|------|
| A1 一致性边界 | ✓ | lastSeq/lastSnapshot/lastCommandSeq/pendingCommands 必须一致演进(单线程注册表内原子变更) |
| A2 全局引用 | ✓ | 大屏/遥控/主机全部经 shareToken 定位会话 |
| A3 生命周期入口 | ✓ | 快照只能经 report 校验入库;指令只能经 pushCommand 入队;配对经 pairByCode |
| A4 规则驱动 | ✓ | 会话状态(started/ended/expired)驱动全部消费端横幅与回退行为 |

**聚合根判定:4/4 → 聚合根。**(客户端会话句柄/跟随订阅不满足 A1——可独立失效重建,归客户端投影实体。)

### 领域对象清单(业务域内)

| 对象名 | 分类 | 与上级关系 | 核心业务字段 | 关键枚举字段 | 备注 |
|--------|------|-----------|------------|------------|------|
| 同步会话 TimerSession | 聚合根 | — | sessionId, shareToken, ownerId, stageIds, lastSeq, lastCommandSeq, lastSeenAt | — | 服务端内存注册表,每 token 一个;惰性过期 |
| 会话快照 TimerSnapshot | 值对象 | 聚合根唯一保留的最新态,按 seq 替换 | remainingAff/NegMs, graceAff/NegMs, runningAff/Neg, serverTime, sessionId | stageMode;phaseAff/Neg: running/grace/locked;activeSide: aff/neg/none | 发布语言(PL);不可变整体替换 |
| 遥控指令 RemoteCommand | 值对象 | 经聚合根入队与转发 | commandSeq, at, type, side/stageId/kind | type: start/stop/reset/toggle/applyStage/soundCheck | 不可变帧;双通道共享序号空间 |
| 待执行指令缓冲 pendingCommands | 域内实体(集合) | 聚合根内部,上报即清 | command 队列(≤32) | — | 离线缓冲语义 |
| 配对码 PairingCode | 值对象 | 随会话创建/销毁 | code(4 位,去重) | — | owner-scoped 消费 |
| 客户端会话句柄 sessionRef | 域内实体(客户端投影) | 会话在本设备的引用 | shareToken, sessionId, displayUrl, failures | — | 让位/停止即置空 |
| 跟随订阅 followToken | 域内实体(客户端投影) | 只读订阅目标 | shareToken | — | 接管/退遥控时先解除 |
| 直连控制器 rtcChannel/hostChannel | 域内实体(客户端投影) | 遥控↔主机的旁路通道 | isOpen/send/close | rtcState: off/connecting/open | 建立失败自动回中转 |

### 子流程 I/O 契约

| 子流程 | 触发条件 | 输入(来自父聚合根) | 输出(写入父聚合根) | 输出写入哪个对象 |
|--------|---------|------------------|------------------|---------------|
| 会话自愈 recoverSession | 上报失败分类=recover(400 无活跃会话);退避 5s×2ⁿ≤30s 互斥 | config(name/shareEnabled) | 新会话 {shareToken, sessionId, pairingCode, 初始 seq};退避计数 | 客户端会话句柄 sessionRef(服务端新聚合根被创建);成功即提示已重连并立即补报 |
| P2P 直连建立 rtcChannel | 进入遥控模式(发起方)/主机活跃即应答(应答方) | 信令帧(offer/answer/ice,经会话通道透传) | 通道 open/closed 状态;open 后指令改走直连 | rtcState 与直连控制器引用;超时 3s 输出 closed(回退中转) |

> 两子流程均不向服务端聚合根写入业务字段——自愈在服务端**新建**聚合根,直连完全是客户端旁路;父流程只消费其结果状态。

### 关联领域对象(只列边界说明,不展开内部模型)

| 关联领域对象 | 所属业务域 | 当前域关联字段 | 当前域需获取的信息 | 触发关系 | 映射模式 |
|------------|-----------|--------------|------------------|---------|---------|
| 计时引擎状态 | C-01 比赛计时(核心域) | —(经装配钩子直连,进程内) | 引擎状态的快照编码;动作派发入口 | 跃迁上报、指令执行 | OHS+PL(快照=发布语言,双核心域平级接口) |
| 赛制配置 | S-02 赛制模板管理(支撑域) | configName/shareToken/shareEnabled | 大屏配置投影(toDisplayResponse)、share 生死 | 开启会话前置校验;share 关闭被杀会话 | ACL(isShareVisible/toDisplayResponse 翻译,`server/lib/configDocs.js`)+ OHS |
| 用户账号 | S-01 账号与准入 / D-01(支撑/基础数据域) | ownerId/userId | 登录态与 owner 鉴权结论 | 配对与控制会话端点鉴权 | 遵奉者(requireAuth 中间件标准协议) |
| 比赛记录 | S-04 比赛记录与复盘(支撑域) | —(不存其 ID) | 保存回执 | 会话结束/显式停止触发自动保存 | OHS(服务调用;载荷翻译归 C-01 ACL) |

> 关联域内部模型与接口细节在各域自己的 PRD/API 文档中定义,此处不展开。

### 过程数据分类表

| 数据项 | 类别 | 处理方式 |
|--------|------|---------|
| SSE 帧(state/session/command/signal/change) | P5 集成载荷 | 传输载体,不持久化 |
| WebRTC 信令帧 | P5 集成载荷 | 一次性透传,不排队不存储 |
| 快照 wire 载荷 | P5 集成载荷 | 发布语言本体,聚合根只存最新一份 |
| displayBanner / sessionNotice | P3 UI 交互状态 | 横幅/提示,定时消退 |
| rtcState(off/connecting/open) | P3 UI 交互状态 | 链路指示 |
| 角色记忆 selfHost/lastRemote | P3 UI 交互状态(设备本地) | localStorage 便利恢复,清会话即清 |
| transitionKey | P7 计算中间值 | 上报触发指纹 |
| 快照队列/在飞守卫(startingRef/recoveringRef) | P7 计算中间值 | 并发整形,不持久化 |
| 时钟偏移估计(hostClockOffset/consumerClockSkew EMA) | P7 计算中间值 | 补偿用估计量,仅内存 |

### 跨业务域集成(Step 9)

| 集成边 | 模式 | 说明 |
|--------|------|------|
| C-02 ↔ C-01(核心↔核心) | OHS+PL | 快照发布语言 + 命令消息;C-02 不侵入引擎内部结构 |
| C-02 ← S-02(核心←支撑) | ACL | 模板投影经服务端序列化器翻译为大屏/会话视角 |
| C-02 ← S-01/D-01 | 遵奉者 | 遵循 requireAuth/角色中间件标准协议 |
| C-02 → S-04 | OHS | 会话结束仅触发一次保存调用,业务模型归 S-04 |
| C-02 ↔ 外部(大屏浏览器/手机) | ACL+PL | 匿名面仅暴露 shareToken 视角(display 路由),内部模型不外泄 |

## 第十三部分:逆向归档代码对照

| 需求块 | 主要实现文件 |
|--------|------------|
| 会话注册表(聚合根) | `server/lib/timerSessions.js`(单测 `timerSessions.test.js`) |
| 控制会话端点(create/report/command/signal/end) | `server/routes/configurations.js:234-342` |
| 大屏端点(stream/state/config) | `server/routes/display.js`(单测 `displayRoutes.test.js`) |
| 配对端点 | `server/routes/pairing.js`(单测 `sessionRoutes.test.js`) |
| SSE 基建 | `server/lib/sseHub.js` |
| 客户端会话/跟随/遥控装配 | `src/timer/useTimerSessionSync.js` |
| P2P 直连 | `src/timer/rtcChannel.js` |
| 快照编解码 | `src/timer/snapshotCodec.js`(单测 `snapshotCodec.test.js`) |
| 上报队列与失败分类 | `src/timer/snapshotReporting.js`(单测 `snapshotReporting.test.js`) |
| 会话服务客户端 | `src/services/TimerSessionService.js` |
| 主机命令/信令监听挂载 | `src/timer/useDebateTimer.js:43-51` |
| 控制台/大屏页呈现 | `src/TimerControlPage.jsx`、`src/TimerDisplayPage.jsx` |

## 附录 A:历史编码对照

代码注释中存在比 AA/FL 更细的历史编号,归档时保留对照,不作为模块编码依据:

| 历史编码 | 含义 | 出处 |
|---------|------|------|
| C-02-06 | 控制台跟随/配对发现(detection/takeover/静默恢复) | `src/timer/useDebateTimer.js:546-549`、`src/timer/useTimerSessionSync.js:48-53` |
| C-02-07 | 双模遥控(瘦遥控器+服务器中转) | `src/timer/useTimerSessionSync.js:53-54`、`server/lib/timerSessions.js:9-13` |
| C-02-08 | P2P 同网直连(WebRTC DataChannel) | `src/timer/rtcChannel.js:1-9` |
| D20~D35 | 快照打点/代际/主权/补偿/平滑等硬ening 编号(PageSpec §15-§19) | `src/timer/useTimerSessionSync.js`、`src/timer/snapshotCodec.js`、`server/lib/timerSessions.js` 内注释 |

## 附录 B:术语表

| 术语 | 定义 | 备注 |
|------|------|------|
| 同步会话 | 一次「主机-大屏-遥控」协同控制上下文,内存态,随 shareToken 唯一 | 与登录会话(session.js)同词异义 |
| 快照(snapshot) | 主机计时状态的发布语言编码,seq 单调 | 见 §5.2 字段表 |
| 主权(D29) | 一个会话席位仅归一个控制台;不符 sessionId 的上报被 409 让位 | code=session_taken |
| 代际(D23) | sessionId 标识会话世代;变化即重置消费端 seq 去重 | 服务重启场景 |
| 直连(P2P) | 遥控↔主机同网 DataChannel 旁路,信令经服务器透传 | iceServers 为空 |
| 让位(yield) | 冲突仲裁失败方停止上报并回退,不自愈不保存记录 | 「另一设备正在控制」 |
| 角色记忆 | 设备本地记录本机开过/遥控过的会话,用于静默恢复 | selfHost/lastRemote |

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.0 | 2026-11-11 | 逆向归档初始版:按现有实现归纳四子模块 FR、会话状态机、协议规则与 DDD 战术建模(聚合根=同步会话),完备性检查通过 |

---

## 附:PRD 完备性检查报告(D2-1)— 通过

```
功能类型:业务流程 + 集成对接(会话状态机;三端一服快照/指令/信令协议)
检查项:15/15 通过(G1~G5 + T1/T1a/T2 + T6 对接系统/T7 数据映射/T8 幂等策略);
        4 项不适用(T3 审批、T4 查询筛选、T5 导出、T9 工具规格——本模块无审批/
        台账/工具场景);加分项 N1~N4 全覆盖
```

| 维度 | 结论 | 位置 |
|------|------|------|
| G1 业务目标 | ✓ §2.1 | 4 目标 |
| G2 功能范围 | ✓ §3(含 6 条不做什么) | |
| G3 角色定义 | ✓ §2.2 | 4 角色 |
| G4 领域对象 | ✓ §5.2 | 8 对象 |
| G5 对象关系 | ✓ §5.1 | 关系图 |
| T1 业务字段 | ✓ §5.2 字段表 | |
| T1a 被引用关系 | ✓ §11 | |
| T2 状态流转 | ✓ §6(会话/控制端/横幅/直连/仲裁五组) | |
| T6 对接系统 | ✓ 三端一服标识与通道方式(§4,§12) | |
| T7 数据映射 | ✓ 快照编解码/校验归一规则(BR-C02-04/06/07) | |
| T8 幂等策略 | ✓ seq/commandSeq 单调去重(BR-C02-03,§4.4) | |
| N1~N4 | ✓ §8~§10 | |

本次变更影响范围:初始归档,无历史版本,不影响既有领域模型/接口/状态流转。可进入 API 设计阶段(D3)。
