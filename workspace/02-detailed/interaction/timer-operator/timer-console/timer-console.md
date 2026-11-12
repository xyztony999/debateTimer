# 计时操作员 · 计时控制台 PageSpec

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定(逆向归档:按现有实现如实归档) |
| 最后更新 | 2026-11-11 |
| 模块编码 | C-01 比赛计时(C-01-01/02/03/05 计时控制·模式·宽限·自动推进)+ 内嵌入口:C-02-01 会话控制、C-01-04 告警设置入口、S-04-02 保存记录 |
| 上游依据 | 《C-01 比赛计时 API 设计》v1.0(进程内动作/事件契约)、《C-02 大屏同步与远程控制 API 设计》v1.0(会话端点)、《S-04 比赛记录与复盘 API 设计》v1.0(ML-SAVE)、FL v1.0 §2.1(菜单:计时台/告警与语音设置/开启远程控制/保存比赛记录) |
| 用户类型 | 计时操作员 |
| 页面类型 | `code`(实时交互型:墙钟锚点+毫秒渲染+Worker 心跳,无列表/表单/详情页) |
| 实现锚点 | `src/TimerControlPage.jsx`(890 行)、`src/components/TimerBox.jsx`、`src/timer/useDebateTimer.js`、`src/timer/useTimerKeyboardShortcuts.js`、`src/timer/timer-control.css`、`src/components/SoundSettingsPanel.jsx`、`src/DebateSetting.jsx:1109-1121`(告警面板宿主) |

> **文档性质(逆向归档)**:系统已上线,本文档如实描述现有实现;分册 Step 4 的 7 项交互确认在本流水线无人工环节,以「现有实现即确认结论」替代(逐项见 §1.4)。组件映射表为 vue3-engine 参考实现,本项目 react-vite-web 栈按 profile 等价映射(§7)。

## 1. 模块元信息

### 1.1 页面清单

| 页面 | 路由 | 守卫 | 布局分支 | 说明 |
|------|------|------|---------|------|
| 计时控制台(桌面/横屏) | `/` | `ProtectedRoute`(需登录,`src/App.jsx:30-37`) | 默认分支 | 本文档主体 |
| 遥控器布局(竖屏手机) | `/`(同页分支) | 同上 | `isRemote` 分支 | 见 [../remote-controller/remote-controller.md](../remote-controller/remote-controller.md) |

- 分支判据:`useMediaQuery('(max-width:600px) and (orientation: portrait)')`(`src/TimerControlPage.jsx:105`),竖屏 ≤600px 自动切换,**同页同运行时**,非独立路由。
- 页面标题/品牌:AppBar 左侧 BrandMark + `t('timer.title')`(窄屏隐藏文字,`src/TimerControlPage.jsx:322-324`)。

### 1.2 业务类型与页面类型

- 业务类型:均不适用(分册三分类 master_data/business_doc/application_doc 面向表单域;本页为实时控制台,计时引擎状态本地聚合、无服务端接口——C-01 API §3.1「HTTP 接口清单为空」)。
- 页面类型:`code` 覆盖(分册 2.2:实时试算/复杂交互),无 hybrid 列表/表单结构。

### 1.3 运行时(单一数据源)

页面经 `useDebateTimer()` 装配计时运行时(`src/TimerControlPage.jsx:107-133`),关键输出:

| 输出 | 类型 | 用途 |
|------|------|------|
| `config` | 模板投影 | 阶段序列/模式/多语言名/队名/PID 装饰(S-02 CFG-GET 经 ACL 投影) |
| `state` | 引擎状态 | stageId/三侧时钟/advance(auto 推进倒计时) |
| `derived` | 派生 | isDual/isFree/freeLocked/blinking{aff,neg,single}/activeSide |
| `liveSides` | 毫秒读数 | 锚点派生每帧剩余时间(running: endAt−now;frozen: 冻结值,C-01 API §3.1.3) |
| `actions` | 引擎动作 | startAff/stopAff/toggleAff/resetAff/…(C-01 API §4.4.2 动作表) |
| 会话组 | C-02 装配 | sessionState/sessionNotice/pairingCode/following/remoteMode/rtcState/detectedSession 等(§4) |
| `captureCount` / `saveMatchRecord` | S-04 采集 | 保存按钮依据与动作(§3.8) |

### 1.4 交互确认记录(分册 Step 4 的 7 项,逆向归档以实现为准)

