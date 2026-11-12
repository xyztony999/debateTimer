# 枚举池（enum-pool）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 生成方式 | 逆向归档：以现有代码常量为准逐一核对（系统已上线） |

## 1. 文档定位

| 定位 | 说明 |
|------|------|
| 本文档做什么 | 汇总系统全部业务枚举与常量池（取值、语义、来源文件），作为 D3 各 API 设计文档「3.4 公共规范 / 4.4 枚举定义」的唯一引用来源（design 分册 d3-api.md 机械自检项 M3：本章引用的枚举 code 均在枚举池中有定义且无重复） |
| 本文档不做什么 | 不定义新枚举、不修改现有取值；只如实登记代码中已存在的枚举 |
| 上游依据 | workspace/00-architecture/ 三文档 v1.0（模块编码 C/S/D/P 以 AA 为准）；取值以代码常量为唯一事实源 |

**核对方法**：每个枚举条目均由本阶段直接读取源文件核对（来源列给出 `文件:行号`）；未在代码中找到的取值一律不登记。

## 2. 编码规约

1. **wire 值为准**：枚举值登记的是线上传输字符串（如 `single`/`double`/`free`），UI 显示文案走 i18n（见 select-pool.md），两者不混用。
2. **服务端权威**：凡服务端有校验白名单（`new Set([...])`），以服务端集合为准；客户端常量与之不符时在条目内注明差异。
3. **单一登记**：同一枚举在池内只登记一次、编号唯一；跨模块复用关系在 common-enums.md 中给消费矩阵，不在本册重复展开。
4. **扩展规则**：新增枚举必须先入池再引用；图标类 id 追加不复用（`src/config/pidIcons.js:5` 注释约定 ids append-only）。

## 3. 枚举池清单

> 编号规则 `EP-<域>-<序号>`。域：IDENT 身份准入 / TIMER 计时引擎 / SESSION 会话同步 / CONFIG 模板配置 / PROTECT 限流配额 / I18N 多语言。

### 3.1 身份与准入（EP-IDENT）

#### EP-IDENT-01 用户角色 `role`

| 取值 | 含义 | 来源 |
|------|------|------|
| `admin` | 管理员：跨 owner 访问、用户治理、注册开关、广场下架 | 注册赋值 `server/routes/auth.js:93`（首个注册用户即为 admin）；鉴权判断 `server/lib/authMiddleware.js:52`、`server/lib/authPolicy.js:26,36` |
| `user` | 注册用户（普通用户） | 注册赋值 `server/routes/auth.js:93`（非首用户） |

- 落库字段 `users.role`（`server/routes/admin.js:105` 按 `role:'admin'` 统计最后管理员守卫）；对外输出经 `publicUser()` 白名单 `server/lib/authPolicy.js:42-51`（仅 id/username/role）。
- 角色不可自选：注册时由系统按「是否首个用户」判定（`server/routes/auth.js:88-93`）；降级守卫「不能降级/禁用/删除最后一个管理员」见 `server/routes/admin.js:172-181,229`。

#### EP-IDENT-02 注册准入状态 `registrationOpen`

| 取值 | 含义 | 来源 |
|------|------|------|
| `true` | 开放公开注册 | 优先级判定 `server/lib/authPolicy.js:11-23`（isRegistrationOpen） |
| `false` | 关闭注册，注册页提示联系管理员 | 同上 |

- 解析优先级：首个用户短路 `true`（`authPolicy.js:14-16`）＞管理侧 app_settings 单文档（`_id='registration'`，`server/lib/authPolicy.js:4`；写入 `server/routes/admin.js:76-79`，`registrationOpen` 必须布尔）＞环境变量 `ALLOW_REGISTRATION` 回落（`parseAllowRegistration` 仅认 `'true'/'1'`，`server/lib/authPolicy.js:6-9`；读取 `server/routes/auth.js:50`、`server/routes/admin.js:46,94`）。
- 布尔语义枚举，非多值字符串；`GET /api/auth/status` 向匿名暴露当前开态（`server/routes/auth.js:56`）。

#### EP-IDENT-03 用户禁用态 `disabled`

| 取值 | 含义 | 来源 |
|------|------|------|
| `true` | 已禁用：不能登录 | 管理侧补丁 `server/routes/admin.js:167-176`；列表输出 `server/routes/admin.js:24` |
| `false`（缺省） | 正常 | 新建管理员默认 `server/routes/admin.js:143` |

