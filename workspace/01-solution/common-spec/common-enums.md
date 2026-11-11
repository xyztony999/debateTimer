# 跨模块通用枚举（common-enums）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 上游 | enum-pool.md v1.0（定义与取值以总册为准，本册只登记**跨模块复用**子集与消费矩阵） |

## 1. 文档定位

| 定位 | 说明 |
|------|------|
| 本文档做什么 | 从枚举池中挑出被 ≥2 个 AA 功能模块消费的枚举，给出消费矩阵与复用规则，供 D3 各 API 文档直接引用（引用写法：`EP-<域>-<序号>`） |
| 本文档不做什么 | 不重复定义取值；单模块私有的枚举（如 PID station 类型仅 S-02、gallery 排序仅 S-03）不入本册，直接查 enum-pool.md |

## 2. 复用规则

1. **先池后用**：任何 API 文档引用枚举必须先在 enum-pool.md 有编号（d3-api.md M3 自检项）；本文档中的编号即引用凭据。
2. **复用优先**：新接口遇到语义相同的枚举（如「计时模式」「正反方」）必须复用既有编号，禁止在同语义下另起取值集。
3. **差异即新枚举**：取值集或不变式不同（哪怕仅差一个值）不得复用编号，须在池内新增条目并注明派生关系（例：`SOUND_CHECK_KINDS` 与 `ALERT_NODES` 是近源但取值集不同的两枚举）。
4. **单一事实源**：每枚举的权威常量文件唯一（见「权威定义」列）；其他位置只做映射或白名单引用，改值先改权威文件。

## 3. 跨模块枚举清单

| 编号 | 枚举 | 取值 | 权威定义（唯一事实源） | 复用消费方（AA 模块） |
|------|------|------|----------------------|----------------------|
| EP-IDENT-01 | 用户角色 `role` | `admin` / `user` | `server/routes/auth.js:93`（赋值）；鉴权 `server/lib/authMiddleware.js:52`、`server/lib/authPolicy.js:32-40` | S-01（注册定角色）、S-03（下架 admin only）、D-01（用户治理/最后管理员守卫 `server/routes/admin.js:105,172,181`）、全模块（requireAdmin 挂载 `server/index.js:131-139`） |
| EP-IDENT-02 | 注册准入 `registrationOpen` | `true` / `false`（env→DB→首用户短路三级） | `server/lib/authPolicy.js:11-23` | S-01（注册入口 `server/routes/auth.js:50,68`）、D-02（app_settings 单文档 `REGISTRATION_SETTING_ID` `authPolicy.js:4`）、D-01（管理开关 `server/routes/admin.js:76-79`） |
| EP-IDENT-03 | 用户禁用态 `disabled` | `true` / `false` | `server/routes/admin.js:167-176` | D-01（治理）、S-01（禁用即拒登/吊销会话 `admin.js:202`） |
| EP-TIMER-01 | 阶段计时模式 `stageMode` | `single` / `double` / `free` | 服务端白名单 `server/lib/timerSessions.js:3`；存储兼容 `server/lib/configDocs.js:22-29` | C-01（引擎 `src/timer/engine.js:19`）、C-02（快照校验 `timerSessions.js:337-340`）、S-02（模板编辑 `TimerSetting.jsx:1-5`）、S-03（卡片模式构成 `server/routes/gallery.js:8-19`）、S-04（记录阶段 `server/lib/matchLogs.js:89-92`） |
| EP-TIMER-02 | 侧时钟阶段 `phase` | `running` / `grace` / `locked` | 客户端常量 `src/timer/engine.js:14-16`；服务端白名单+不变式 `server/lib/timerSessions.js:5,348-360` | C-01（状态机 `engine.js:9-11`）、C-02（快照 wire `phaseAff/phaseNeg`）、S-04（实绩折算 `src/timer/matchCapture.js:8-20` 经 locked/graceLeft） |
| EP-TIMER-03 | 发言方 `activeSide` | `aff` / `neg` / `none` | `server/lib/timerSessions.js:4` | C-01（free 交棒选择器 `src/timer/engine.js:425-433`）、C-02（快照 `:372,387-389`） |
| EP-TIMER-04 | 对阵/侧键 `aff`/`neg`（+引擎 `single`） | `single` / `aff` / `neg` | 引擎槽 `src/timer/engine.js:21`；指令侧白名单 `server/lib/timerSessions.js:16` | C-01（时钟槽）、C-02（遥控指令 side）、S-02（队名键 `server/lib/configDocs.js:90`）、S-04（实绩/超时键 `server/lib/matchLogs.js:60,101-102`） |
| EP-TIMER-06 | 告警节点 `warn30`/`timeUp`/`mustStop`/`handover` | 节点字符串 | `src/services/soundPrefs.js:7,25`（ALERT_NODES/TTS_NODES） | C-01（主机铃声+TTS `src/timer/engine.js:70-85`）、C-02（大屏同步响铃/播报：同一节点经快照驱动呈现；wire 试音两档 `server/lib/timerSessions.js:15`） |
| EP-SESSION-01 | 会话角色 host/remote/display | 角色约定字符串 | `src/timer/useTimerSessionSync.js:11-18`（角色记忆）+ `server/lib/timerSessions.js:280`（信号目标） | C-02 全部子模块（会话管理/跟随/配对/遥控）、C-01（主机即 host）、P-01（SSE token 流 `server/lib/sseHub.js:38-48`） |
| EP-SESSION-02/03/04 | SSE 事件名与会话生命周期 | `state`/`session`/`command`/`signal`/`change`；`started`/`ended`/`expired`；4 个 reason | `server/lib/sseHub.js` + `server/lib/timerSessions.js:80-85,105-107,124` | C-02（消费端 `src/timer/useTimerSessionSync.js:832`）、S-02（共享开关连带 `server/routes/configurations.js:219`）、P-01（通道实现） |
| EP-SESSION-10 | 快照 wire 字段 schema v2 | 见总册 | `server/lib/timerSessions.js:325-406`（validateSnapshot 权威）；编解码 `src/timer/snapshotCodec.js` | C-01（buildSnapshot 上行）、C-02（adoptSnapshot 下行 + P2P 直连同帧 `src/timer/useTimerSessionSync.js:238-239`）、S-04（不消费 wire，但实绩起点同 stageId 体系） |
| EP-CONFIG-01 | 预置阶段 id（16 个稳定 id） | `sound_check`…`aff_closing` | `src/config/stageRegistry.js:22-41` | S-02（模板编辑/图标 `src/components/StageIcon.jsx:15-32`）、C-01（APPLY_STAGE）、C-02（applyStage 指令校验 `server/lib/timerSessions.js:239-244`）、S-04（记录 stageId/label 快照 `server/lib/matchLogs.js:94-95`）、D-02（预置导入 `server/scripts/presets/*.json`） |
| EP-CONFIG-04 | 线路颜色 7 色白名单 | `#1e3a5f` 等 | `server/lib/configDocs.js:18-20` | S-02（调色板 `src/config/pidIcons.js:62-66`）、C-01/C-02（PID 呈现随配置快照下发 `server/lib/configDocs.js:268-282`） |
| EP-I18N-01 | 界面语言 | `en` / `fr-CA` / `zh-Hans` | `src/i18n.js:24-25` | 全模块 UI（i18n 骨架）；S-02（多语言阶段名 `stageLabels` 键随语言）；C-01（TTS 语种链 `src/services/speech.js:12-16`） |

