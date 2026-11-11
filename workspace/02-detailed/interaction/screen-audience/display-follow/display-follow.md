# 大屏观众 · 大屏跟随页 PageSpec

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定(逆向归档:按现有实现如实归档) |
| 最后更新 | 2026-11-11 |
| 模块编码 | C-02-02 大屏跟随呈现(只读镜像/断线重连/回退)+ C-01-04 告警的呈现侧(FL §2.5.1.1 备注「含 C-01-04 告警的呈现侧」) |
| 上游依据 | 《C-02 大屏同步与远程控制 API 设计》v1.0(API-6/7/8 display 三端点+SSE 事件协议+display 限流)、《C-01 比赛计时 API 设计》v1.0(相位机/闪烁窗口/告警节点)、FL v1.0 §2.5、AA v1.0 §2.1.2.2 |
| 用户类型 | 大屏观众(匿名,无需登录) |
| 页面类型 | `hybrid`(跟随态=只读镜像;无活跃会话回退=可操作独立计时页) |
| 实现锚点 | `src/TimerDisplayPage.jsx`(217 行)、`src/components/TimerBox.jsx`(variant display)、`src/components/SoundSettingsPanel.jsx`、`src/timer/display.css`、`src/timer/useDebateTimer.js`(shareToken 分支)、`server/routes/display.js`(匿名面) |

> **文档性质(逆向归档)**:按现有实现如实归档;分册 Step 4 的 7 项交互确认以现有实现为准(§1.3)。大屏页为**轻量独立页**:无 MUI 布局框架、无导航 chrome(`src/TimerDisplayPage.jsx:13-17` 文件头注释),适配投影大屏常开场景(P-03 PS-2:display 页常开数日)。

## 1. 模块元信息

### 1.1 页面定位

| 项 | 值 |
|----|----|
| 路由 | `/display/:token`(公开,无 ProtectedRoute,`src/App.jsx:27`) |
| 守卫 | 服务端可见性:`shareEnabled && shareToken` 且 token 存在,否则 display 三端点统一 404「Display link not found」→ 前端 StatusPage(C-02 API §4.4.7 findShared) |
| 限流 | display 面 60 次/分/IP,SSE 长连接仅建立时计一次(P-02 L3/PP-3) |
| 匿名面 ACL | 大屏配置投影不含 ownerId/shareToken/shareEnabled(C-02 API API-6) |
| 入口 | ① 控制台顶栏 🔗 复制大屏链接;② 分享/投影打开 |

### 1.2 数据流(跟随/回退两态)

经 `useDebateTimer({ shareToken: token })` 进入跟随分支(`src/TimerDisplayPage.jsx:25-34`):

| 环节 | 行为 | 契约 |
|------|------|------|
| 初始校准 | `GET /api/display/:token`(配置投影)+ `GET /api/display/:token/state`(无活跃会话 `{active:false}`;有则 `active:true+snapshot`) | C-02 API-6/7 |
| 实时跟随 | SSE `GET /api/display/:token/stream`:订阅即重放当前快照(state 帧,打新 serverTime 戳);持续接收 state/session/command/signal/change 五事件 | C-02 API-8、§4.5 |
| 配置跟随 | `change` 帧(同流)驱动模板重载——队名/阶段/PID 变更即时反映 | S-02 §4.5 借道(C-02 API §4.4.7) |
| 断线恢复 | EventSource 原生重连 + 每次连上重新 `GET state` 校准(服务端无周期心跳帧,P-01:连接即 `: connected` 注释帧) | C-02 API §4.4.7 |
| 回退 | `session` 帧 ended/expired(原因 superseded/closed_by_operator/share_disabled/heartbeat_timeout)→ `displayBanner='ended'` → 键盘/按钮启用,转为**独立计时页**(本地引擎继续) | C-02 API §4.2 生命周期 |

### 1.3 交互确认记录(7 项,以实现为准)

| # | 确认项 | 结论 |
|---|--------|------|
| 1 | 元信息 | C-02-02,`/display/:token` 公开,hybrid(跟随只读/回退可操作) |
| 2 | 查询条件 | 裁剪(无查询;token 为路径参数) |
| 3 | 表格列 | 裁剪 |
| 4 | operList | 无后端 operList;跟随态全按钮只读,回退态启用本机操作 |
| 5 | 表单分组 | 裁剪(告警面板为设备本地面板,§2.2) |
| 6 | 详情 Card | 裁剪 |
| 7 | 页面类型覆盖 | `hybrid` 覆盖成立(只读跟随+回退独立计时) |

## 2. 页面结构

根 `.dt-display`(display.css,深色投影友好);布局:顶栏 → (可选告警面板)→ 主区。

### 2.1 区块分解