- 守卫：不能禁用自己（`admin.js:168-170`）、不能禁用最后一个管理员（`admin.js:172-174`）；禁用/改密即吊销全部会话（`admin.js:202`）。

#### EP-IDENT-04 注册开关生效来源 `source`

| 取值 | 含义 | 来源 |
|------|------|------|
| `env` | app_settings 从未写过 registration 文档，当前值回落环境变量 ALLOW_REGISTRATION | 判定 `server/lib/authPolicy.js:11-23`（三参优先级）；读取 `server/routes/admin.js:49,58` |
| `admin` | 管理员已写入设置，DB 值胜出 | 写入 `server/routes/admin.js:71-86`；文档 `_id:'registration'`（`authPolicy.js:4`） |

- 消费：D-02 GET /settings/registration 的 `source` 字段、S-01 管理台来源展示；纯派生视图（由文档存在性推导），不落库。

### 3.2 计时引擎（EP-TIMER）

#### EP-TIMER-01 阶段计时模式 `stageMode`（STAGE_MODES）

| 取值 | 含义 | 来源 |
|------|------|------|
| `single` | 单计时：一面时钟，双侧镜像 | 服务端白名单 `server/lib/timerSessions.js:3`；`server/lib/matchLogs.js:1` |
| `double` | 双计时：正反方各自计时 | 同上 |
| `free` | 自由辩论：共用总时长，一方停止自动交棒 | 同上 |

- 配置存储兼容表 `TIMER_SETTING_VALUES`：`single/double/free` 之外接受遗留数字 `0→single`、`1→double`（**数字 `2` 服务端不接受**，`free` 必须传字符串）——`server/lib/configDocs.js:22-29`（normalizeTimerSettings）。
- 客户端 UI 数值枚举 `TimerSetting`：`single:0 / double:1 / free:2`（`src/schema/TimerSetting.jsx:1-5`）；内存数值→wire 映射 `MODE_STRING` 含 `2:'free'`（`src/timer/engine.js:19`）。
- 归一化缺省：快照/会话中非法值回落 `double`（`server/lib/timerSessions.js:50-52`）；记录导出聚合按三值计数 `server/routes/gallery.js:8-19`。

#### EP-TIMER-02 侧时钟阶段 `phase`（TIMER_PHASES，计时状态机）

| 取值 | 含义 | 来源 |
|------|------|------|
| `running` | 计时中 | 服务端白名单 `server/lib/timerSessions.js:5`；客户端常量 `PHASE_RUNNING` `src/timer/engine.js:14` |
| `grace` | 超时宽限：收尾倒计时中 | `server/lib/timerSessions.js:5`；`PHASE_GRACE` `src/timer/engine.js:15` |
| `locked` | 锁定：时间（含宽限）耗尽 | `server/lib/timerSessions.js:5`；`PHASE_LOCKED` `src/timer/engine.js:16` |

- **状态机**（`src/timer/engine.js:9-11` 文件头注释 + `handleTimeUp` `engine.js:99-123`）：`running →（时间到且宽限>0）→ grace →（宽限耗尽）→ locked`；`running →（时间到且无宽限）→ locked`。锁定态再按「启动」重响必须停铃不复活（`startTransition` `engine.js:225-244`）；宽限态再按「启动」重启宽限窗口。
- **wire 不变式**：`grace ⇔ graceMs>0`，`running/locked` 必须无剩余宽限（`server/lib/timerSessions.js:348-360` readPhase）；快照缺相位时显示端按剩余秒≤0 推导 `locked` 兼容 pre-v2（`src/timer/snapshotCodec.js:86-101`）。
- 双方独立携带（`phaseAff`/`phaseNeg`）；single 模式服务端强制 neg 镜像 aff（`server/lib/timerSessions.js:379-385`）。

#### EP-TIMER-03 发言方 `activeSide`（ACTIVE_SIDES）

| 取值 | 含义 | 来源 |
|------|------|------|
| `aff` | 正方持麦（仅 free 模式） | 服务端白名单 `server/lib/timerSessions.js:4`；free 校验 `server/lib/timerSessions.js:387-389` |
| `neg` | 反方持麦（仅 free 模式） | 同上 |
| `none` | 无持麦（single/double 恒为 none） | single/double 强制归一 `server/lib/timerSessions.js:379-386`；选择器 `src/timer/engine.js:425-433` |

#### EP-TIMER-04 引擎侧键 `side`（SIDES）