| # | 确认项 | 结论(=现有实现) |
|---|--------|----------------|
| 1 | 模块元信息 | C-01 计时台,`code` 型,路由 `/`,需登录;见 §1.1–1.3 |
| 2 | 查询条件 | 无列表查询(裁剪);输入为模板投影(S-02 CFG-GET)与引擎状态 |
| 3 | 表格列 | 无表格(裁剪);时间线 tab 序即模板 stageOrder |
| 4 | operList | 无 operList;操作入口=AppBar/时钟面/底部操作栏/时间线/快捷键五组(§3),可见性由会话态与相位派生(非后端 operList——本页无对应后端接口) |
| 5 | 表单分组 | 无表单;告警设置面板为设备本地面板(§3.7),配对码 Dialog 见 §3.6 |
| 6 | 详情 Card | 无详情页(裁剪);复盘明细在 S-04 记录页(不在本文档范围) |
| 7 | 页面类型覆盖 | `code` 覆盖成立(实时引擎+毫秒渲染+快捷键+双布局) |

## 2. 页面结构(桌面/横屏默认分支)

页面根:`minHeight:100dvh`,顶部留 `env(safe-area-inset-top)`,底部留 `96px + env(safe-area-inset-bottom)` 给固定操作栏(`src/TimerControlPage.jsx:310-319`)。

### 2.1 区块分解(自上而下)

| 区块 | 类名/组件 | 出处 | 说明 |
|------|----------|------|------|
| B1 顶栏 | MUI `AppBar`(sticky)+`Toolbar` | `:320-427` | 会话控制、保存、配对码、帮助、更多菜单;见 §2.2 |
| B2 时间线 | `.st-anchor`>`.stage-timeline`(role=tablist) | `:229-281` | PID 装饰的 clickable 阶段胶囊;见 §2.3 |
| B3 语境行 | `contextRow`(条件渲染) | `:283-301` | 声测试听按钮/自动推进倒计时;见 §3.5、§3.9 |
| B4 时钟区 | `.clock-area`>`TimerBox`×1/2 | `:743-798` | 单/双时钟面;见 §2.4 |
| B5 锁定注记 | `Typography`(error,role=status) | `:800-808` | 自由辩论锁定;见 §4.2 |
| B6 底部操作栏 | `.ctl-action-bar`(AppBar fixed bottom) | `:812-872` | 大按钮启停/重置;见 §3.2 |
| B7 会话通知 | fixed `Alert`(info,role=status) | `:874-887` | sessionNotice 3s 自动清除;见 §4.3 |
| 弹层 | Popover(快捷键)/Menu(更多)/Dialog(配对) | `:429-561` | 见 §3.6、§3.7 |

### 2.2 B1 顶栏元素级分解(左→右)

| 元素 | 组件 | 显示条件 | 行为 | 出处 |
|------|------|---------|------|------|
| 品牌+标题 | `h1` BrandMark+文字 | 恒显(窄屏仅图标) | 无(标题) | `:322-324` |
| 到站播报槽 | `.st-announce`(绝对居中,pointer-events:none) | 阶段变化/首载时 3 秒 | pill 显示「当前阶段 · <名>」,超时淡出;零推挤 | `:210-225,326-352` |
| 保存比赛记录 | Button(SaveIcon) | 恒显;`disabled = captureCount===0` | `saveMatchRecord(false)` → S-04 ML-SAVE | `:354-363` |
| 配对码 Chip | Chip(outlined) | `sessionActive && pairingCode` | 展示 4 位配对码(供手机配对) | `:365-372` |
| 会话区(三态) | Chip/Button/IconButton 组 | 见 §4.1 | 开启/复制链接/停止/接管 | `:373-411` |
| 安装按钮 | `InstallButton`(PWA) | 支持安装时 | 触发安装 | `:413` |
| 快捷键帮助 | IconButton(KeyboardIcon) | 恒显 | 开 Popover 列五条快捷键提示 | `:415-422,429-447` |
| 更多菜单 | IconButton(MoreVertIcon) | 恒显 | Menu:连接电脑(仅 remoteMode)/模板设置 `/settings`/比赛记录 `/records`/模板广场 `/gallery`/管理台 `/admin`(仅 admin)/语言切换/深浅色/安装/退出登录 | `:423-425,449-499` |

### 2.3 B2 阶段时间线(时间线 PID)

