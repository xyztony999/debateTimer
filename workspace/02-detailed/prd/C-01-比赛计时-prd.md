# C-01 比赛计时 PRD

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定(逆向归档) |
| 最后更新 | 2026-11-11 |
| 模块编码 | C-01(核心业务域) |
| 子模块 | C-01-01 计时控制 / C-01-02 计时模式 / C-01-03 超时宽限 / C-01-04 告警提示 / C-01-05 自动推进 |
| 上游依据 | 《应用架构》2.1.1、《功能清单》2.1.1.1、《业务架构》2.2.1(v1.0) |
| 功能类型 | 业务流程(计时状态机驱动) |
| 关联模块 | C-02 大屏同步与远程控制 / S-02 赛制模板管理 / S-04 比赛记录与复盘 |

## 第一部分:文档概述

### 1.1 背景与目标

系统已上线运行,本文档为**逆向归档**:按 D2 分册模板将 C-01 比赛计时的现有实现归纳为 PRD,作为 D3 API 设计与 D4 交互设计的输入。比赛计时是系统业务价值核心:计时操作员按赛制模板驱动比赛进程,掌控倒计时、计时模式、超时宽限与告警语音,并在阶段结束后自动推进。实现上是一个**纯 reducer 计时引擎**(副作用以事件外排)加上**运行时装配钩子**(墙钟心跳、告警播放、实绩采集、自动推进、同步装配)。

### 1.2 文档定位

| 定位 | 说明 |
|------|------|
| 本文档做什么 | 定义 C-01 的业务目标、功能范围、领域对象、状态流转、业务规则与非功能要求;完成 DDD 战术建模(聚合根=计时引擎状态) |
| 本文档不做什么 | 不定义接口报文与端点(D3 产出)、不定义页面布局细节(D4 产出)、不展开 C-02 的会话模型(见其自带 PRD)、不展开 S-04 记录模型(见其自带 PRD) |

### 1.3 范围

| 范围 | 说明 |
|------|------|
| 业务域 | 辩论赛计时与赛事支持 · 赛中执行 |
| 模块边界 | 计时引擎与告警(铃声/TTS)、实绩采集依附行为 |
| 涉及菜单(FL) | 计时台、告警与语音设置 |

## 第二部分:业务目标与角色

### 2.1 业务目标(G1)

| # | 目标 | 说明 |
|---|------|------|
| G1-1 | 现场计时零失误 | 倒计时逐秒准确(子秒余量跨拍结转,后台节流可追平),阶段推进由操作员一键/快捷键驱动 |
| G1-2 | 赛制语义可执行 | 三种计时模式、宽限两段语义(时间到/必须停)与模板配置严格一致 |
| G1-3 | 现场感知无死角 | 30 秒提醒/时间到/必须停三节点铃声+闪烁,TTS 语音播报可按设备开启 |
| G1-4 | 过程可复盘 | 计划 vs 实际用时、超时次数在计时过程中自动采集(供 S-04 保存) |

### 2.2 角色定义(G3)

| 角色 | 职责 | 代码入口 |
|------|------|---------|
| 计时操作员 | 启停/重置/切换阶段(按钮+快捷键),开启会话与遥控(经 C-02),配置告警偏好,手动保存记录 | `src/TimerControlPage.jsx:81` |
| 大屏观众(呈现侧) | 只读观看倒计时;铃声/闪烁/语音在大屏按其本地偏好同步呈现(FL 2.1.1.4 标注大屏观众) | `src/TimerDisplayPage.jsx:19`、`src/services/soundPrefs.js:115-126`(每设备各自偏好) |
| 系统 | 实绩自动采集(S-04-01):逐阶段累计实际用时与超时次数 | `src/timer/matchCapture.js:40-75` |

## 第三部分:功能范围(G2)

### 3.1 做什么

| 子模块 | 功能点概要 |
|--------|-----------|
| C-01-01 计时控制 | 当前阶段倒计时展示;启动/暂停/重置;阶段切换(时间线按钮 + ←/→ 快捷键);锁定/宽限态的再按语义;声音测试阶段试听按钮 |
| C-01-02 计时模式 | 单计时 / 双计时(正反方各自启停重置)/ 自由辩论(停止后自动交接给对方);模式由模板阶段配置驱动 |
| C-01-03 超时宽限 | 时间到进入宽限收尾倒计时,宽限耗尽锁定;区分「时间到/必须停」两段铃声语义 |
| C-01-04 告警提示 | 三节点铃声方案+音量+试听;27–30 秒视觉闪烁;TTS 语音播报(总开关+四节点分开关+试听),偏好保存在本设备 |
| C-01-05 自动推进 | 阶段彻底结束 3 秒后自动进入下一阶段,期间任意手动操作取消;末阶段不推进;宽限未清不臂动 |
| 依附行为 | 实绩自动采集(S-04-01):逐阶段开启捕获条目、超时铃计数、刷新安全网(sessionStorage 镜像恢复) |

### 3.2 不做什么(边界)