| 取值 | 含义 | 来源 |
|------|------|------|
| `single` | 单计时时钟（引擎内部三槽之一） | `src/timer/engine.js:21`（SIDES） |
| `aff` | 正方时钟 | 同上 |
| `neg` | 反方时钟 | 同上 |

- 遥控指令侧白名单 `COMMAND_SIDES` = `single/aff/neg`（`server/lib/timerSessions.js:16`）。
- 记录/队名只认对阵两侧 `aff/neg`：`server/lib/configDocs.js:90`（normalizeTeamNames）、`server/lib/matchLogs.js:60`（teamNames）、超时计数键 `overrunAff`/`overrunNeg`（事件大写映射 `src/timer/engine.js:83-85`；累计 `src/timer/matchCapture.js:71-85`；校验 `server/lib/matchLogs.js:101-102`）。

#### EP-TIMER-05 引擎事件类型 `events[].type`

| 取值 | 载荷 | 含义 | 来源 |
|------|------|------|------|
| `sound` | `{ node }` | 铃声节点触发 | 事件工厂 `src/timer/engine.js:70-72` |
| `voice` | `{ node, side? }` | TTS 播报（side 指明报哪一队） | `src/timer/engine.js:74-80` |
| `overrun` | `{ side: 'Aff'\|'Neg' }` | 超时（必须停）计数 +1（大写对齐采集键） | `src/timer/engine.js:82-85` |

- 事件由 reducer 产出、组装钩子消费后清空（`CONSUME_EVENTS` `src/timer/engine.js:396-397`）；节点取值见 EP-TIMER-06。

#### EP-TIMER-06 告警节点 `node`（ALERT_NODES / SOUND_CHECK_KINDS）

| 取值 | 含义 | 来源 |
|------|------|------|
| `warn30` | 30 秒提醒（剩余 30s 触发，闪烁窗口 27–30s） | 客户端 `ALERT_NODES` `src/services/soundPrefs.js:7`；触发点 `src/timer/engine.js:138-140`；闪烁窗口常量 `BLINK_WINDOW_HIGH=30/LOW=27` `src/timer/engine.js:23-24,409-417` |
| `timeUp` | 时间到（进入宽限时响） | `src/services/soundPrefs.js:7`；触发 `src/timer/engine.js:114` |
| `mustStop` | 必须停（无宽限直接锁定，或宽限耗尽） | `src/services/soundPrefs.js:7`；触发 `src/timer/engine.js:117,160-165,228` |
| `handover` | （仅 TTS）自由辩论交棒播报 | `TTS_NODES` `src/services/soundPrefs.js:25`；触发 `src/timer/engine.js:120,214` |

- wire 侧试音种类 `SOUND_CHECK_KINDS` 只保留两档：`warn30` / `end`（`end` 在引擎展开为 mustStop 语义）——`server/lib/timerSessions.js:15`；本地试音分支 `src/timer/engine.js:340-371`（SOUND_CHECK kind）。
- 铃声/音量按节点为本设备偏好（select-pool.md SP-01/SP-02），偏好不随会话同步。

#### EP-TIMER-07 自动推进秒数 `advance`

| 常量 | 值 | 含义 | 来源 |
|------|-----|------|------|
| 自动推进倒计时 | `3` 秒 | 阶段彻底结束（双侧/单侧 locked）后武装倒计时，归零推进下一阶段；任意手动输入取消 | 武装条件 `src/timer/useDebateTimer.js:469-480`（`SET_ADVANCE value:3` 于 `:478`）；递减/归零推进 `src/timer/engine.js:317-324`（`useDebateTimer.js:368-374`）；「彻底结束」选择器 `src/timer/engine.js:445-451` |

- 武装前置条件（`src/timer/useDebateTimer.js:471-475`）：非跟随端（`!following`）＋非末阶段（`!isLast`）＋无侧在宽限（`!anyInGrace`）＋阶段彻底结束（`isStageFullyEnded`）＋该阶段模板开关 `stageAutoAdvance[stageId]` 为真（逐阶段布尔旗标，服务端校验 `server/lib/configDocs.js:198-202`）。

### 3.3 会话与同步（EP-SESSION）

#### EP-SESSION-01 会话角色（host / remote / display）