- 容器 `.st-anchor` 注入 CSS 变量 `--st-route = pidOptions.lineColor`(模板级 PID 线色,`src/TimerControlPage.jsx:229-233`;字段语义见 S-02 API §3.4 pidLineColor 7 色白名单)。
- 每阶段渲染一个 `button[role=tab]`(`:257-278`):

| 视觉要素 | 规则 | 出处 |
|---------|------|------|
| 当前站图标 | `StageIcon`(stageId/mode),图标优先级:阶段级 `stagePid[stage].icon` > 模板级 `pidOptions.marker` > 语义默认 | `:253-256,273` |
| 序号圆点 | `.st-dot` 序号=index+1 | `:274` |
| 阶段名 | `stageDisplayName(t, stage, config.stageLabels, i18n.language)`(多语言,缺省回落 i18n 通用名) | `:205,275` |
| 当前站态 | `.st-step--current`(+aria-selected=true) | `:240,262-263` |
| 已过站态 | `.st-step--passed`(index < 当前 index) | `:241` |
| 换乘站态 | `.st-step--interchange`:显式 `stagePid[stage].station==='interchange'` 强制 / `'normal'` 抑制 / 否则自动推导=与前站计时模式(single/double/free)不同 | `:242-252` |
| 禁用 | `disabled = readOnly`(跟随且非遥控时时间线只读) | `:263` |
| 点击 | `fire.applyStage(stageId)`(遥控模式转发指令,本地模式派发 APPLY_STAGE) | `:270` |
| 滚动跟随 | 切阶段后当前胶囊 `scrollIntoView({inline:'center'})` 平滑居中 | `:196-200` |
| 可访问性 | `role=tablist`+`aria-label=t('timer.timeline')`;tab 有 `title` 全名 | `:236-237,271` |

### 2.4 B4 时钟区(TimerBox)

双计时(`derived.isDual`)渲染两个 `TimerBox`,否则一个(single 侧)。TimerBox 为纯展示组件(`src/components/TimerBox.jsx:11-91`),变体 `control`:

| 要素 | 规则 | 出处 |
|------|------|------|
| 标题 | `badge`(正/反徽标)+ `title`(队名 `config.teamNames.aff/neg` 回落 i18n「正方/反方」) | `:43-48`;TimerControlPage `:203-204,753-754` |
| 时钟读数 | `formatTime(grace 相 ? graceLeft : remaining)`;类:`--locked`/`--grace`/`--warn`(告警闪烁窗口 30–27s,C-01 API §4.1) | TimerBox `:29-51` |
| 宽限提示 | grace 相显示 `t('timer.graceHint')` | TimerBox `:52` |
| 操作按钮 | ▶(disabled=running)/⏸(disabled=!running)/↺(disabled=running);title=快捷键提示 | TimerBox `:57-84` |
| 自由辩论活动侧 | `active = isFree && activeSide==='<side>'` → `.tb-active` 高亮 | `:41`;TimerControlPage `:750,767` |
| 跟随只读 | `readonly = readOnly` → 按钮替换为 `t('timer.session.following')` 文案 | TimerBox `:53-54`;TimerControlPage `:751-752` |
| 快捷键提示行 | 按钮下方 `hint`(如「A 启停 · Shift+Q 重置」) | TimerBox `:86` |

**实现差异注记(如实归档)**:时钟面重置走 `actions.resetAff/Neg/Single`(本地动作,`src/TimerControlPage.jsx:762,779,795`),不经 `fire` 指令包装;时间线与底部操作栏走 `fire.*`(遥控模式转发指令)。即桌面遥控横屏态下经时钟面 ↺ 的重置作用于本地引擎——现有实现行为,记录不评改。

## 3. Action 定义(事件 → 行为 → 反馈)

> 本页无后端 operList;动作可见性由前端状态派生。`fire` 包装层(`src/TimerControlPage.jsx:138-154`):remoteMode 时全部动作转 `sendRemoteCommand({type, side|stageId|kind})`(C-02 API-3 / P2P 直连),本地模式直派引擎动作。

### 3.1 计时启停(C-01-01)