| # | 边界 | 归属 |
|---|------|------|
| B-1 | 赛制模板的创建/编辑/切换/队名配置 | S-02(计时仅消费其只读投影) |
| B-2 | 会话开关、快照上报、遥控指令、配对 | C-02(计时运行时通过装配钩子被其调用) |
| B-3 | 比赛记录的保存接口、查询对比、导出 | S-04(计时仅产出采集载荷并调用保存) |
| B-4 | 大屏页的横幅/全屏等呈现层交互 | D4 交互设计 + C-02-02 |
| B-5 | 多场比赛并行计时 | 不支持(单页单场,引擎为单实例状态) |

## 第四部分:功能需求(FR)

### 4.1 C-01-01 计时控制

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C01-01-01 | 当前阶段倒计时逐秒展示;渲染读数取**墙钟锚点毫秒**(running: `endAt - now`;frozen: 冻结值),引擎整秒数作为回退 | `src/timer/useDebateTimer.js:506-515`(liveSides)、`src/timer/useDebateTimer.js:78-96`(锚点读写) |
| FR-C01-01-02 | 启动/暂停:单计时模式 Space 或按钮(TOGGLE);双/自由模式正反方独立启停(A/L 快捷键);locked 侧按播放**不**解锁,改为重响「必须停」铃 | `src/timer/engine.js:225-244`(startTransition)、`src/timer/useTimerKeyboardShortcuts.js:60-83` |
| FR-C01-01-03 | 重置:RESET 将该侧回满时长并解除锁定/宽限;双计时 Shift+Q/O 且**仅在未运行时可按**(控制页拦截);单计时 Shift+R | `src/timer/engine.js:298-311`、`src/TimerControlPage.jsx:164-187` |
| FR-C01-01-04 | 声音测试阶段(sound_check)Shift+R 归零不锁定(PREP_ZERO),供试听闪烁与铃声 | `src/timer/engine.js:373-384`、`src/TimerControlPage.jsx:176-185` |
| FR-C01-01-05 | 阶段切换:时间线胶囊按钮 + ←/→ 快捷键,仅切相邻阶段,越界不动;切阶段即 APPLY_STAGE 重置该阶段全部时钟 | `src/timer/useDebateTimer.js:197-209`、`src/timer/engine.js:248-261` |
| FR-C01-01-06 | 快捷键在跟随态禁用(BR-5:跟随会话时本页只读);输入框聚焦时不拦截按键 | `src/timer/useTimerKeyboardShortcuts.js:16-17,33-41` |
| FR-C01-01-07 | sound_check 阶段提供 30 秒铃/结束铃试听按钮,铃声在**运行 reducer 的主机**(会场音箱)播放 | `src/TimerControlPage.jsx:283-301`、`src/timer/engine.js:340-371` |
| FR-C01-01-08 | 竖屏窄手机(≤600px 且 portrait)自动切换遥控器布局(同一运行时的呈现变体;历史编码 C-01-08,见附录 A) | `src/TimerControlPage.jsx:104-105,564-737` |

### 4.2 C-01-02 计时模式

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C01-02-01 | 单计时(single):单钟驱动,渲染/上报时镜像到正反双侧 | `src/timer/engine.js:19`(MODE_STRING)、`src/timer/snapshotCodec.js:54-79` |
| FR-C01-02-02 | 双计时(double):正反方各自独立计时,互不影响 | `src/timer/engine.js:130-173`(逐侧节拍) |
| FR-C01-02-03 | 自由辩论(free):一方停止/时间到后自动交接——仅当对方剩余>0、相位 running 且未运行时,对方自动起表并播报「请X发言」 | `src/timer/engine.js:99-109,206-218` |
| FR-C01-02-04 | 模式来源:模板阶段配置 numeric(0/1/2)→ wire 字符串,APPLY_STAGE 时落定;运行中不可改模式 | `src/timer/engine.js:19`、`src/timer/useDebateTimer.js:172-195` |
| FR-C01-02-05 | 自由辩论双方均 locked → 环节锁定提示(单/双布局均展示) | `src/timer/engine.js:419-423`、`src/TimerControlPage.jsx:800-808` |
| FR-C01-02-06 | 引擎事件侧键固定三侧 single/aff/neg;单模式捕获时把 single 映射为 aff、neg 记空 | `src/timer/engine.js:21`、`src/timer/useDebateTimer.js:154-167` |

### 4.3 C-01-03 超时宽限

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C01-03-01 | 时间到且模板宽限>0 → 该侧相位 running→grace,graceLeft=宽限秒数,响「时间到」铃+语音 | `src/timer/engine.js:112-118` |
| FR-C01-03-02 | 宽限逐秒递减,归零 → locked + 「必须停」铃 + 超时计数(overrun 事件) | `src/timer/engine.js:150-170` |
| FR-C01-03-03 | 时间到且无宽限 → 直接 locked + 「必须停」铃 + 超时计数 | `src/timer/engine.js:115-118` |
| FR-C01-03-04 | 宽限中的侧展示「收尾中…」文案,钟面读数切宽限余量 | `src/locales/zh-Hans.json:85`、`src/components/TimerBox.jsx`(graceText) |
| FR-C01-03-05 | 任一侧处于宽限时抑制自动推进臂动 | `src/timer/useDebateTimer.js:469-482`(anyInGrace 条件)、`src/timer/engine.js:453-456` |
| FR-C01-03-06 | 宽限相位内再按播放 → 宽限窗口按模板宽限重开(重响时间到铃) | `src/timer/engine.js:231-238` |