| 取值 | 含义 | 来源 |
|------|------|------|
| `host` | 计时主机：开启会话、上报快照、接收遥控指令；P2P 应答方 | 角色记忆 `timer.session.selfHost` `src/timer/useTimerSessionSync.js:11-13`；signal 目标白名单 `'host'` `server/lib/timerSessions.js:280`；owner 流接收 `sse.sendToOwner` `server/lib/timerSessions.js:267-268` |
| `remote` | 瘦遥控器：配对接入（4 位码）、发指令；P2P 发起方 | 角色记忆 `timer.session.lastRemote` `src/timer/useTimerSessionSync.js:16-18`；配对路由 `server/routes/pairing.js:11-27`；DataChannel 名 `'remote'` `src/timer/rtcChannel.js:30` |
| `display` | 大屏：只读跟随，`/api/display/:token/stream` 订阅 | `server/routes/display.js:19-44`；客户端 `isDisplay` 分支 `src/timer/useTimerSessionSync.js:574,775` |

- host/remote 为同一 owner 内的授权角色（配对码 owner-scoped `server/lib/timerSessions.js:299-313`）；display 仅凭 shareToken 匿名可见（`isShareVisible` `server/lib/configDocs.js:284-286`）。

#### EP-SESSION-02 快照通道 SSE 事件名 `event`

| 取值 | 通道 | 含义 | 来源 |
|------|------|------|------|
| `state` | display 流（token 作用域） | 计时快照（含回放：连入即重放当前快照） | 发送 `server/lib/timerSessions.js:88`；重放 `server/routes/display.js:35-39` |
| `session` | display 流 | 会话生命周期（type/reason，见 EP-SESSION-03/04） | `server/lib/timerSessions.js:80-85` |
| `command` | display 流 + owner 流 | 遥控指令帧 | `server/lib/timerSessions.js:267-268` |
| `signal` | display 流 + owner 流 | WebRTC 信令中继帧（不解释载荷） | `server/lib/timerSessions.js:293-294` |
| `change` | owner 流（admin 广播全部） | 模板/用户/公开性变更通知 | 广播实现 `server/lib/sseHub.js:17-34`（帧名固定 `event: change`）；调用点 `server/routes/configurations.js:117,147,203,209,362`、`server/routes/admin.js:236,275` |

#### EP-SESSION-03 会话生命周期 `session.type`

| 取值 | 含义 | 来源 |
|------|------|------|
| `started` | 会话开启 | `server/lib/timerSessions.js:155`（emitSession） |
| `ended` | 会话结束（主动关闭/被顶替/共享关闭） | `server/lib/timerSessions.js:124,222`；客户端处理 `src/timer/useTimerSessionSync.js:832` |
| `expired` | 心跳超时惰性过期 | `server/lib/timerSessions.js:105-107`（lazy expiry，无定时器） |

#### EP-SESSION-04 会话结束原因 `session.reason`

| 取值 | 含义 | 来源 |
|------|------|------|
| `superseded` | 同 token 新会话顶替旧会话 | `server/lib/timerSessions.js:124` |
| `heartbeat_timeout` | 超过心跳窗口（默认 30s）未见上报 | `server/lib/timerSessions.js:105-106`（`heartbeatTimeoutMs=30000` `:75`） |
| `closed_by_operator` | 操作员主动结束（DELETE 会话的缺省原因） | `server/lib/timerSessions.js:217`；触发 `server/routes/configurations.js:337` |
| `share_disabled` | 关闭共享开关连带结束会话 | `server/routes/configurations.js:219` |

#### EP-SESSION-05 会话冲突码 `error.code`

| 取值 | 含义 | 来源 |
|------|------|------|
| `session_taken` | 上报携带的 sessionId 与现存会话不一致（另一控制端已占位）→ HTTP 409，客户端让位 | 主权检查 D29 `server/lib/timerSessions.js:166-178` |

#### EP-SESSION-06 遥控指令类型 `command.type`（COMMAND_TYPES）

| 取值 | 附加字段 | 含义 | 来源 |
|------|---------|------|------|
| `start` | `side` | 启动指定侧 | 白名单 `server/lib/timerSessions.js:14`；侧校验 `:250-256` |
| `stop` | `side` | 停止指定侧 | 同上 |
| `reset` | `side` | 重置指定侧 | 同上 |
| `toggle` | `side` | 一键启停（遥控布局单键换手） | 同上（注释 `:9-13`） |
| `applyStage` | `stageId` | 切换到会话模板内的阶段 | `server/lib/timerSessions.js:239-244`（stageId 必须在会话阶段集内） |
| `soundCheck` | `kind`（EP-TIMER-06 wire 两档） | 铃声试音在主机（会场音箱）播放 | `server/lib/timerSessions.js:245-249` |

