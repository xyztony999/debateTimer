# C-01 比赛计时 API 设计

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定(逆向归档) |
| 最后更新 | 2026-11-11 |
| 模块编码 | C-01(核心业务域) |
| 子模块 | C-01-01 计时控制 / C-01-02 计时模式 / C-01-03 超时宽限 / C-01-04 告警提示 / C-01-05 自动推进 |
| 上游依据 | 《C-01 比赛计时 PRD》v1.0(DDD 建模:聚合根=计时引擎状态)、应用架构 2.1.1 |
| 功能类型 | 业务流程类(纯前端域:**无服务端接口,引擎状态本地聚合**) |
| 本文架构事实 | 计时引擎为浏览器内纯 reducer(`src/timer/engine.js`),引擎状态不落库、不经网络;本模块在 HTTP 层面的接口清单为**空** |

## 1. 模块设计概述

### 1.1 业务背景及目标

比赛计时是系统业务价值核心:计时操作员按赛制模板驱动比赛进程(倒计时、三种计时模式、超时宽限、三节点告警、自动推进)。逆向归档视角下的 API 事实:**计时决策全部在计时主机浏览器内完成**——引擎是一个纯 reducer 状态机(副作用以事件外排,由运行时装配钩子消费),引擎状态本地聚合,无任何计时专用服务端接口(依据:`src/timer/engine.js:1-12` 文件头注释「纯 reducer 计时引擎」;server/routes/ 目录下不存在计时端点,计时相关服务端代码仅为 C-02 的会话通道,见其 API 文档)。

### 1.2 边界说明

**本模块接口上不存在的东西(如实标注)**:

| 不存在项 | 说明 | 真实归属 |
|---------|------|---------|
| 计时控制 HTTP 接口 | 启停/重置/切阶段/模式切换均为本地 `dispatch(action)`,无网络往返 | 进程内契约(本文 §4.4) |
| 计时状态持久化 | 引擎状态纯内存,无 MongoDB 集合;采集镜像仅 sessionStorage(`timer.matchCapture.v1`) | `src/timer/matchCapture.js:96-138` |
| 告警偏好同步接口 | SoundPrefs 存本设备 localStorage(`timer.soundPrefs`),无读写接口 | `src/services/soundPrefs.js:7-20` |
| 快照上报/遥控指令/配对 | 由 C-02 的会话端点承担(主机经装配钩子被 C-02 调用) | `workspace/02-detailed/api/C-02-大屏同步与远程控制/api.md` |
| 记录保存/查询/导出 | 由 S-04 的 match-logs 端点承担 | S-04 API 文档(端点见 `server/routes/matchLogs.js:55-125`) |

**本模块向外的两类旁路载荷(契约定义在各消费域的 API 文档)**:

| 载荷 | 编码函数 | 消费域 | 契约归属 |
|------|---------|-------|---------|
| 计时快照(发布语言) | `buildSnapshot`(`src/timer/snapshotCodec.js:54-79`) | C-02(经其会话端点上报/广播) | C-02 API 文档 §4.4 |
| 比赛记录保存载荷 | `buildMatchPayload`(`src/timer/matchCapture.js:81-94`) | S-04(`POST /api/match-logs`) | S-04 API 文档 |

### 1.3 设计决策

| # | 决策 | 理由 | 依据 |
|---|------|------|------|
| D1 | 计时引擎纯 reducer,事件外排 | 引擎无副作用可测试(`src/timer/engine.test.js`);告警/采集/推进由装配钩子消费事件完成,引擎与设备偏好经事件队列解耦 | PRD §5.1 |
| D2 | 无服务端计时接口 | 现场单页单场、引擎单实例内存态(NFR-C01-04),网络往返只会引入延迟与失真;同步需求整体归 C-02 的会话协议 | AA 2.1.1、PRD §8 NFR-C01-04 |
| D3 | 渲染/上报毫秒读数走墙钟锚点层 | 引擎整秒数是量化值,子秒相位由锚点 `{running,endAt,frozenMs}` 提供,渲染与快照同源 | `src/timer/useDebateTimer.js:63-96`、`src/timer/snapshotCodec.js:64-68` |
| D4 | 心跳放 Web Worker(250ms 节拍) | 后台页签计时器被节流,Worker 不受影响;Worker 不可用回退 setInterval | `src/timer/tickWorker.js:1-6`、`src/timer/useDebateTimer.js:269-275` |