| 区块 | 类名/组件 | 出处 | 说明 |
|------|----------|------|------|
| B1 顶栏 | `.dt-bar` | `:122-143` | 横幅+语言+告警开关+全屏 |
| B2 告警面板 | `.dt-sound-panel` | `:145-149` | SoundSettingsPanel(折叠面板) |
| B3 主区 | `.dt-main` | `:151-214` | 阶段名+时钟+注记 |
| 加载/错误 | null / StatusPage | `:104-109` | loading 渲染 null;missing/error 渲染 StatusPage(variant=display,对应 404) |

### 2.2 B1 顶栏元素

| 元素 | 组件 | 行为 | 出处 |
|------|------|------|------|
| 状态横幅 | `.dt-banner`(role=status) | 三态:following「正在大屏跟随」/ weak「信号弱」/ ended「同步已结束,已切换为独立计时」;无横幅态为空壳 | `:114-118,123` |
| 语言切换 | LanguageSwitcher | 观众切换阶段名/界面语言(本机) | `:125` |
| 🔊 告警设置开关 | dt-icon-btn(title=`t('settings.soundTitle')`) | 开/关折叠 `.dt-sound-panel`;大屏本机即告警呈现设备,偏好存本机 | `:126-133,145-149` |
| ⛶/⤡ 全屏 | dt-icon-btn | `toggleFullscreen`:requestFullscreen/exitFullscreen;`fullscreenchange` 同步图标 | `:69-81,134-141` |

### 2.3 B2 告警面板(呈现侧,设备本地)

- 复用 `SoundSettingsPanel`(与计时操作员设置页同一组件):三节点铃声方案/音量/试听 + TTS 开关组,见 [../../timer-operator/timer-console/timer-console.md](../../timer-operator/timer-console/timer-console.md) §3.7 字段表(不重复)。
- 呈现语义:铃声/TTS 由**大屏本机偏好**播放(`playAlert` 读本机 localStorage,`src/services/soundPrefs.js:117-126`);视觉闪烁由引擎 `derived.blinking` 派生、随快照同步(闪烁窗口 30–27s,C-01 API §4.1)——即 BA 附录A「告警提示涉及大屏观众」的呈现侧落点。

### 2.4 B3 主区

| 要素 | 组件/类名 | 规则 | 出处 |
|------|----------|------|------|
| 阶段名 | `.dt-stage-name` | `stageDisplayName`(模板三语名,change 帧重载后跟随) | `:113,152` |
| 时钟 | `TimerBox variant="display"` ×1/2 | 双计时正反两钟(free 模式活动侧 `.tb-active` 高亮);单计时一钟 | `:151-208` |
| 只读覆盖 | `readonly = following` | 跟随态:按钮区替换为「正在大屏跟随」文案;回退态:▶/⏸/↺ 可操作(独立计时) | `:164-165,181-182,197-198`;TimerBox `:53-56` |
| 锁定注记 | `.dt-note--locked`(role=status) | 自由辩论双侧耗尽「自由辩论环节已结束」 | `:210-212` |
| 切阶段提示 | `.dt-note` | 仅回退态显示「← → 切换辩论阶段」(`t('timer.hintStage')`) | `:213` |

## 3. Action 定义

### 3.1 跟随态(只读,主体)

| 交互 | 行为 | 反馈 |
|------|------|------|
| 无(自动跟随) | state 帧整体替换视图;毫秒读数经锚点层平滑(serverTime/sessionId 代际守卫,代际切换重置去重) | 时钟/相位/阶段名/队名锁步同秒翻转(门目标 G1) |
| 🔊 | 开合本机告警面板 | 偏好即改即存本机 |
| ⛶ / F | 全屏切换 | 顶栏图标 ⛶↔⤡ |
| 语言切换 | 本机语言 | 阶段名回落链重算 |

### 3.2 回退态(独立计时页)

会话结束后本机引擎接管,交互等同控制台桌面布局的时钟面+快捷键(见 timer-console §3.1/§3.3/§5):▶/⏸/↺ 按钮、←/→ 切阶段、A/L/Q/O/Space/Shift+R/Shift+Q/O 快捷键(`enabled=!following`,`:36-67`);任意操作取消待推进。回退时横幅常驻提示「同步已结束,已切换为独立计时」。

### 3.3 错误态

token 不可见/不存在(display 404)→ `StatusPage variant="display"`(`:107-109`);本页不提供重试/登录引导(匿名面)。

## 4. 状态与提示

| 状态 | 来源 | 呈现 |
|------|------|------|
| loading | `status==='loading'` | 渲染 null(无骨架) |
| missing/error | display 404/网络错误 | StatusPage |
| following | SSE 活跃 | 横幅「正在大屏跟随」;只读 |
| weak | 连续校准/接收异常 | 横幅「信号弱」(跟随继续,提示降级) |
| ended/expired | session 帧(reason ∈ superseded/closed_by_operator/share_disabled/heartbeat_timeout) | 横幅「同步已结束…」;转独立计时 |
| 相位(running/grace/locked) | 快照 phase 字段(服务端强制 phase⇔grace 一致) | `--warn`/`--grace`/`--locked` 时钟类 + 宽限提示行 |
| free locked | 快照双侧耗尽 | 锁定注记 |