- 指令帧附加 `commandSeq`（会话内单调递增）与 `at`（epoch ms）：`server/lib/timerSessions.js:262-264`；指令为即时转发 + 离线缓冲（`pendingCommands`，主机上报即视为消费 `:212`）。

#### EP-SESSION-07 信令目标 `signal.to` / 帧方向 `from`

| 取值 | 含义 | 来源 |
|------|------|------|
| `host` | 发往主机（from 自动取 `remote`） | `server/lib/timerSessions.js:280-292`（relaySignal） |
| `remote` | 发往遥控端（from 自动取 `host`） | 同上 |

- 信令帧 kind（客户端载荷约定，服务端不解释）：`offer` / `answer` / `ice`——`src/timer/rtcChannel.js:98,181,64,175`。

#### EP-SESSION-08 控制端会话状态 `sessionState`（客户端 UI 状态机）

| 取值 | 含义 | 来源 |
|------|------|------|
| `idle` | 未开启/已结束 | `src/timer/useTimerSessionSync.js:43`；回落点 `:275,286,309,322,387,415` |
| `starting` | 开启中（对话框期间） | `:43`；守卫 `:366` |
| `active` | 会话活跃（上报/遥控中） | `:246,342,405,648,685` |
| `weak` | 弱信号（仍可上报，告警横幅态） | `:268,353,574,755` |

#### EP-SESSION-09 大屏横幅 `displayBanner`

| 取值 | 含义 | 来源 |
|------|------|------|
| `null` | 无横幅 | `src/timer/useTimerSessionSync.js:47,859` |
| `following` | 正常跟随 | `:47,815,821,829` |
| `weak` | 弱信号：跟随中 5s 未收到快照 | 判定 `:773-785`（>5000ms）；置位 `:781` |
| `ended` | 会话结束（回退独立计时页提示） | `:849,875` |

#### EP-SESSION-10 快照 wire 字段（snapshot schema，v2）

| 字段 | 类型/取值 | 约束 | 来源 |
|------|----------|------|------|
| `seq` | 整数 | 必须大于会话内上一 seq（单调去重） | `server/lib/timerSessions.js:329-332` |
| `stageId` | 字符串 | 必须在会话模板阶段集内 | `:333-336` |
| `stageMode` | EP-TIMER-01 | 三值白名单 | `:337-340` |
| `remainingAffMs` / `remainingNegMs` | 整数 ms | 0 ≤ x ≤ 24h（`MAX_REMAINING_MS`） | `:341-347`，上限 `:6` |
| `runningAff` / `runningNeg` | 布尔 | 仅 `=== true` 视为真 | `:370-371` |
| `activeSide` | EP-TIMER-03 | free 必填白名单 | `:372,387-389` |
| `phaseAff` / `phaseNeg` | EP-TIMER-02 | 缺省 `running`；grace⇔graceMs>0 | `:348-360` |
| `graceAffMs` / `graceNegMs` | 整数 ms | 0 ≤ x ≤ 300s（`MAX_GRACE_MS`） | `:361-367`，上限 `:7` |
| `serverTime` | epoch ms | 每次下发重打（回放不陈旧） | `:28-39`（toSnapshot D20） |
| `sessionId` | 12 字节 hex | 随下发携带，供代际检测与去重重置（D23） | `:33-39`；会话 id 生成 `:140` |
| `captureServerAt` | epoch ms | 上报可选：主机估计的服务器时钟戳，服务端按上行链路修正（钳 ≤2s，D32） | `:180-207` |

- 显示端在途补偿上限 `MAX_IN_FLIGHT_MS=3000`（`src/timer/snapshotCodec.js:11-14`）；引擎追赶单次上限 `MAX_CATCHUP_BEATS=300`（`src/timer/engine.js:125-127`）。
- 上报心跳节拍 1s（D22）：`src/timer/useTimerSessionSync.js:753-761`；single 模式服务端强制双侧镜像（`server/lib/timerSessions.js:379-385`）。

#### EP-SESSION-11 配对码 `pairingCode`

| 约束 | 值 | 来源 |
|------|-----|------|
| 格式 | 4 位数字 `/^\d{4}$/`（1000–9999，会话内查重） | 生成 `server/lib/timerSessions.js:114-116,131-138`；校验 `:299-303` |
| 作用域 | owner 本人活跃会话内匹配，随会话生灭 | `:299-313`；配对路由 `server/routes/pairing.js:8-27` |

#### EP-SESSION-12 直连状态 `rtcState`