### 1.4 领域对象总览

| 对象 | 分类 | 说明 |
|------|------|------|
| 计时引擎状态 TimerEngineState | 聚合根 | stageId/stageMode/durationSec/graceSec/advance/freeAutoSwitch/tickRemainderMs/events(`src/timer/engine.js:36-52`) |
| 方侧时钟 SideState(×3:single/aff/neg) | 域内实体 | remaining/running/phase/graceLeft/blinkOverride(`src/timer/engine.js:26-34`) |
| 设备告警偏好 SoundPrefs | 域内实体(设备本地) | {node}.sound/volume、tts.enabled、tts.{node}(`src/services/soundPrefs.js:16-33`) |
| 引擎事件 AlertEvent | 值对象 | `{type: sound\|voice\|overrun, node, side?}`(`src/timer/engine.js:70-85`) |
| 墙钟锚点 ClockAnchor | 值对象 | `{running, endAt, frozenMs}`(`src/timer/useDebateTimer.js:63-96`) |
| 阶段配置投影 StageProjection | 值对象 | APPLY_STAGE 落定的 `{stageId, stageMode, durationSec, graceSec}` |
| 实绩采集子流程(S-04-01) | 子流程 | 捕获文档镜像 sessionStorage,最终经 S-04 接口持久化(PRD §4.6) |
| 关联领域对象 | — | 赛制模板投影(S-02,ACL)/同步会话(C-02,OHS+PL)/比赛记录(S-04,ACL+OHS)——内部模型与接口见各域 API 文档 |

### 1.5 上下文映射

| 集成边 | 模式 | 接口层落点 |
|--------|------|-----------|
| C-01 → C-02(核心↔核心) | OHS+PL | 快照=发布语言,由 C-02 的 `PUT /api/configurations/:name/session/state` 上报并广播;C-02 遥控指令回灌为引擎动作(`applyHostCommand`,`src/timer/useTimerSessionSync.js:538-568`) |
| C-01 ← S-02(核心←支撑) | ACL | 模板 doc 经 `useDebateConfig` 翻译为运行时投影(`src/timer/useDebateConfig.js:66-90`),REST+SSE 由 S-02/S-01 域端点提供 |
| C-01 → S-04(核心→支撑) | ACL+OHS | 采集载荷经 `POST /api/match-logs` 提交(`server/routes/matchLogs.js:55`),契约归 S-04 API 文档 |

## 2. 跨聚合根设计

**不适用(裁剪)**:本模块单聚合根(计时引擎状态)。跨聚合根协作(会话/记录)在 C-02 与 S-04 各自的聚合边界内完成,本模块只以发布语言/命令消息与之交接(见 §1.5)。

## 3. 应用/基础设施层设计

### 3.1 接口规范

> **核心标注:本模块无服务端接口,引擎状态本地聚合。** HTTP 接口清单为空;server/routes/ 中没有任何计时端点(计时相关的服务端接口全部属于 C-02 会话通道与 S-04 记录通道)。本节规范的是**进程内契约**。

**3.1.1 引擎动作派发(唯一写入口)**

运行时钩子 `useDebateTimer` 暴露 `dispatch(action)`;动作即本模块的「写接口」,全部枚举于 §4.4。约定:

- 每个动作在单拍内原子演进聚合根(三侧时钟+advance+事件队列),无跨动作中间态。
- 用户意图时刻(START/STOP/TOGGLE)先写墙钟锚点再派发动作,保证整秒视图与毫秒真相同源(`src/timer/useDebateTimer.js:98-130`)。

**3.1.2 引擎事件消费(唯一副作用出口)**

- 引擎将告警/超时事件排入 `events` 队列,装配钩子消费后派发 `CONSUME_EVENTS` 清空(`src/timer/engine.js:70-85`)。
- 事件是本模块对外的「通知接口」:sound/voice → 告警播放(读设备偏好);overrun → 实绩采集落账。

**3.1.3 派生读接口**

- `liveSides`:每帧由锚点+引擎派生的毫秒读数投影(running 态 `endAt - now`,frozen 态冻结值),供渲染与快照编码消费(`src/timer/useDebateTimer.js:506-515`)。
- `derived`:模式/是否双计时/是否自由/活动侧/环节锁定/闪烁选择器(`src/timer/engine.js:404-456`)。

**3.1.4 HTTP 接口清单**