| 动作 | 入口 | 行为 | 反馈/边界 |
|------|------|------|----------|
| 启/停正方 | 时钟面 ▶/⏸;底部大按钮;快捷键 A | `fire.toggleAff` | locked 相按播放不解锁、重响 mustStop;grace 相重开宽限窗(C-01 API §4.4.2) |
| 启/停反方 | 同上;快捷键 L | `fire.toggleNeg` | 同上 |
| 启/停单钟 | 时钟面/底部;快捷键 Space | `fire.toggleSingle` | 同上 |
| 重置正/反 | 时钟面 ↺;遥控器重置行;快捷键 Shift+Q/O(仅未运行时) | reset 动作 | 回满时长并解除锁定/宽限;运行中入口全部禁用 |
| 重置单钟 | 时钟面 ↺;底部 ↺;快捷键 Shift+R | `fire.resetSingle` | `sound_check` 阶段快捷键转为 PREP_ZERO 归零(`:176-185`);运行中禁用 |

### 3.2 底部主操作栏(B6)

- 双计时:两个大按钮(minWidth 170)「▶启动·正 / ⏸暂停·正」「…·反」,运行中 variant 由 contained 转 outlined(`:822-846`)。
- 单计时:启停大按钮 + 重置按钮(`disabled = readOnly || running`,`:847-869`)。
- 全部 `disabled = readOnly`;触屏大目标与快捷键双入口。

### 3.3 阶段切换(C-01-01)

| 入口 | 行为 |
|------|------|
| 时间线点击任意站 | `fire.applyStage(stageId)`;落定阶段投影并重置该阶段全部时钟(APPLY_STAGE);关旧开新采集条目(S-04-01) |
| 快捷键 ← / → | `actions.goToAdjacentStage(∓1)`(越界不动,C-01 API APPLY_STAGE「阶段越界不动」) |
| 自动推进归零 | 引擎 ADVANCE_TICK 至 0 自动 APPLY_STAGE 下一阶段(末阶段不推进) |

### 3.4 阶段切换播报(MTR 式到站播报)

- `state.stageId` 变化(含首载)→ 顶栏中央 pill「当前阶段 · <名>」,3000ms 后清除(`:210-225`);`role=status`+`aria-live=polite`,绝对定位不推挤布局(`:326-343`)。

### 3.5 自动推进提示(C-01-05)

- `state.advance != null` → 语境行 Alert(info,role=status):`t('timer.advanceCountdown',{n})` =「{{n}} 秒后进入下一阶段 · 按任意键取消」(zh-Hans.json:86)。
- 取消:任意手动输入(快捷键 hook 每次按键先 `actions.cancelAdvance`,`src/timer/useTimerKeyboardShortcuts.js:43-44`)或任意按钮操作。
- 臂动条件(非跟随+非末阶段+无侧宽限+阶段彻底结束+stageAutoAdvance)见 C-01 API §4.3 子流程 2。

### 3.6 声测试听(C-01-04 试听,sound_check 阶段)

- `state.stageId==='sound_check'` → 语境行两按钮:「试听 30 秒铃」`fire.soundCheck30` / 「试听结束铃」`fire.soundCheckEnd`(`:283-294`);遥控模式转 `soundCheck` 指令(kind: warn30/end,C-02 API §4.4.4)。

### 3.7 告警与语音设置面板(C-01-04,设备本地)

**宿主位置(如实归档)**:计时控制台本体**不内嵌**告警面板——FL 菜单「告警与语音设置」经更多菜单 → `t('timer.settings')` 跳 `/settings`,面板为该页「告警音效」Card(`src/DebateSetting.jsx:1109-1121`);同一面板组件 `SoundSettingsPanel` 亦被大屏页 🔊 弹出复用(见 [../../screen-audience/display-follow/display-follow.md](../../screen-audience/display-follow/display-follow.md) §2.2)。

| 字段 | 组件 | 取值/默认 | 行为 |
|------|------|----------|------|
| 三节点铃声方案(warn30/timeUp/mustStop) | Select | split/notify/timeup/chime;默认 split/timeup/notify | 即改即存 localStorage `timer.soundPrefs`(`src/services/soundPrefs.js:16-20,35,81-87`) |
| 各节点音量 | Slider 0–100(step5,默认 100) | 同上即存 | |
| 各节点试听 | IconButton(PlayArrow) | — | `previewSound(sound, volume)` 本机播放 |
| 恢复默认 | Button(RestartAlt) | — | 重置三节点+TTS 为 DEFAULT 并保存(`SoundSettingsPanel.jsx:125-129`) |
| TTS 总开关 | Switch(默认关;不支持 TTS 时 disabled) | `tts.enabled` | 开启即 `primeTts()+unlockTtsNow()`(手势解锁,`SoundSettingsPanel.jsx:111-123`) |
| TTS 四节点分开关(warn30/timeUp/mustStop/handover) | Switch(默认全开;总开关关闭时禁用) | `DEFAULT_TTS_PREFS` | 试听按钮播真实播报文案(通用队名,`SoundSettingsPanel.jsx:133-145`) |
| 语音就绪提示 | caption(role=status) | — | 不支持/未解锁/回退/就绪四态文案(`SoundSettingsPanel.jsx:148-165`) |