### 4.4 C-01-04 告警提示(铃声 + TTS)

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C01-04-01 | 三节点铃声:warn30(运行中剩余恰为 30 秒时)、timeUp(时间到)、mustStop(必须停) | `src/timer/engine.js:138-143`、`src/timer/engine.js:7-11,70-72` |
| FR-C01-04-02 | 视觉闪烁:运行钟处于 27–30 秒窗口,或声音试听的 blinkOverride 置位 | `src/timer/engine.js:23-24,409-417` |
| FR-C01-04-03 | 每节点可配铃声方案与音量(0–100,步进 5),偏好保存在本设备(localStorage `timer.soundPrefs`),载入时逐键净化 | `src/services/soundPrefs.js:7-20,35,53-79`、`src/components/SoundSettingsPanel.jsx:169-211` |
| FR-C01-04-04 | 四种铃声素材:split / notify / timeup / chime | `src/services/soundPrefs.js:9-14` |
| FR-C01-04-05 | 试听:每节点铃声试听按钮(previewSound);TTS 各节点试听播报**真实文案**(以通称代入队名) | `src/services/soundPrefs.js:129-134`、`src/components/SoundSettingsPanel.jsx:131-145,250-262` |
| FR-C01-04-06 | TTS 总开关(默认关,现场通常有人工主持)+ 四节点分开关(warn30/timeUp/mustStop/handover,默认开) | `src/services/soundPrefs.js:25-33`、`src/components/SoundSettingsPanel.jsx:224-264` |
| FR-C01-04-07 | 语音播报文案随界面语言三语;队名优先取模板队名,无则用「正方/反方」通称 | `src/timer/useDebateTimer.js:317-341`、`src/locales/zh-Hans.json:76-81` |
| FR-C01-04-08 | 同一批引擎事件中的语音**合并为一次播报**(中文顿号/西文逗号连接,如「时间到,请反方发言」);新播报取消进行中的播报(cancel-then-speak,防自由辩论交接连发重叠) | `src/timer/useDebateTimer.js:342-358`、`src/services/speech.js:169-190` |
| FR-C01-04-09 | 自动播放解锁:启用 TTS 时注册一次性手势监听,首次点击/按键预热音频路径;面板显示未解锁/声音回退/就绪提示 | `src/services/speech.js:105-162`、`src/components/SoundSettingsPanel.jsx:88-101,147-165` |
| FR-C01-04-10 | 语音链回退:zh-Hans/fr-CA/en 各有 BCP-47 链,精确标签→语系前缀→系统默认 | `src/services/speech.js:12-23,83-103` |
| FR-C01-04-11 | 偏好重置按钮恢复默认;不支持 TTS 的浏览器禁用开关并提示 | `src/components/SoundSettingsPanel.jsx:125-129,227-236` |
| FR-C01-04-12 | 大屏呈现侧:铃声/闪烁/语音与主机同拍,但铃声与 TTS 按大屏自身设备偏好播放(主机与大屏互不覆盖) | `src/TimerDisplayPage.jsx:125-149`、`src/services/soundPrefs.js:115-126` |
| FR-C01-04-13 | 首次播放预热:warmupSounds 预解码铃声,避免首个告警延迟 | `src/services/soundPrefs.js:90-100`、`src/timer/useDebateTimer.js:302-309` |

### 4.5 C-01-05 自动推进

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C01-05-01 | 臂动条件全部满足才臂 3 秒倒计时:非跟随态 + 非末阶段 + 无侧在宽限 + 阶段彻底结束(双/自由=双侧 locked;单=single locked)+ 模板该阶段开启 stageAutoAdvance | `src/timer/useDebateTimer.js:466-482`、`src/timer/engine.js:445-451` |
| FR-C01-05-02 | 倒计时逐秒递减,归零自动进入下一阶段(applyStage) | `src/timer/useDebateTimer.js:364-374` |
| FR-C01-05-03 | 任意手动输入取消:快捷键任意按键(onAnyInput)、启停/重置等引擎动作均清 advance | `src/timer/useTimerKeyboardShortcuts.js:43-44`、`src/timer/engine.js:263-311` |
| FR-C01-05-04 | 倒计时期间提示「N 秒后进入下一阶段 · 按任意键取消」 | `src/TimerControlPage.jsx:295-299`、`src/locales/zh-Hans.json:86` |
| FR-C01-05-05 | 末阶段不推进(臂动条件含非末阶段) | `src/timer/useDebateTimer.js:470-471` |

### 4.6 依附行为:实绩自动采集(S-04-01)

> 归属说明:采集文档模型与保存/查询接口属 S-04;此处只登记计时过程中**自动发生**的采集行为。