出处:`src/TimerDisplayPage.jsx:104-118,210-212`;C-02 API §4.2/§4.4.10。

## 5. 快捷键定义

| 键 | 条件 | 动作 | 出处 |
|----|------|------|------|
| F(无修饰键) | **任何模式**(跟随态也生效) | 全屏切换;过滤输入型目标 | `:85-102`(本地显示关注点,注释「never forwarded to the session」) |
| 计时快捷键全套 | 仅回退态(`enabled=!following`) | 同控制台 §5 映射与守卫 | `:36-67` |

- 跟随态计时快捷键禁用(BR-5「会话驱动本屏时键盘不驱动」),F 为显式豁免。

## 6. 数据源与接口引用

| 数据 | 来源 | 契约归属 |
|------|------|---------|
| 配置投影(阶段/队名/PID) | `GET /api/display/:token` + change 帧重载 | C-02 API-6(匿名 ACL 投影) |
| 计时快照 | `GET /api/display/:token/state` + SSE state 帧(连接即重放) | C-02 API-7/8、§4.4.10 wire schema |
| 会话生命周期 | SSE session 帧 | C-02 §4.5 |
| command/signal 帧 | display 流亦有投递(大屏不消费,协议透传;消费方为遥控端) | C-02 §4.5 |
| 告警播放资源 | 本地 mp3 + speechSynthesis;偏好本机 localStorage | 设备本地 |
| PWA 壳 | display 页纳入离线壳;SW controllerchange 重载一次防旧 bundle 常驻 | P-03 PS-2 |

## 7. 字典 Key / 枚举 / 国际化清单

- 枚举引用:phase(running/grace/locked)、stageMode(C-01 API §3.4);SSE 事件 type + session reason(C-02 API §3.4);displayBanner 三态 following/weak/ended(前端态,`src/timer/useTimerSessionSync.js:47`)。
- 本页 i18n 键:`timer.display.following|weakSignal|sessionEnded|fullscreen|exitFullscreen`(zh-Hans.json:65-73)、`timer.graceHint`、`timer.free.locked`、`timer.hintStage`、`settings.soundTitle`、`timer.affirmative|negative|affBadge|negBadge`。

## 8. 路由定义

| 路由 | 页面 | 守卫 | 出处 |
|------|------|------|------|
| `/display/:token` | TimerDisplayPage(本页) | 公开(服务端 findShared 可见性) | `src/App.jsx:27` |

- SPA 404 回退配合深链(P-03 §1.5);token 无效由服务端 404 → StatusPage。

## 9. 全局一致性

- **共享组件**:TimerBox 与控制台/遥控器同源(variant 差异);SoundSettingsPanel 三处复用(设置页 Card/大屏弹层;遥控器布局不内嵌)。
- **同一运行时**:`useDebateTimer` 装配,大屏仅以 `shareToken` 进入跟随分支;快照编解码单一实现(防止漂移,C-02 API §4.4.9)。
- **主题**:不走 MUI ThemeProvider(轻量页),深色由 display.css 固定;语言切换仅影响文案与阶段名。
- **告警同步语义**:视觉(闪烁/相位色)随快照锁步;声音随大屏本机偏好——与操作员设备互相独立(C-01-04 设备本地语义)。
- **连接经济性**:大屏恒 1 条 display SSE 流;主机 1 条认证自流(流拓扑 BR-C02-08,C-02 API §4.5)。
- **可访问性**:横幅/锁定注记 role=status;告警面板控件带 aria-label。

## 10. 裁剪说明

| 分册章节 | 处置 |
|---------|------|
| 列表页/表单页/详情页 | 裁剪 |
| 下拉数据源/币种/分步表单 | 裁剪 |
| 路由定义 | 保留(单路由,§8) |

## 11. 质量自检(FX 对照裁剪版)

| 项 | 结果 |
|----|------|
| 元信息(路由/守卫/限流/ACL) | ✅ §1 |
| 数据流(校准/跟随/重连/回退) | ✅ §1.2 |
| 页面结构(顶栏/面板/主区) | ✅ §2 |
| Action(跟随/回退/错误三态) | ✅ §3 |
| 状态提示(横幅三态+相位+加载错误) | ✅ §4 |
| 快捷键(F 豁免+回退态全套) | ✅ §5 |
| 数据源引用 | ✅ §6 |
| 字典/枚举/i18n | ✅ §7 |
| 全局一致性 | ✅ §9 |
| 版本与变更记录 | ✅ §12 |
| 占位符残留 | ✅ 无 |

## 12. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档初始版:大屏跟随页(顶栏横幅三态/告警面板呈现侧/时钟只读镜像/回退独立计时/F 全屏豁免)、display 三端点与 SSE 事件消费映射、匿名 ACL 与限流呈现影响 |