- 存储语义:设备本地偏好,无服务端读写接口(C-01 API §1.2「告警偏好同步接口不存在」);播放时由事件消费钩子读本机偏好(playAlert,`src/services/soundPrefs.js:117-126`)。
- 汉堡内 TTS/铃声默认值与常量表出处:`src/services/soundPrefs.js:7-33`。

### 3.8 保存比赛记录(S-04-02)

- 入口:顶栏保存按钮(§2.2);`disabled = captureCount===0`(空采集静默跳过,S-04 API §4.3)。
- 行为:`saveMatchRecord(false)` → `buildMatchPayload` → `POST /api/match-logs`(S-04 ML-SAVE,响应 200 含 id/savedAt/summary);手动保存次数不限、缓冲保留可再存。

### 3.9 会话控制动作(C-02-01,顶栏三态)

| 态 | UI | 动作 | 契约 |
|----|----|------|------|
| 未开启 | Button「📡 开启远程控制」(`sessionState==='starting'` 时 disabled,ref 级防双击) | `handleStartSession` → `POST /api/configurations/:name/session`(前置 shareEnabled,否则通知 `enableShareFirst`) | C-02 API-1 |
| active/weak | Chip(success「远程控制中」/warning「信号弱」)+ 🔗 IconButton + ⏹ IconButton | 🔗=`handleCopyDisplayUrl`(复制 `/display/{shareToken}`,通知 copied);⏹=`handleStopSession` → `DELETE …/session` 并触发记录自动保存(一次) | C-02 API-5;S-04 自动保存 |
| following | Chip(info「正在跟随遥控器」;remoteMode 时 secondary「遥控中 · 直连/中转」)+ Button「⇄ 接管」 | `takeoverSession`(采纳在席快照+以在席 sessionId 恢复上报;原控制端随后 409 让位) | C-02 API §4.3 接管子流程 |

- 弱信号判定与失败处置(yield/自愈/ignore/retry)见 §4.4;通知文案清单见 §4.3。

## 4. 状态与提示(本页呈现的会话/引擎状态)

### 4.1 会话状态机(客户端呈现)

`sessionState ∈ {idle, starting, active, weak}`(`src/timer/useTimerSessionSync.js:43`);`sessionActive = active || weak`(`:202`)。UI 映射见 §3.9。

### 4.2 引擎相位呈现(C-01 状态机)

| 相位 | 时钟视觉 | 语义 |
|------|---------|------|
| running | 常态;剩余 ≤30s 且 >27s 进入 `--warn` 闪烁(仅 running 相) | 正常倒计时 |
| grace | `--grace` 类+宽限提示行;时钟显示剩余宽限 | 时间到后的收尾倒计时;▶ 可重开宽限窗 |
| locked | `--locked` 类;启停/重置禁用 | 宽限耗尽;播放指令重响 mustStop 不解锁 |

自由辩论双侧耗尽:`derived.freeLocked` → 页面红色注记「自由辩论环节已结束」(role=status,`:800-808`)。出处:C-01 API §4.2 相位机。

### 4.3 会话通知条(sessionNotice)

- 渲染:fixed 底部 Alert(info),底部偏移 `isRemote ? 24 : 96px`(`:874-887`);3 秒自动清除(`useTimerSessionSync.js:766-771`)。
- 文案集(zh-Hans.json:33-64,三语同键):
  `session.ended` 远程控制已结束 / `session.reconnected` 已自动重连 / `session.takenByOther` **另一设备正在控制,已停止本机上报**(yield,不自愈+不自动保存,C-02 API §4.4.3)/ `session.remoteLost` 遥控失联回退 / `session.enableShareFirst` 请先开启分享 / `session.pairOk` 配对成功 / `session.copied` 链接已复制 / `session.detected` 检测到会话「{{name}}」。