空。下游 HTTP 契约的完整定义见:C-02 API 文档(会话五端点+display 三端点+配对)、S-04 API 文档(match-logs 五端点)。

### 3.2 依赖与约束

| 依赖 | 性质 | 约束 |
|------|------|------|
| `src/timer/engine.js` | 本模块核心 | 纯函数,禁止网络/时钟/存储副作用 |
| `src/timer/tickWorker.js` | 心跳源 | 250ms 节拍;不可用回退 setInterval;回可见补拍仅当 elapsed>1500ms(BR-C01-06) |
| `src/services/soundPrefs.js` / `speech.js` | 事件消费者 | 读设备偏好,与引擎无共享可变字段 |
| `src/timer/matchCapture.js` | 子流程载体 | sessionStorage 镜像,引擎不回读采集结果 |
| S-02 配置投影 | 只读输入 | 跟随态下配置重复投递不得重置已采纳阶段与时钟(BR-C01-12) |

### 3.3 权限模型

| 层 | 事实 |
|----|------|
| 服务端 | **无本模块专属端点,无权限矩阵**。所有带鉴权的服务端交互(会话开启/上报、记录保存)由对应域的 `requireAuth` 把守(C-02/S-04 API 文档) |
| 前端路由 | 计时台 `/` 由 `ProtectedRoute` 包裹(需登录态的前端守卫,`src/App.jsx:30-37`);大屏 `/display/:token` 公开(`src/App.jsx:27`) |
| 本机偏好 | SoundPrefs 为设备本地数据,无身份归属,无授权语义 |

### 3.4 公共规范(枚举池)

本模块的进程内枚举即其「公共规范」;其中 stageMode/phase 同时是 C-02 快照协议的 wire 枚举(服务端校验同值,`server/lib/timerSessions.js:3-5`)。

| 枚举 | 取值 | 出处 |
|------|------|------|
| stageMode(计时模式) | single / double / free | `src/timer/engine.js:19` |
| phase(单侧相位) | running / grace / locked | `src/timer/engine.js:14-16` |
| 引擎动作 action | APPLY_STAGE / START / STOP / TOGGLE / RESET / TICK / SET_ADVANCE / ADVANCE_TICK / ADOPT / SOUND_CHECK / PREP_ZERO / STOP_ALL / CONSUME_EVENTS | `src/timer/engine.js:246-402` |
| 事件 type | sound / voice / overrun | `src/timer/engine.js:70-85` |
| 告警节点 node | warn30 / timeUp / mustStop / handover(handover 仅 TTS) | `src/services/soundPrefs.js:7,25` |
| 铃声方案 sound | split / notify / timeup / chime | `src/services/soundPrefs.js:9-14` |
| 事件侧 side | single / aff / neg(单模式采集映射 single→aff) | `src/timer/engine.js:21`、`src/timer/useDebateTimer.js:154-167` |

## 4. 聚合根详细设计

### 4.1 领域模型

**管理模式声明**:不适用混合模式——聚合根为纯前端内存态,无自管/托管数据来源之分(引擎状态仅由本设备产生)。

**表结构组合**:**无数据库表**(引擎零持久化;采集镜像为 sessionStorage 会话级,非数据库对象)。

**领域对象与字段**:见 §1.4 总览,字段明细以 PRD §5.2 字段表为准(逆向归档一致,此处不重复)。关键字段:

- `tickRemainderMs`(0–999):子秒余量跨拍结转,防整秒取整漂移(BR-C01-04)。
- `advance`(null 或 3→0):自动推进倒计时,臂动值固定 3(PRD §5.2)。

**不变量**:

| # | 不变量 | 出处 |
|---|--------|------|
| INV-C01-1 | 三侧时钟与 advance 在单拍内一致演进,外部只能经动作修改侧时钟(A3) | `src/timer/engine.js:130-173` |
| INV-C01-2 | 事件队列只增与整队清空(CONSUME_EVENTS),消费即清无残留 | `src/timer/engine.js:70-85` |
| INV-C01-3 | 锚点为毫秒权威、引擎为结构权威;偏差 >1500ms 向引擎再锚定 | `src/timer/useDebateTimer.js:220-249` |
| INV-C01-4 | 单次追拍封顶 300 拍(MAX_CATCHUP_BEATS),防失控快进 | `src/timer/engine.js:127,189-192` |