| # | 需求 | 实现对照 |
|---|------|---------|
| FR-C01-90-01 | 每次进入阶段(含初始阶段)关闭上一捕获条目并开启新条目(计划时长/宽限/模式/展示名/进出时刻) | `src/timer/matchCapture.js:40-59`、`src/timer/useDebateTimer.js:172-195` |
| FR-C01-90-02 | 每次超时铃(mustStop)为当前阶段对应侧超时计数 +1(单模式记 Aff) | `src/timer/engine.js:83-85`、`src/timer/useDebateTimer.js:343-348` |
| FR-C01-90-03 | 刷新安全网:捕获文档镜像 sessionStorage(`timer.matchCapture.v1`),刷新后同模板静默恢复,不重开捕获 | `src/timer/matchCapture.js:96-138`、`src/timer/useDebateTimer.js:445-460` |

## 第五部分:领域对象与业务字段(G4/G5/T1)

### 5.1 对象关系(G5)

```
赛制模板投影(S-02,关联领域对象)
        │ APPLY_STAGE(阶段/模式/时长/宽限 只读消费)
        ▼
┌─ 计时引擎状态(聚合根)──────────────────────────┐
│  ├─ 方侧时钟 ×3(single/aff/neg,域内实体)      │
│  ├─ 墙钟锚点(值对象,渲染真相层)                │
│  └─ 引擎事件(值对象,副作用外排)                │
│         │ sound/voice → 告警播放(读设备告警偏好) │
│         └ overrun → 实绩采集子流程               │
│  advance(自动推进倒计时,聚合根字段)             │
└──────────────────────────────────────────────┘
        │ 快照上报(发布语言,经 C-02) / 保存载荷(S-04)
        ▼
C-02 同步会话(关联领域对象) / S-04 比赛记录(关联领域对象)
```

- 设备告警偏好与引擎状态通过**事件队列**解耦:引擎只发事件,装配钩子读偏好决定播什么——二者无共享可变字段。
- 墙钟锚点与引擎整秒互为真相/投影:引擎是结构权威(相位/锁定),锚点是毫秒权威(渲染/上报),偏差 >1.5s 时向引擎再锚定。

### 5.2 领域对象与业务字段(T1)

**聚合根:计时引擎状态(TimerEngineState)**(`src/timer/engine.js:36-52`)

| 字段 | 类型 | 说明 |
|------|------|------|
| stageId | string | 当前阶段 ID(模板阶段键) |
| stageMode | enum | single / double / free |
| durationSec | int | 当前阶段计划时长(秒) |
| graceSec | int | 当前阶段宽限(秒,可为 0) |
| advance | int\|null | 自动推进剩余秒;null=未臂动(臂动值固定 3) |
| freeAutoSwitch | bool | 自由辩论自动交接已武装(首次起表后置位) |
| tickRemainderMs | int | 子秒余量跨拍结转(0–999,防整秒取整漂移) |
| events | AlertEvent[] | 待消费事件队列(装配钩子消费后清空) |

**域内实体:方侧时钟(SideState,×3)**(`src/timer/engine.js:26-34`)

| 字段 | 类型 | 说明 |
|------|------|------|
| remaining | int | 剩余整秒 |
| running | bool | 是否运行中 |
| phase | enum | running / grace / locked(单侧相位机,见 §6.1) |
| graceLeft | int\|null | 宽限余量;非宽限相位为 null |
| blinkOverride | bool | 声音试听「预览 30 秒闪烁」置位 |

**域内实体:设备告警偏好(SoundPrefs,设备本地)**(`src/services/soundPrefs.js:16-33`)

| 字段 | 类型 | 说明 |
|------|------|------|
| {node}.sound | enum | warn30/timeUp/mustStop 各节点铃声:split/notify/timeup/chime |
| {node}.volume | int | 0–100 |
| tts.enabled | bool | TTS 总开关,默认 false |
| tts.{node} | bool | 四节点分开关,默认 true(node 含 handover) |

**值对象:引擎事件(AlertEvent)**(`src/timer/engine.js:70-85`)——`{type: 'sound'|'voice'|'overrun', node: 'warn30'|'timeUp'|'mustStop'|'handover', side?}`;不可变,批量产生、一次性消费。

**值对象:墙钟锚点(ClockAnchor)**(`src/timer/useDebateTimer.js:63-96`)——`{running, endAt, frozenMs}`;running 态存绝对到期时刻,暂停态存冻结毫秒;仅整体替换。

**值对象:阶段配置投影(StageProjection)**——APPLY_STAGE 落定的 `{stageId, stageMode, durationSec, graceSec}`,随阶段切换整体替换。

### 5.3 关键枚举字段汇总

| 枚举 | 取值 | 出处 |
|------|------|------|
| 计时模式 stageMode | single / double / free(模板侧 numeric 0/1/2) | `src/timer/engine.js:19`、`src/schema/TimerSetting.jsx` |
| 单侧相位 phase | running / grace / locked | `src/timer/engine.js:14-16` |
| 告警节点 node | warn30 / timeUp / mustStop / handover(handover 仅 TTS) | `src/services/soundPrefs.js:7,25` |
| 铃声方案 sound | split / notify / timeup / chime | `src/services/soundPrefs.js:9-14` |
| 引擎动作 action | APPLY_STAGE / START / STOP / TOGGLE / RESET / TICK / SET_ADVANCE / ADVANCE_TICK / ADOPT / SOUND_CHECK / PREP_ZERO / STOP_ALL / CONSUME_EVENTS | `src/timer/engine.js:246-402` |