### 4.4 失败处置映射(动作触发后的机器可读仲裁)

| 服务端结果 | 前端处置 | 用户感知 |
|-----------|---------|---------|
| 409 + `code=session_taken` | yield:清会话、停止上报、不自愈、不自动保存 | 通知「另一设备正在控制…」 |
| 400 「No active session」 | recover:退避 5s×2ⁿ(封顶 30s)重建会话,成功补报 | 无感(自动重连) |
| 400 seq 落后 | ignore(丢弃该帧) | 无感 |
| 403/404 | end 会话+自动保存 | 通知「远程控制已结束」 |
| 连续失败 ≥2 | 弱信号态 | Chip「信号弱」 |

出处:C-02 API §4.4.3 失败处置契约(`src/timer/snapshotReporting.js:27-42`)。

## 5. 快捷键定义(操作员键盘面)

`useTimerKeyboardShortcuts({enabled: !following, isDual, handlers})`(`src/TimerControlPage.jsx:156-187`;hook 实现 `src/timer/useTimerKeyboardShortcuts.js:19-103`):

| 键 | 模式 | 动作 | 守卫 |
|----|------|------|------|
| A | 双计时(含自由) | toggleAff 启停正方 | 修饰键/输入目标忽略;任意按键先取消推进 |
| Shift+Q | 双计时 | resetAff 重置正方 | 仅非运行侧(`:164-168`) |
| L | 双计时 | toggleNeg 启停反方 | 同 A |
| Shift+O | 双计时 | resetNeg 重置反方 | 仅非运行侧 |
| Space | 单计时 | toggleSingle 启停 | — |
| Shift+R | 单计时 | resetSingle;`sound_check` 阶段转 PREP_ZERO 归零 | 仅非运行侧 |
| ← / → | 全部 | goAdjacentStage 切阶段 | 无修饰键 |
| (任意键) | 全部 | `cancelAdvance` 取消自动推进 | 先于动作派发 |

- 全局过滤:ctrl/meta/alt 与 `INPUT/TEXTAREA/SELECT/contentEditable` 目标直接忽略(hook `:3-9,38-41`)。
- 帮助 Popover 五行文案(zh-Hans 实测,zh-Hans.json:28-32):「空格 启停 · Shift+R 重置」「A 启停 · Shift+Q 重置」「L 启停 · Shift+O 重置」「A/L 启停 · 停一方自动走另一方」「← → 切换辩论阶段」。
- 跟随态(`following=true`)整面禁用(BR-5:会话驱动本屏时键盘不上报)。

## 6. 数据源与接口引用

| 数据/动作 | 来源 | 契约归属 |
|----------|------|---------|
| 模板投影(config) | S-02 `GET /api/configurations/:name` + SSE change 重载(断流 5s 轮询兜底) | S-02 API CFG-GET/CFG-STREAM |
| 引擎动作/事件/毫秒读数 | 进程内 `useDebateTimer`(纯 reducer+锚点+Worker 心跳) | C-01 API §3.1/§4.4.2 |
| 开启/停止会话、上报快照 | `POST/DELETE /api/configurations/:name/session`、`PUT …/state`(主机恒 1 条认证自流接收 command/signal/change) | C-02 API-1/2/5、P-01 PC-1 |
| 遥控指令执行(遥控模式) | `POST …/session/command` 或 P2P DataChannel(commandSeq 单调去重,直连序号自 1e9 并轨) | C-02 API-3 |
| 配对 | `POST /api/session/pair`(4 位码,owner-scoped) | C-02 API-9 |
| 保存记录 | `POST /api/match-logs` | S-04 ML-SAVE |
| 铃声/TTS 资源 | 本地 mp3(`src/resources/*`)+浏览器 speechSynthesis;localStorage 偏好 | 设备本地,无接口 |
| PWA 壳/断网横幅 | 全局 `OfflineBanner`(App.jsx:23);计时本地可用、云同步不可用 | P-03(无 HTTP 面) |

## 7. 字典 Key / 枚举 / 国际化清单