| 取值 | 含义 | 来源 |
|------|------|------|
| `off` | 遥控未启用直连（仅中转） | `src/timer/rtcChannel.js:106-123`；消费 `src/timer/useTimerSessionSync.js:85` |
| `connecting` | P2P 握手中（3s 超时输出 closed 回退中转） | `rtcChannel.js:198-214` |
| `open` | DataChannel 已开，指令走直连；顶栏 Chip「遥控中 · 直连」 | `useTimerSessionSync.js:484-489`；消费 `src/TimerControlPage.jsx:375-381` |

#### EP-SESSION-13 快照上报失败处置 `reportFailure`

| 取值 | 含义 | 来源 |
|------|------|------|
| `yield` | 冲突让位（409 session_taken）→ 终态「另一设备正在控制」 | `src/timer/snapshotReporting.js:27-42` |
| `end` | 终态错误（403/404）→ 停止上报，不恢复不存半场记录 | 同上 |
| `recover` | 可恢复错误（400 无活跃会话）→ 退避 5s×2ⁿ≤30s 重建会话后补报 | 同上；`useTimerSessionSync.js:296-357` |
| `ignore` | 恢复等待期内的上报直接丢弃（互斥窗） | 同上 |
| `retry` | 网络/5s 类瞬时错误 → 按退避重试同一快照 | 同上 |

- 消费：C-02 客户端会话自愈状态机（`useTimerSessionSync.js`）；服务端无此枚举（纯客户端分类）。

### 3.4 模板与配置（EP-CONFIG）

#### EP-CONFIG-01 预置阶段 id（PRESET_STAGE_IDS）

16 个稳定阶段 id（`sound_check`、`aff_c1`、`neg_x_aff_c1`、`neg_c1`、`aff_x_neg_c1`、`aff_rebuttal_2`、`neg_rebuttal_2`、`crossfire_2v2`、`aff_poii`、`neg_poii`、`aff_poii_sum`、`neg_poii_sum`、`tactical_pause`、`free_debate`、`neg_closing`、`aff_closing`）——集合 `src/config/stageRegistry.js:41`；缺省顺序 `DEFAULT_STAGE_ORDER` `:22-39`；旧中文键→稳定 id 映射 `LEGACY_STAGE_KEY_MAP` `:2-19`。阶段图标语义映射 `src/components/StageIcon.jsx:15-32`。

#### EP-CONFIG-02 PID 站点类型 `station`（PID_STATION_TYPES）

| 取值 | 含义 | 来源 |
|------|------|------|
| `auto` | 自动（哨兵值：客户端不落库该值，`''/null/'auto'` 均视为未设置） | 白名单 `server/lib/configDocs.js:17`；哨兵剥离 `configDocs.js:164` |
| `interchange` | 换乘站（多发言人交接节点） | `server/lib/configDocs.js:17`；错误提示 `:166` |
| `normal` | 普通站 | 同上 |

#### EP-CONFIG-03 PID 图标 id 格式（icon / marker）

- 约束：字符串匹配 `/^[a-z0-9_]{1,32}$/`，哨兵 `auto` 允许（服务端格式校验，不校验注册表存在性）——`server/lib/configDocs.js:16,116,157`；客户端注册表 18 个 id `src/config/pidIcons.js:27-48`（追加不复用，`pidIcons.js:5-6`）。
- 模板级 marker 子集（8 个）见 select-pool.md SP-06。

#### EP-CONFIG-04 线路颜色 `lineColor`（PID_LINE_COLORS）

7 色白名单：`#1e3a5f` `#c62828` `#2e7d32` `#ef6c00` `#6a1b9a` `#00695c` `#455a64`——服务端 `server/lib/configDocs.js:18-20`（不在白名单即 400）；客户端同源调色板与缺省色 `#1e3a5f` `src/config/pidIcons.js:62-66`。

#### EP-CONFIG-05 配置 schema 版本 `schemaVersion`

| 值 | 含义 | 来源 |
|----|------|------|
| `2` | 当前客户端写入值（SCHEMA_VERSION） | `src/services/configurationShared.js:14` |
| （注释沿革）v3 | 追加可选字段 stageGrace/stageAutoAdvance/teamNames | `src/services/configurationShared.js:19-22` |
| （注释沿革）v4 | 追加 PID 呈现（stagePid/pidOptions） | `server/lib/configDocs.js:14` |

- 服务端不做版本枚举校验，字段按 `CONFIG_FIELDS` 白名单透传（`server/lib/configDocs.js:1-12,179-218`）。