## 第六部分:状态流转(T2)

### 6.1 单侧相位机(引擎核心)

```
running ──(remaining 减至 0 且 graceSec>0)──▶ grace ──(graceLeft 减至 0)──▶ locked
   │                                                            ▲
   └──(remaining 减至 0 且 graceSec=0)─────────────────────────┘
        铃:timeUp+语音(入宽限) / mustStop+超时计数(直接锁定或宽限耗尽)

locked ──(按播放)──▶ 不解锁,重响 mustStop(grace ──(按播放)──▶ 宽限窗口重开)
RESET ──▶ 回到 running 相位并回满时长
```

出处:`src/timer/engine.js:9-11`注释、`src/timer/engine.js:99-123`(handleTimeUp)、`src/timer/engine.js:225-244`(startTransition)。

### 6.2 自动推进子状态

```
[未臂动 advance=null] ──臂动条件全满足──▶ [倒计时 advance=3] ──每秒──▶ … ──advance=0──▶ 切下一阶段
        ▲                                        │
        └────────── 任意手动输入 / 臂动条件被破坏 ─┘
```

出处:`src/timer/useDebateTimer.js:466-482`、`src/timer/useDebateTimer.js:364-374`。

### 6.3 自由辩论交接

一方时间到或显式停止 → 若 freeAutoSwitch 已武装且对方可运行(剩余>0、running 相位、未在走) → 对方自动起表 + 语音「请X发言」;双方均 locked → 环节锁定。出处:`src/timer/engine.js:99-109,206-218`。

## 第七部分:业务规则(N3)

| # | 规则 | 出处 |
|---|------|------|
| BR-C01-01 | warn30 铃**只在运行中** remaining 恰为 30 时触发一次;不会在追拍中重复触发(每 beat 单次判定) | `src/timer/engine.js:138-140` |
| BR-C01-02 | 闪烁窗口 27–30 秒(闭区间),仅在 running+running 相位;blinkOverride 可强制 | `src/timer/engine.js:23-24,409-417` |
| BR-C01-03 | 单次追拍(节流页签回前台)最多补 300 拍(MAX_CATCHUP_BEATS),防时钟篡改/失控快进 | `src/timer/engine.js:125-127,189-192` |
| BR-C01-04 | 子秒余量跨拍结转(D36):interval 抖动不再累计成每分钟数百毫秒漂移 | `src/timer/engine.js:186-192` |
| BR-C01-05 | 锚点↔引擎偏差 >1500ms 向引擎再锚定(引擎为结构权威);引擎驱动的翻转(交接/零锁)即时同步锚点 | `src/timer/useDebateTimer.js:220-249` |
| BR-C01-06 | 心跳在工作线程以 250ms 节拍运行(D37,后台页签不被节流);Worker 不可用回退 setInterval;回可见时补拍仅当 elapsed>1500ms | `src/timer/tickWorker.js`、`src/timer/useDebateTimer.js:252-300` |
| BR-C01-07 | 用户意图时刻(START/STOP/TOGGLE)先写锚点再派发引擎动作,保证整秒视图与毫秒真相同源;显式时间变化(APPLY_STAGE/RESET/SOUND_CHECK/PREP_ZERO)同步重置锚点 | `src/timer/useDebateTimer.js:98-130`、`src/timer/clockAnchors.js:5-23` |
| BR-C01-08 | TTS 合并规则:同批 voice 事件拼接为一条播报,新播报必取消旧播报;铃声逐节点独立播放 | `src/timer/useDebateTimer.js:342-358`、`src/services/speech.js:184-185` |
| BR-C01-09 | 偏好净化:载入时未知节点/非法音量回默认,私密模式存储失败降级为仅内存 | `src/services/soundPrefs.js:37-87` |
| BR-C01-10 | 快捷键在跟随态整体禁用(BR-5);重置类快捷键仅在对应侧未运行时可生效(控制页拦截) | `src/timer/useTimerKeyboardShortcuts.js:16-17`、`src/TimerControlPage.jsx:164-187` |
| BR-C01-11 | SOUND_CHECK 只影响 single 侧且 30 秒试听置 blinkOverride,结束试听置 locked;铃声与语音同拍在主机发出 | `src/timer/engine.js:340-371` |
| BR-C01-12 | 跟随态下配置重复投递(SSE change/轮询)不得重置已采纳的阶段与时钟(跟随 bug 防回归);语言切换不重置捕获 | `src/timer/useDebateTimer.js:435-464` |
| BR-C01-13 | 超时计数计入实绩采集,其事件由引擎发出、装配钩子落账,引擎本身无副作用 | `src/timer/engine.js:83-85`、`src/timer/useDebateTimer.js:343-348` |

## 第八部分:非功能性要求(N1)