**领域服务**:无独立领域服务——相位跃迁/交接/推进判定均为聚合根内动作实现(`handleTimeUp`/`startTransition`,`src/timer/engine.js:99-123,225-244`)。

**业务常量**:

| 常量 | 值 | 含义 | 出处 |
|------|-----|------|------|
| MAX_CATCHUP_BEATS | 300 | 单次追拍最大补拍数 | `src/timer/engine.js:127` |
| BLINK_WINDOW_HIGH / LOW | 30 / 27 | 视觉闪烁窗口(闭区间,仅 running 相位) | `src/timer/engine.js:23-24,409-417` |
| 心跳节拍 | 250ms | Worker/回退 interval 的 tick 周期 | `src/timer/tickWorker.js`、PRD BR-C01-06 |
| 再锚定阈值 | 1500ms | 锚点↔引擎读数分歧阈值;亦为回可见补拍阈值 | `src/timer/useDebateTimer.js:220-249,286-300` |

**标签池**:不适用(无服务端数据,无标签/检索语义)。

### 4.2 状态模型

C-01 无流程审批状态;其「状态」是单侧相位机(计时域状态机),同时构成 C-02 快照协议 `phase` 枚举的取值域:

```
running ──(remaining=0 且 graceSec>0)──▶ grace ──(graceLeft=0)──▶ locked
   └──(remaining=0 且 graceSec=0)─────────────────────────────────┘
locked:按播放不解锁,重响 mustStop;grace:按播放重开宽限窗口
RESET ──▶ running 相位并回满时长
```

出处:`src/timer/engine.js:9-11,99-123,225-244`;两段铃声语义(timeUp 入宽限 / mustStop 锁定)与自动推进子状态见 PRD §6。API 视角要点:phase 取值与 graceMs>0 的严格一致性由 C-02 服务端校验强制(`server/lib/timerSessions.js:348-360`),本模块经 `buildSnapshot` 编码时已保证该一致性(`src/timer/snapshotCodec.js:58-59,76-77`)。

### 4.3 子流程设计

**子流程 1:实绩自动采集(S-04-01)**

| 项 | 契约 |
|----|------|
| 触发 | APPLY_STAGE(开新捕获条目)、overrun 事件(超时计数 +1) |
| 输入 | 阶段配置投影、sidesNow、超时侧 |
| 输出 | 采集文档 capture{startedAt, entries[]}(sessionStorage 镜像 `timer.matchCapture.v1`) |
| 出口 | `buildMatchPayload` → S-04 `POST /api/match-logs`(契约归 S-04 API 文档);引擎不回读 |

出处:`src/timer/matchCapture.js:40-94`、`src/timer/useDebateTimer.js:172-195,445-460`。

**子流程 2:自动推进臂动/倒计时**

状态在聚合根内(advance 字段),非独立一致性边界;臂动条件(非跟随+非末阶段+无侧宽限+阶段彻底结束+stageAutoAdvance)与取消语义见 PRD §4.5/§6.2(`src/timer/useDebateTimer.js:364-374,466-482`)。对外无接口——推进产生的 APPLY_STAGE 与本地操作走同一派发路径。

### 4.4 接口设计

**4.4.1 接口清单(HTTP)**

> **空。** 如实标注:本模块无服务端接口,引擎状态本地聚合。消费本模块能力的网络接口全部由下游域提供,归属见 §1.2。

**4.4.2 动作接口清单(进程内,聚合根写入口)**

| 动作 | 语义 | 关键规则 | 出处 |
|------|------|---------|------|
| APPLY_STAGE | 落定阶段配置投影并重置该阶段全部时钟 | 阶段越界不动;切阶段关旧开新捕获条目 | `src/timer/engine.js:248-261` |
| START / STOP / TOGGLE | 启停(意图时刻先写锚点) | locked 侧 TOGGLE 不解锁,重响 mustStop;grace 侧 TOGGLE 重开宽限 | `src/timer/engine.js:225-244` |
| RESET | 该侧回满时长并解除锁定/宽限 | 双计时仅未运行时可按(控制页拦截);sound_check 阶段为 PREP_ZERO 归零不锁定 | `src/timer/engine.js:298-311,373-384` |
| TICK | 心跳节拍(250ms),按真实流逝秒数追拍 | 余量结转;单次封顶 300 拍 | `src/timer/engine.js:125-204` |
| SET_ADVANCE / ADVANCE_TICK | 臂动/递减自动推进倒计时 | 归零切下一阶段;任意手动输入取消 | `src/timer/engine.js:263-311` |
| ADOPT | 采纳外部快照(C-02 跟随/接管)写入引擎 | 消费端装配层先经 codec 换算(契约归 C-02) | `src/timer/engine.js`(ADOPT)、`src/timer/snapshotCodec.js:86-130` |
| SOUND_CHECK | 声音测试阶段试听 | 只影响 single 侧;30 秒试听置 blinkOverride | `src/timer/engine.js:340-371` |
| STOP_ALL | 全停冻结(会话 ended 冻结镜像) | C-02 跟随端 ended 时使用 | `src/timer/useTimerSessionSync.js:832-860` |
| CONSUME_EVENTS | 消费并清空事件队列 | 装配钩子处理完 sound/voice/overrun 后派发 | `src/timer/engine.js:70-85` |