#### EP-CONFIG-06 广场排序 `sort`

| 取值 | 含义 | 来源 |
|------|------|------|
| `updated` | 最近更新（缺省） | 排序白名单 `server/routes/gallery.js:62-66`（用户输入永不直通 Mongo sort） |
| `copies` | 复制数降序（次级 updatedAt） | 同上 |

#### EP-CONFIG-07 模板公开/共享开关

| 字段 | 取值 | 含义 | 来源 |
|------|------|------|------|
| `isPublic` | 布尔（POST body `public`） | 上架/下架广场（无独立状态枚举，未发布与不存在同为 404） | `server/routes/configurations.js:352-353`；查询 `server/routes/gallery.js:53-54,95-99` |
| `shareEnabled` | 布尔 | 大屏共享开关；关闭连带结束会话（reason `share_disabled`） | `server/routes/configurations.js:179-226` |
| `shareToken` | 18 字节 base64url 随机串 | 大屏链接凭证，唯一索引 | 生成 `server/lib/shareToken.js:3-5`；索引 `server/index.js:108-111` |
| `creditName` | 可选字符串 | 匿名发布时自愿署名（唯一归属展示） | `server/routes/gallery.js:32`、`server/lib/configDocs.js:237` |

#### EP-CONFIG-08 广场可见性 `visibilityState`

| 取值 | 含义 | 来源 |
|------|------|------|
| `unpublished` | 未上架广场（isPublic=false 或字段不存在） | 派生自 `server/lib/configDocs.js:254-266`；查询过滤 `server/routes/gallery.js:53-54,95-99` |
| `published` | 已上架广场可见 | 上架 `server/routes/configurations.js:352-353` |

- 消费：S-03 广场投影视角；存储为 `isPublic` 布尔（EP-CONFIG-07），此枚举为投影侧派生视图，非独立存储字段。

### 3.5 限流与配额（EP-PROTECT）

#### EP-PROTECT-01 限流窗口与阈值（内存滑动窗口，per-IP）

| 限流器 | 窗口（默认） | 阈值（默认） | 环境变量覆盖 | 挂载点 | 来源 |
|--------|-------------|-------------|-------------|--------|------|
| login | 900 000 ms（15 分钟） | 20 次 | `AUTH_LOGIN_RATE_WINDOW_MS` / `AUTH_LOGIN_RATE_MAX` | `POST /api/auth/login` | 工厂 `server/lib/rateLimits.js:18-23`；挂载 `server/routes/auth.js:32`、路由 `auth.js:115`；env 样例 `server/.env.example:30-31` |
| register | 3 600 000 ms（1 小时） | 10 次 | `AUTH_REGISTER_RATE_WINDOW_MS` / `AUTH_REGISTER_RATE_MAX` | `POST /api/auth/register` | `server/lib/rateLimits.js:26-31`；挂载 `server/routes/auth.js:33`、路由 `auth.js:65`；env 样例 `server/.env.example:32-33` |
| display | 60 000 ms（1 分钟） | 60 次 | `DISPLAY_RATE_WINDOW_MS` / `DISPLAY_RATE_MAX` | `/api/display` 匿名共享面（SSE 长连接仅在建立时计 1 次） | `server/lib/rateLimits.js:34-39`；挂载 `server/index.js:126`（注释 `:123-125`）；env 样例 `server/.env.example:35-36` |
| gallery | 60 000 ms（1 分钟） | 120 次 | `GALLERY_RATE_WINDOW_MS` / `GALLERY_RATE_MAX` | `/api/gallery`（匿名浏览与登录复制同桶） | `server/lib/rateLimits.js:42-47`；挂载 `server/index.js:127`；env 样例 `server/.env.example:37-38` |

- **实现语义**：单进程内存滑动窗口，键 `req.ip`（信任代理 1 跳 `server/index.js:41`）；超限返回 **429 + `Retry-After`（秒，向上取整）**，消息 `Too many requests, please retry later`——`server/lib/rateLimit.js:6-44`（核心 `:30-39`）。
- 各工厂调用一次即独立实例（桶互不共享）：`server/lib/rateLimits.js:4-8` 注释。

#### EP-PROTECT-02 会话与载荷配额