| # | 要求 | 现状依据 |
|---|------|---------|
| NFR-C01-01 | 计时精度:整秒事件不漂移(余量结转),渲染读数与上报毫秒同源(锚点层);主机与大屏数字同秒翻转 | `src/timer/engine.js:186-204`、`src/timer/useDebateTimer.js:63-96` |
| NFR-C01-02 | 后台韧性:页签后台心跳持续(Worker),回前台单拍追平真值 | `src/timer/tickWorker.js:1-6`、`src/timer/useDebateTimer.js:286-300` |
| NFR-C01-03 | 告警即时性:告警节点与秒界对齐触发;铃声预解码;TTS 首次手势解锁 | `src/timer/engine.js:130-145`、`src/services/soundPrefs.js:90-100` |
| NFR-C01-04 | 数据量级:单页单场,引擎纯内存 reducer,无持久化(采集镜像为 sessionStorage 会话级) | `src/timer/engine.js:1-12`、`src/timer/matchCapture.js:100` |
| NFR-C01-05 | 国际化:界面/语音文案三语(zh-Hans/en/fr-CA),语音引擎按语系回退 | `src/services/speech.js:12-23`、`src/locales/` |

## 第九部分:异常场景与降级(N2)

| # | 场景 | 处理 | 出处 |
|---|------|------|------|
| EX-C01-01 | Web Worker 不可用 | 回退 window.setInterval(250ms) | `src/timer/useDebateTimer.js:269-275` |
| EX-C01-02 | 页签后台被节流(窗口计时器 ~1/分钟) | Worker 心跳不受节流;visibilitychange 回可见补拍(>1.5s 才补) | `src/timer/tickWorker.js:1-6`、`src/timer/useDebateTimer.js:286-300` |
| EX-C01-03 | 页签长时间后台(小时级) | 单次追拍封顶 300 拍 | `src/timer/engine.js:125-127` |
| EX-C01-04 | Audio/TTS API 缺失或自动播放被拦 | 全量守卫静默吞错,功能降级不崩溃;TTS 未解锁有面板提示 | `src/services/soundPrefs.js:102-113`、`src/services/speech.js:169-190` |
| EX-C01-05 | 私密模式/存储配额 | 偏好与捕获镜像写失败仅内存保留 | `src/services/soundPrefs.js:81-87`、`src/timer/matchCapture.js:103-113` |
| EX-C01-06 | 锚点与引擎读数分歧 | >1.5s 以引擎为准再锚定 | `src/timer/useDebateTimer.js:240-247` |
| EX-C01-07 | 跟随态收到配置重投递 | 指纹去重+following 守卫,不重置运行时 | `src/timer/useDebateConfig.js:44-71`、`src/timer/useDebateTimer.js:435-448` |

## 第十部分:历史与留痕(N4)

- 超时次数(overrunAff/Neg)与逐阶段实际用时进入实绩采集,最终随 S-04 记录保存留痕(`src/timer/matchCapture.js:40-94`)。
- 引擎本身无操作审计日志:现场计时设备场景,过程以采集条目(enteredAt/exitedAt)留痕为准;刷新安全网提供会话级恢复(`timer.matchCapture.v1`)。

## 第十一部分:被引用关系(T1a)

| 被谁引用 | 引用什么 | 方式 |
|---------|---------|------|
| C-02 同步会话 | 引擎状态(经 buildSnapshot 编码为快照) + transitionKey 跃迁触发上报 | 发布语言(快照),`src/timer/snapshotCodec.js:54-79`、`src/timer/useTimerSessionSync.js:745-752` |
| C-02 遥控 | 引擎动作(action 派发)作为指令执行目标 | 命令模式,`src/timer/useTimerSessionSync.js:538-568` |
| S-04 记录保存 | 采集载荷 buildMatchPayload 产物 | 服务调用,`src/timer/useDebateTimer.js:379-403` |
| D4/呈现页 | liveSides/derived 派生只读视图 | 进程内钩子返回值,`src/timer/useDebateTimer.js:506-529` |

## 第十二部分:DDD 领域建模(D2-2)

### Step 0:PRD 范围判定

PRD 标注模块名 C-01 → **范围明确**,跳过 Step 1~3 战略设计,直接进入前置过滤与战术设计。本域边界补充说明:同一术语「计时」在 C-01 指**引擎状态与相位机**,在 C-02 指**快照镜像与指令转发**——二者概念已由模块边界分离(B1 通过,不另行拆域)。

### 本域信息(必输出)

| 项目 | 内容 |
|------|------|
| 本域名称 | C-01 比赛计时 |
| 领域分层 | 核心域(AA 2.1:有状态机与聚合根,深度建模) |
| 聚合根 | 计时引擎状态(TimerEngineState,一致性边界=三侧时钟+推进倒计时+事件队列) |

### 聚合根识别(A1-A4,对计时引擎状态)

| 测试 | 判定 | 依据 |
|------|------|------|
| A1 一致性边界 | ✓ | 三侧时钟与 advance 必须同拍一致(单 beat 内原子演进,`engine.js:130-173`) |
| A2 全局引用 | ✓ | C-02 快照、D4 渲染均以引擎状态为唯一事实源 |
| A3 生命周期入口 | ✓ | 侧时钟只能经聚合根动作(START/RESET/APPLY_STAGE…)修改,不可独立创建 |
| A4 规则驱动 | ✓ | 相位跃迁驱动告警、采集、推进、快照全部下游行为 |