- 字典接口:无(裁剪——本域无 `dict/batch`;下拉数据源为本地常量)。
- 进程内枚举(引用 C-01 API §3.4,不重复定义):stageMode(single/double/free)、phase(running/grace/locked)、告警节点(warn30/timeUp/mustStop/handover)、铃声(split/notify/timeup/chime)、事件(sound/voice/overrun)。
- 本页消费的 i18n 键族(三语 zh-Hans/en/fr-CA,`src/locales/`):`timer.*`(op.start/op.pause/op.reset/affBadge/negBadge/affirmative/negative/graceHint/free.locked/advanceCountdown/remote.* /session.*/display.*/hint*/shortcut*/timeline/settings/title/currentStage/test30sSound/testEndSound)、`settings.sound*`/`settings.tts*`、`records.save`/`records.title`、`gallery.title`、`admin.title`、`auth.logout`、`timer.language`/`timer.dark*`、`common.cancel`。
- 告警面板控件值即存即用,无「保存」提交钮(`SoundSettingsPanel.jsx:103-123` 每次变更同步写 localStorage)。

## 8. 路由定义

| 路由 | 页面 | 守卫 | 出处 |
|------|------|------|------|
| `/` | TimerControlPage(本页,含竖屏遥控分支) | ProtectedRoute(登录态) | `src/App.jsx:30-37` |
| `/settings` | DebateSetting(含告警面板宿主 Card) | ProtectedRoute | `src/App.jsx:38-45` |
| `/display/:token` | 大屏页(会话链接跳转目标) | 公开 | `src/App.jsx:27` |

导航入口:更多菜单(§2.2);未登录由 ProtectedRoute 重定向登录页。

## 9. 全局一致性

- **共享组件**:TimerBox 同时服务控制台与 `display` 变体(Props 差异仅 variant/readonly);SoundSettingsPanel 同时服务设置页 Card 与大屏弹层。
- **同一运行时**:控制台/遥控器/大屏三面均由 `useDebateTimer` 装配,大屏经 `shareToken` 进入跟随分支;快照编解码单一实现(`src/timer/snapshotCodec.js`,C-02 API §4.4.9)。
- **主题**:深浅色经 ColorModeContext 全局切换(更多菜单);MUI 主题 `src/theme.js`。
- **国际化**:全键三语;阶段名三语快照在模板(S-02 stageLabels),显示经 `stageDisplayName` 回落链(模板名 → 当前语言通用名)。
- **响应式/安全区**:`100dvh`+`env(safe-area-inset-*)`(刘海屏);竖屏断点 600px 切遥控布局(§1.1)。
- **告警呈现同步性**:闪烁由引擎 derived 派生(随快照同步到跟随端);铃声/TTS 由各设备本地偏好播放——主机与 大屏铃声独立(C-01-04「偏好本设备配置」)。
- **无 operList/权限 key**:本页动作无服务端权限矩阵;服务端校验仅作用于其所调 C-02/S-04 端点(requireAuth+owner)。

## 10. 裁剪说明

| 分册章节 | 本页处置 |
|---------|---------|
| 第4节 列表页(查询/表格列/工具栏) | 裁剪:无列表 |
| 第5节 表单页(字段/分组/校验) | 裁剪:无表单(配对 Dialog 字段见 §3.6 注:仅 1 输入字段,<5 字段 Dialog 形态) |
| 第6节 详情页(Card 划分) | 裁剪:无详情;复盘在 S-04 |
| 第7节 路由 | 保留(§8) |
| 分步表单/币种/下拉数据源规范 | 裁剪:不适用 |

## 11. 质量自检(FX 对照裁剪版)

| 项 | 结果 |
|----|------|
| 模块元信息完整(编码/路由/类型/用户类型) | ✅ §1 |
| Action 定义含事件→行为→反馈与边界 | ✅ §3(operList 项以「无后端 operList,前端派生可见性」如实标注) |
| 字典 Key 清单 | ✅ §7(本地常量+i18n 键族,无字典接口已声明) |
| 列表页 31 项 | ⬛ 裁剪(无列表页) |
| 表单页 61 项 | ⬛ 裁剪(无表单页) |
| 详情页 9 项 | ⬛ 裁剪 |
| 路由定义 4 项 | ✅ §8 |
| 全局一致性(共享组件/主题/i18n/响应式) | ✅ §9 |
| 版本与变更记录 | ✅ §12 |
| 占位符残留 | ✅ 无 |

## 12. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档初始版:按现有实现归档计时控制台(顶栏会话三态/到站播报/时间线 PID/时钟面/底部操作栏/快捷键/告警设置面板宿主/保存记录/配对 Dialog);分册 7 项确认以实现为准;记录时钟面重置不经历指令中转的实现差异注记(§2.4) |