## 4. 消费矩阵（模块 × 枚举编号）

| 模块 | 引用编号 |
|------|---------|
| C-01 | EP-TIMER-01/02/03/04/06/07、EP-SESSION-01/10、EP-CONFIG-01/04、EP-I18N-01 |
| C-02 | EP-SESSION-01/02/03/04/05/06/07/08/09/10/11、EP-TIMER-01/02/03/04/06、EP-CONFIG-01 |
| S-01 | EP-IDENT-01/02/03 |
| S-02 | EP-TIMER-01、EP-CONFIG-01/02/03/04/05、EP-I18N-01 |
| S-03 | EP-IDENT-01、EP-TIMER-01、EP-CONFIG-06/07 |
| S-04 | EP-TIMER-01/02/04/06（记录侧复用）、EP-PROTECT-02、EP-CONFIG-01 |
| D-01 | EP-IDENT-01/03 |
| D-02 | EP-IDENT-02、EP-CONFIG-01/05 |
| P-01 | EP-SESSION-01/02/03/04、EP-PROTECT-01（display 窗口） |
| P-02 | EP-PROTECT-01/02 |

## 5. 已知口径差异（如实登记，不判错）

1. **数字模式兼容面不一致**：配置存储兼容遗留数字仅 `0→single`、`1→double`，数字 `2` 不被服务端接受（`server/lib/configDocs.js:22-29`）；客户端内存映射 `MODE_STRING` 齐备 `2:'free'`（`src/timer/engine.js:19`）。新接口一律传字符串三值。
2. **告警节点两套取值集**：本地节点四值（含 `handover`，`src/services/soundPrefs.js:7,25`）与 wire 试音两档 `warn30`/`end`（`server/lib/timerSessions.js:15`）语义对齐但集合不同，引用时注意区分场景（本地试音 vs 遥控转发）。
3. **会话角色无 wire 枚举**：host/remote/display 是架构角色约定（角色记忆键 + 路由职责划分），服务端没有单一 role 字段承载；signal 帧中的 `host`/`remote`（`server/lib/timerSessions.js:280`）是该约定唯一的线上投影。

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.0 | 2026-11-11 | 初始生成：从枚举池挑选 13 组跨模块枚举，给出权威定义、消费矩阵与 3 条口径差异登记 |