**聚合根判定:4/4 → 聚合根。**(设备告警偏好 A1 不通过:各节点独立编辑无跨键不变量;A4 不通过:不驱动域行为 → 归域内实体,见下表备注。)

### 领域对象清单(业务域内)

| 对象名 | 分类 | 与上级关系 | 核心业务字段 | 关键枚举字段 | 备注 |
|--------|------|-----------|------------|------------|------|
| 计时引擎状态 TimerEngineState | 聚合根 | — | stageId, durationSec, graceSec, advance, freeAutoSwitch, tickRemainderMs | stageMode: single/double/free | 纯 reducer,事件外排保无副作用 |
| 方侧时钟 SideState | 域内实体(×3) | 聚合根内部,经动作修改 | remaining, running, graceLeft, blinkOverride | phase: running/grace/locked | 有身份(single/aff/neg 键),状态可变;外部必经聚合根 |
| 设备告警偏好 SoundPrefs | 域内实体(设备本地) | 服务于告警消费,与聚合根经事件解耦 | {node}.sound/volume, tts.enabled, tts.{node} | sound: split/notify/timeup/chime | 设备级持久化(localStorage),非会话级;A1/A4 不成立故不作第二聚合根 |
| 引擎事件 AlertEvent | 值对象 | 聚合根产生,消费后清空 | type, node, side | type: sound/voice/overrun;node: warn30/timeUp/mustStop/handover | 不可变,仅追加与整队清空 |
| 墙钟锚点 ClockAnchor | 值对象 | 聚合根旁路真相层 | running, endAt, frozenMs | — | 不可变整体替换;渲染/上报读数来源 |
| 阶段配置投影 StageProjection | 值对象 | APPLY_STAGE 落定 | stageId, durationSec, graceSec | stageMode | 模板只读投影,随切换整体替换 |

### 子流程 I/O 契约

| 子流程 | 触发条件 | 输入(来自父聚合根) | 输出(写入父聚合根) | 输出写入哪个对象 |
|--------|---------|------------------|------------------|---------------|
| 实绩自动采集(S-04-01,代码 `matchCapture.js`) | APPLY_STAGE 开新阶段;overrun 事件 | 阶段配置投影、sidesNow(remaining/graceLeft/locked)、超时侧 | 无(单向流出) | 采集文档 capture{startedAt, entries[]}(ref 持有),最终经 S-04 保存接口持久化;引擎不回读 |
| 自动推进臂动/倒计时 | 臂动条件全满足(§4.5) | isStageFullyEnded/anyInGrace 选择器、stageAutoAdvance 投影 | advance 字段(3→0→切阶段) | 聚合根自身(非独立聚合,随根演进) |

> 注:「自动推进」虽列子流程视角,其状态(advance)在聚合根内,不构成独立一致性边界;「实绩采集」有独立载体(sessionStorage 镜像)与服务目标(S-04),按子流程 I/O 契约登记。

### 关联领域对象(只列边界说明,不展开内部模型)

| 关联领域对象 | 所属业务域 | 当前域关联字段 | 当前域需获取的信息 | 触发关系 | 映射模式 |
|------------|-----------|--------------|------------------|---------|---------|
| 赛制配置(模板) | S-02 赛制模板管理(支撑域) | config.name(标识) | stages/modes/stageOrder/stageLabels/stageGrace/stageAutoAdvance/teamNames/shareEnabled/shareToken 只读投影 | 加载与 SSE 重投递时消费;APPLY_STAGE 落定投影 | ACL(useDebateConfig 把服务端 doc 翻译为运行时投影,`useDebateConfig.js:66-90`)+ OHS(REST/SSE) |
| 同步会话 | C-02 大屏同步与远程控制(核心域) | shareToken/sessionId(标识) | 上报回执(accepted/seq/serverTime)、指令帧 | 状态跃迁上报;接收 command 执行为引擎动作 | OHS+PL(快照=发布语言,命令=命令消息);核心域平级协作 |
| 比赛记录 | S-04 比赛记录与复盘(支撑域) | —(不存其 ID) | 保存回执(成功/失败提示) | 手动保存/会话结束自动保存时提交载荷 | ACL(buildMatchPayload 把采集文档翻译为 S-04 载荷,`matchCapture.js:81-94`)+ OHS |

> 关联域内部模型、接口细节与状态流转在各域自己的 PRD/API 文档中定义,此处不展开。

### 过程数据分类表

| 数据项 | 类别 | 处理方式 |
|--------|------|---------|
| liveSides(渲染侧读数投影) | P2 展示数据 | 每帧由锚点+引擎派生,不持久化 |
| derived(mode/isDual/isFree/activeSide/freeLocked/blinking) | P2 展示数据 | 选择器派生(`engine.js:404-456`) |
| transitionKey(上报跃迁指纹) | P7 计算中间值 | 字符串拼接,仅作上报触发键 |
| 引擎 events 队列内容(在途事件) | P7 计算中间值 | 随聚合根状态走但消费即清,无独立持久化语义 |
| 快照 wire 载荷(buildSnapshot 产物) | P5 集成载荷 | C-02 发布语言,归 C-02 PRD 展开 |
| 键盘/按钮输入事件 | P3 UI 交互状态 | 转译为引擎动作后即弃 |
| 到站播报条(stageAnnounce) | P3 UI 交互状态 | 3 秒自动消隐 |