**4.4.3 服务依赖清单**

无服务方法依赖(无后端)。装配钩子 `useDebateTimer` 依赖:锚点工具(`clockAnchors.js`)、心跳 Worker(`tickWorker.js`)、告警消费(`soundPrefs.js`/`speech.js`)、采集(`matchCapture.js`)、C-02 装配注入(`useTimerSessionSync.js:896` 返回 reportSnapshot 等入口)。

**4.4.4 接口详情 / 服务方法规格**

不适用——无 HTTP 接口、无远程服务方法。进程内动作的语义即上表;快照 wire 契约(字段/校验/错误码)在 C-02 API 文档 §4.4 完整定义,本模块不重复定义消费方契约。

### 4.5 领域事件与集成

**领域事件(进程内,非 MQ)**:引擎事件 AlertEvent(`{type: sound|voice|overrun, node, side?}`)为进程内值对象,消费即清,不发布到任何消息通道(现场单机场景,无 MQ 基建)。SSE 上的 state/session/command/signal 事件属 C-02 会话协议,见其 API 文档 §4.5。

**MQ 映射**:无。

**仓储契约**:无数据库仓储;采集文档的持久化出口是 S-04 的 `POST /api/match-logs`(S-04 域)。

**关联域调用**:

| 调用 | 方式 | 归属 |
|------|------|------|
| 快照上报/指令执行/会话开关 | C-02 装配钩子注入调用(`src/timer/useDebateTimer.js:407-433`) | C-02 API 文档 |
| 记录保存 | `buildMatchPayload` → S-04 端点(`src/timer/useDebateTimer.js:379-403`) | S-04 API 文档 |

## 5. 模块清单汇总

> 本模块为纯前端域,清单如实为空集;下游域承担的对外服务在此仅作索引。

### 5.1 对外服务清单

无 HTTP 对外服务。相关下游服务索引:

| 服务 | 方法与路径 | 提供域 | 文档 |
|------|-----------|-------|------|
| 会话开启/上报/指令/信令/停止 | `POST/PUT/POST/POST/DELETE /api/configurations/:name/session…` | C-02 | C-02 API 文档 |
| 大屏流/状态/配置 | `GET /api/display/:token(/stream|/state)` | C-02 | C-02 API 文档 |
| 配对 | `POST /api/session/pair` | C-02 | C-02 API 文档 |
| 记录保存/查询/导出/删除 | `POST/GET/GET /api/match-logs…` | S-04 | S-04 API 文档 |

### 5.2 SQL 清单

无(引擎零持久化;采集镜像为 sessionStorage)。

### 5.3 DDL

无。

## 6. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档初始版:按现有实现如实归档——确认 C-01 无服务端接口,引擎状态本地聚合;登记进程内动作/事件/枚举契约与下游域接口归属 |

**变更类型词汇表**:见 D3 分册(initial/structural/interface_added/…)。**版本号规则**:次版本随接口契约变更递增;本模块契约面(动作/事件/枚举)变更视同接口变更。

---

## 附:归档核对说明(逆向归档)

- 「无服务端接口」结论的核对:`server/routes/` 全目录清单仅含 admin/auth/configurations/display/gallery/matchLogs/pairing 七个路由文件(本会话 `ls` 实测),无计时端点;计时引擎文件 `src/timer/engine.js:1-12` 自述为纯 reducer。
- 本文所有代码引用均在本会话直接读取核对;与《C-01 PRD》v1.0 的实现对照表(PRD 第十三部分)一致。