| 配额 | 值 | 语义 | 来源 |
|------|-----|------|------|
| 会话容量 | 100 | 全进程活跃控制会话上限，超限 409 `Session capacity reached` | `server/lib/timerSessions.js:75`（capacity 参数）、`:126-130` |
| 心跳超时 | 30 000 ms | 惰性过期窗口（无定时器） | `server/lib/timerSessions.js:75,105-107` |
| 待处理指令队列 | 32 | 超限 429 `Too many pending commands` | `server/lib/timerSessions.js:17`（MAX_PENDING_COMMANDS）、`:257-261` |
| 信令帧大小 | 32 KB | 超限 400（一次性转发不排队） | `server/lib/timerSessions.js:20`（MAX_SIGNAL_BYTES）、`:286-290` |
| 请求体上限 | 1 mb | express.json 全局 | `server/index.js:45` |
| 登录会话 TTL | 30 天（2 592 000 000 ms） | cookie `dt_session`（httpOnly，SameSite `lax`/`strict`/`none` 白名单） | `server/lib/session.js:3-4,15-19`；过期索引 `server/index.js:105-106` |
| 记录阶段数 | 64 | 超出截断并置 `truncated:true` | `server/lib/matchLogs.js:2,76-80` |
| 记录载荷 | 64 KB | 超限 400 | `server/lib/matchLogs.js:3,131-133` |
| 单阶段计划用时 | 1–3600 s；宽限 0–300 s；实绩 0–86 400 s；超时次数 0–99 | 记录字段整型区间 | `server/lib/matchLogs.js:97-104` |
| 队名长度 | ≤20 字符 | 配置与记录一致 | `server/lib/configDocs.js:32,95`、`server/lib/matchLogs.js:66` |

### 3.6 多语言（EP-I18N）

#### EP-I18N-01 界面语言 `lng`

| 取值 | 含义 | 来源 |
|------|------|------|
| `en` | 英语（回退语言） | `supportedLngs`/`fallbackLng` `src/i18n.js:24-25`；词条 `src/locales/en.json` |
| `fr-CA` | 法语（加拿大） | `src/i18n.js:21`；词条 `src/locales/fr-CA.json` |
| `zh-Hans` | 简体中文 | `src/i18n.js:22`；词条 `src/locales/zh-Hans.json` |

#### EP-I18N-02 TTS 语音匹配档 `matched`

| 取值 | 含义 | 来源 |
|------|------|------|
| `exact` | BCP-47 精确命中（如 zh-CN） | `src/services/speech.js:83-92` |
| `family` | 语言族前缀命中（zh-*） | `src/services/speech.js:93-98` |
| `fallback` | 系统缺省/首个语音 | `src/services/speech.js:99-103` |

## 4. 附：客户端本地存储键（常量池）

| 键 | 含义 | 来源 |
|----|------|------|
| `selectedConfigurationName` | 最近使用模板记忆 | `src/config/configConstants.js:5` |
| `timer.soundPrefs` | 本设备铃声/TTS 偏好 | `src/services/soundPrefs.js:35` |
| `timer.session.selfHost` | host 角色记忆 | `src/timer/useTimerSessionSync.js:11` |
| `timer.session.lastRemote` | remote 角色记忆 | `src/timer/useTimerSessionSync.js:16` |
| `默认配置`（DEFAULT_CONFIGURATION_NAME） | 缺省模板名 | `src/config/configConstants.js:2` |

## 5. 与 AA 模块编码的覆盖对照

| 应用域 | 池内条目 |
|--------|---------|
| C-01 比赛计时 | EP-TIMER-01~07 |
| C-02 大屏同步与远程控制 | EP-SESSION-01~11 |
| S-01 账号与准入 | EP-IDENT-01~03 |
| S-02 赛制模板管理 | EP-CONFIG-01~05 |
| S-03 模板广场 | EP-CONFIG-06~07、EP-IDENT-01（下架鉴权） |
| S-04 比赛记录与复盘 | EP-TIMER-01/04/06（记录字段复用）、EP-PROTECT-02（载荷配额） |
| D-01 权限与用户治理 | EP-IDENT-01/03 |
| D-02 系统配置 | EP-IDENT-02（app_settings）、EP-CONFIG-05 |
| P-01 实时通道 | EP-SESSION-02（SSE 帧）、EP-PROTECT-01（display 窗口） |
| P-02 接口防护 | EP-PROTECT-01/02 |
| P-03 离线壳 | 无业务枚举（纯技术，不入池） |

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.0 | 2026-11-11 | 初始生成：逆向归档现有代码常量，6 域 32 组枚举/配额全部逐条核对源文件行号；未登记任何代码中不存在的取值 |