### 跨业务域集成(Step 9)

| 集成边 | 模式 | 说明 |
|--------|------|------|
| C-01 → C-02(核心↔核心) | OHS+PL | 快照为发布语言,C-01 不感知订阅方数量与通道 |
| C-01 ↔ S-02(核心←支撑) | ACL | 服务端模板 doc 经 useDebateConfig 翻译为运行时投影,模板字段语义不渗入引擎 |
| C-01 → S-04(核心→支撑) | ACL+OHS | 采集文档翻译为记录载荷后经服务接口提交 |

## 第十三部分:逆向归档代码对照

| 需求块 | 主要实现文件 |
|--------|------------|
| 引擎(相位机/模式/宽限/交接/推进/事件) | `src/timer/engine.js` |
| 运行时装配(心跳/锚点/告警消费/采集/推进/同步装配) | `src/timer/useDebateTimer.js` |
| 会话/遥控装配(被 C-02 引用) | `src/timer/useTimerSessionSync.js` |
| 快捷键 | `src/timer/useTimerKeyboardShortcuts.js` |
| 锚点重置规则 | `src/timer/clockAnchors.js` |
| 心跳 Worker | `src/timer/tickWorker.js` |
| 实绩采集 | `src/timer/matchCapture.js` |
| 告警偏好 | `src/services/soundPrefs.js` |
| TTS | `src/services/speech.js` |
| 设置面板 | `src/components/SoundSettingsPanel.jsx` |
| 控制台/大屏页 | `src/TimerControlPage.jsx`、`src/TimerDisplayPage.jsx` |
| 单测 | `src/timer/engine.test.js`、`src/timer/clockAnchors.test.js`、`src/timer/matchCapture.test.js`、`src/services/soundPrefs.test.js`、`src/services/speech.test.js` 等 |

## 附录 A:历史编码对照

代码注释中存在比 AA/FL 更细的历史编号,归档时保留对照,不作为模块编码依据:

| 历史编码 | 含义 | 出处 |
|---------|------|------|
| C-01-07 | 自动推进(硬ening 注释) | `src/timer/useDebateTimer.js:466` |
| C-01-08 | 竖屏遥控布局 / 遥控器页 | `src/TimerControlPage.jsx:79,104` |
| D36/D37/D38 | 余量结转 / Worker 心跳 / 墙钟真相层(PageSpec §20) | `src/timer/engine.js:186`、`src/timer/useDebateTimer.js:63,264` |

## 附录 B:术语表

| 术语 | 定义 | 备注 |
|------|------|------|
| 相位(phase) | 单侧时钟生命周期:running→grace→locked | 引擎常量 `engine.js:14-16` |
| 宽限(grace) | 时间到后允许的收尾倒计时;耗尽即锁定 | 两段铃声语义:timeUp/mustStop |
| 交接(handover) | 自由辩论中一方停表后对方自动起表 | 语音节点 handover |
| 锚点(anchor) | 墙钟毫秒真相层 {running,endAt,frozenMs} | 渲染与上报读数来源 |
| 追拍(catch-up) | 一次 TICK 派发补足真实流逝秒数,封顶 300 拍 | 防后台节流漂移 |
| 告警节点(node) | warn30/timeUp/mustStop(+handover 仅语音) | 偏好按节点配置 |

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.0 | 2026-11-11 | 逆向归档初始版:按现有实现归纳五子模块 FR、状态流转、业务规则与 DDD 战术建模(聚合根=计时引擎状态),完备性检查通过 |

---

## 附:PRD 完备性检查报告(D2-1)— 通过

```
功能类型:业务流程(计时状态机)
检查项:12/12 通过(G1~G5 + T1/T1a/T2);6 项不适用(T3 审批、T4 查询筛选、
        T5 导出、T6 对接系统、T7 数据映射、T9 工具规格——分别属审批缺席场景、
        S-04 查询导出、C-02 集成对接与 D3 接口设计);加分项 N1~N4 全覆盖
```

| 维度 | 结论 | 位置 |
|------|------|------|
| G1 业务目标 | ✓ §2.1 | 4 目标 |
| G2 功能范围 | ✓ §3(含 5 条不做什么) | |
| G3 角色定义 | ✓ §2.2 | 3 角色 |
| G4 领域对象 | ✓ §5.2 | 6 对象 |
| G5 对象关系 | ✓ §5.1 | 关系图 |
| T1 业务字段 | ✓ §5.2 字段表 | |
| T1a 被引用关系 | ✓ §11 | |
| T2 状态流转 | ✓ §6(相位机/推进/交接) | |
| N1~N4 | ✓ §8~§10 | |

本次变更影响范围:初始归档,无历史版本,不影响既有领域模型/接口/状态流转。可进入 API 设计阶段(D3)。
