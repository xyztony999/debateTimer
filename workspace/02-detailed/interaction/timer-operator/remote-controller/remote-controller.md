# 计时操作员 · 遥控器布局(竖屏) PageSpec

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定(逆向归档:按现有实现如实归档) |
| 最后更新 | 2026-11-11 |
| 模块编码 | C-02-04 远程遥控(瘦遥控指令面)+ C-02-03 设备配对(配对 Dialog)+ 布局归属 C-01-08(竖屏自动切换,FL §2.1.1.2「遥控器」菜单) |
| 上游依据 | 《C-02 大屏同步与远程控制 API 设计》v1.0(API-3 指令/API-4 信令/API-9 配对/409 让位语义)、FL v1.0 §2.1.1.2、AA v1.0 §2.1.2.3–2.1.2.4 |
| 用户类型 | 计时操作员 |
| 页面类型 | `code`(实时遥控+自适应布局分支;非列表/表单/详情) |
| 实现锚点 | `src/TimerControlPage.jsx:51-72`(RemoteClock)、`:104-105`(断点)、`:138-154`(fire 指令包装)、`:564-737`(遥控器布局分支)、`:501-561`(配对 Dialog)、`src/timer/timer-control.css`(rm-* 类)、`src/timer/useTimerSessionSync.js`(remoteMode/rtcState/detect) |

> **文档性质(逆向归档)**:遥控器布局**不是独立路由**,而是 `/`(计时控制台)在竖屏手机上的自动布局分支——同一 `useDebateTimer` 运行时、同一页面组件(`src/TimerControlPage.jsx:74-80` 文件头注释「Phones in portrait (≤600px) get the C-01-08 remote layout — same runtime, thumb-first presentation」)。分册 7 项交互确认以现有实现为准(§1.3)。

## 1. 模块元信息

### 1.1 进入路径(三种)

| 路径 | 触发 | 出处 |
|------|------|------|
| 直接以主机身份开赛 | 登录后访问 `/`,竖屏手机自动进入遥控器布局;再经顶栏「开启远程控制」成为主机或遥控会话 | `:104-105,402-411` |
| 配对码接入 | 顶栏更多菜单「连接电脑」→ 配对 Dialog 输主机 4 位码 → `POST /api/session/pair` → 直入遥控模式 | `:456-460,501-561`;C-02 API-9 |
| 同网探测直连 | 打开配对 Dialog 时探测本模板活跃会话 →「检测到会话:<名>」Alert →「直接连接」按钮 | `:510-528`;C-02 API §4.3 探测子流程 |

### 1.2 断点与运行时

- 分支判据:`useMediaQuery('(max-width:600px) and (orientation: portrait)')`(`src/TimerControlPage.jsx:105`);转横屏/加宽窗口即回到桌面控制台布局(同页热切换,无路由跳转)。
- `remoteMode` 为真时所有操作经 `fire` 包装转发指令(`:138-154`);`readOnly = following && !remoteMode`(跟随他人的遥控器时只读,`:137`)。
- 传输通道:`remoteMode` 下 `sendRemoteCommand` 优先 P2P 直连(WebRTC DataChannel,信令经 C-02 API-4 透传,3s 握手超时回退服务器中转);顶栏 Chip 实时显示「遥控中 · 直连/中转」(`rtcState==='open'`,`:377-380`)。

### 1.3 交互确认记录(7 项,以实现为准)

| # | 确认项 | 结论 |
|---|--------|------|
| 1 | 元信息 | C-02-04 遥控面,`/` 竖屏分支,`code` 型 |
| 2 | 查询条件 | 裁剪(无查询) |
| 3 | 表格列 | 裁剪(阶段横滑时间线非表格) |
| 4 | operList | 无后端 operList;按钮可见性由相位(running/locked)+通道态(remoteMode/readOnly)派生 |
| 5 | 表单分组 | 唯一表单=配对 Dialog(1 字段,Dialog 形态) |
| 6 | 详情 Card | 裁剪 |
| 7 | 页面类型覆盖 | `code` 覆盖成立(竖屏自适应+指令中转+直连回退) |

## 2. 页面结构(竖屏分支,自上而下)

容器:`maxWidth="sm"` 纵向 flex,`minHeight: calc(100dvh - 64px)`(`:566-575`);页面底部仅留 `env(safe-area-inset-bottom)`(桌面分支的 96px 底栏预留不适用,`:315-317`)。**桌面分支的固定底部操作栏在遥控布局不渲染**(`!isRemote` 条件,`:813`)。

### 2.1 区块分解

| 区块 | 类名 | 出处 | 说明 |
|------|------|------|------|
| B0 顶栏 | 同控制台 AppBar | `:320-427` | 完整保留(保存/配对码/会话三态/帮助/更多);遥控态 Chip 显示通道 |
| B1 钟条 | `.rm-clocks`(+`--single`) | `:576-601` | RemoteClock ×1/2 |
| B2 阶段名 | `h2`(subtitle1 居中) | `:603-609` | 当前阶段多语言名 |
| B3 语境行 | `contextRow` | `:283-301` | 声测试听/自动推进提示(与桌面共用) |
| B4 主操作区 | `.rm-main` | `:612-734` | 拇指大按钮组(按模式分派,§2.3) |
| B5 时间线 | `.stage-timeline`(横滑) | `:229-281,736` | 与桌面同一组件,置于页尾 |
| B6 会话通知 | fixed Alert(bottom:24px) | `:874-887` | 同控制台 |

### 2.2 RemoteClock 组件(钟条)

`src/TimerControlPage.jsx:51-72`,纯展示:

| 要素 | 规则 |
|------|------|
| 头行 | `.rm-badge`(正/反徽标)+ 队名;**单计时模式 badge 省略、标题=当前阶段名**(`:594-599`) |
| 时间 | `formatTime(grace 相 ? graceLeft : remaining)`(与 TimerBox 同源读数 liveSides) |
| 状态类 | `--locked`/`--grace`/`--warn`(闪烁窗口同引擎 derived) |
| 活动高亮 | `.rm-clock--live`:双计时+free 模式下 `activeSide` 对应钟(`:308-308,584,591`;单钟无 live) |

- 钟数规则:`remoteShowDual = derived.isDual`;双计时/free → 正反两钟;单计时 → 单钟(`:304-306`)。

### 2.3 B4 主操作区(按计时模式分派)

| 模式 | 结构 | 按钮文案(中文实测) | 禁用条件 | 出处 |
|------|------|--------------------|---------|------|
| free 自由辩论 | 两个大按钮并排(`rm-side-row`)+ 锁定注记 + 两个重置小按钮(`rm-reset-row`) | 运行中:「⏸ 正方发言中/反方发言中」;停止:「▶ 点按开始」 | 大按钮:`readOnly || 该侧 phase==='locked'`;重置:`readOnly || 该侧 running` | `:618-665` |
| double 双计时 | 同 free 结构(无锁定注记) | 「⏸ 暂停 · 正 / ▶ 启动 · 正」(反方同构) | 同上 | `:666-710` |
| single 单计时 | 单一主按钮(`rm-master-btn`,全宽)+ 单重置按钮 | 「⏸ 暂停 / ▶ 启动」;「↺ 重置」 | 主按钮:`readOnly || locked`;重置:`readOnly || running` | `:711-733` |

- 运行高亮:`.rm-big-btn--live`(运行中侧,`:623,632,671,680,715`)。
- free 锁定注记:`.rm-locked-note`(role=status)「自由辩论环节已结束」(`:644-646`)。
- 跟随只读:B4 顶部显示蓝色「正在跟随遥控器」(role=status),全部按钮 disabled(`:613-617`)。

### 2.4 B5 阶段横滑时间线

与桌面完全同一渲染(`stageTimeline` 变量复用,`:736`):tab 胶囊+当前站图标+换乘站态+PID 线色;点击 `fire.applyStage`;切换后滚动居中;细节见 [../timer-console/timer-console.md](../timer-console/timer-console.md) §2.3。

## 3. Action 定义(遥控指令面)

### 3.1 指令映射(fire 包装,`src/TimerControlPage.jsx:138-154`)

| 交互 | remoteMode 指令帧 | 本地模式动作 |
|------|------------------|-------------|
| 正方启停 | `{type:'toggle', side:'aff'}` | actions.toggleAff |
| 反方启停 | `{type:'toggle', side:'neg'}` | actions.toggleNeg |
| 单钟启停 | `{type:'toggle', side:'single'}` | actions.toggleSingle |
| 正/反/单重置 | `{type:'reset', side:…}` | actions.reset* |
| 切阶段 | `{type:'applyStage', stageId}` | actions.applyStage |
| 声测试听 | `{type:'soundCheck', kind:'warn30'\|'end'}` | actions.soundCheck* |

- 指令链路:`POST /api/configurations/:name/session/command`(C-02 API-3,type 白名单+side/stageId/kind 校验;缓冲 ≤32,满则 429)或 P2P DataChannel 直发;两种来源序号并入同一 `commandSeq` 单调空间,主机按序号去重(C-02 API §4.4.4、P-01 PC-3)。
- **ack 语义**:无独立 ack——主机执行后的下一个回流快照即确认;遥控端视图经快照流(SSE state 帧/直连帧)刷新,指令不本地驱动引擎(`:135-136` 注释 C-02-07)。

### 3.2 配对 Dialog(C-02-03)

| 元素 | 组件/规则 | 出处 |
|------|----------|------|
| 打开入口 | 更多菜单「连接电脑」(仅 remoteMode 渲染该菜单项) | `:456-460` |
| 会话探测 | 打开即 `probeForPairingDialog()`;发现本模板活跃会话 → success Alert「检测到会话:<名>」+「直接连接」按钮(`startRemoteMode(detectedSession)`) | `:91-103,510-528` |
| 配对码输入 | TextField:自动过滤非数字、截断 4 位;`inputMode='numeric'`;错误时 helperText | `:532-541` |
| 提交 | 按钮 `disabled = 输入≠4 位`;`pairWithCode(code)` → `POST /api/session/pair`;成功关 Dialog;失败显示 `result.message \|\| t('timer.session.pairFailed')`(404「未找到匹配的远程控制会话」/400 非 4 位) | `:545-559`;C-02 API-9 |
| 提示文案 | 「输入电脑端「远程控制中」旁显示的 4 位配对码」 | `:529-531`;zh-Hans.json session.pairHint |

- 配对仲裁:owner-scoped——只可能命中**本人**活跃会话,跨用户码必不命中 404(C-02 API §4.4.8)。

### 3.3 接管与让位

| 场景 | UI | 行为 |
|------|----|------|
| 手机打开时主机已在控 | 顶栏 Chip「正在跟随遥控器」+「⇄ 接管」按钮 | `takeoverSession`:采纳在席快照+以在席 sessionId 恢复上报;原控制端(主机)下次上报被 409 `session_taken` 判让位(C-02 API §4.3 接管子流程) |
| 本端被顶替 | 通知条「另一设备正在控制,已停止本机上报」 | yield:清会话、停止上报、**不自愈、不自动保存**(C-02 API §4.4.3 失败处置) |
| 遥控失联 | 通知条「遥控失联,已回退本地计时」(`session.remoteLost`) | P2P 失败已回退中转;中转亦不可达时回退本地视图 |

## 4. 状态与提示

- 会话态/相位/通知条语义与控制台一致,见 [../timer-console/timer-console.md](../timer-console/timer-console.md) §4(不重复);遥控布局差异仅两处:通知条 bottom=24px;时钟状态类换用 rm-* 同名修饰。
- 通道态呈现:顶栏 Chip「遥控中 · 直连/中转」(`rtcState`);弱信号(连续上报失败 ≥2)由主机侧 Chip「信号弱」表达——遥控端经快照流看到的是主机视角。

## 5. 快捷键定义

- 竖屏遥控器为触屏面,不注册键盘快捷键差异——与控制台共用同一 hook(`:156-187`),但手机软键盘/无物理键盘场景实际不触发;行为与守卫同控制台(见 timer-console §5),`enabled=!following` 同样生效。

## 6. 数据源与接口引用

| 数据/动作 | 来源 | 契约归属 |
|----------|------|---------|
| 视图状态(钟条/时间线) | 快照流:display SSE `GET /api/display/:token/stream` state 帧 或 P2P DataChannel 帧;初始 `GET /api/display/:token/state` 校准 | C-02 API-7/8 |
| 配对发现 | 探测(直连)+ `POST /api/session/pair` | C-02 API-9 |
| 指令上行 | `POST …/session/command` / WebRTC DataChannel | C-02 API-3/API-4 |
| 接管 | 采纳在席快照+在席 sessionId 上报(不新建会话) | C-02 API §4.3 |
| 配置跟随 | display 流 `change` 帧 → 模板重载 | S-02 CFG-STREAM 契约,C-02 §4.5 借道 |

## 7. 字典 Key / 枚举 / 国际化清单

- 枚举引用(不重复定义):command type / command side / soundCheck kind(C-02 API §3.4);stageMode/phase(C-01 API §3.4)。
- 本页专属 i18n 键:`timer.remote.affSpeaking`(正方发言中)/`timer.remote.pressToStart`(点按开始)/`timer.session.remoteMode|directLink|viaServer|connectPC|pairTitle|pairHint|pairCode|pairSubmit|pairFailed|pairOk|directConnect|detected`、`common.cancel`(zh-Hans.json:33-64)。

## 8. 路由定义

无独立路由(裁剪说明):复用 `/`(ProtectedRoute);进入依赖设备视口(竖屏 ≤600px)+配对/探测会话态,非 URL 导航。

## 9. 全局一致性

- 与控制台共用:运行时/时间线/语境行/通知条/配对 Dialog/顶栏;差异集中于钟条组件(RemoteClock vs TimerBox)与操作区形态(拇指按钮 vs 底栏+时钟面按钮)。
- 「手机即遥控器」原则:指令不丢(离线缓冲+直连回退)、不重(commandSeq 去重)、不双主机(409 让位)——UI 三处落点:配对 Dialog(§3.2)、接管按钮(§3.3)、让位通知(§4)。
- 触屏适老:主按钮高 `.rm-big-btn`、重置行次级;安全区 bottom 适配全面屏(`:314-317`)。

## 10. 裁剪说明

| 分册章节 | 处置 |
|---------|------|
| 列表页/表单页/详情页 | 裁剪(配对 Dialog 为唯一表单形态,<5 字段) |
| 路由定义 | 裁剪为说明(无独立路由,§8) |
| 分步表单/币种/下拉数据源 | 裁剪 |

## 11. 质量自检(FX 对照裁剪版)

| 项 | 结果 |
|----|------|
| 元信息/进入路径/断点 | ✅ §1 |
| Action 定义(指令映射+ack 语义+配对+接管让位) | ✅ §3 |
| 状态提示 | ✅ §4(引用控制台 §4 不重复) |
| 快捷键 | ✅ §5(如实:触屏场景共用 hook,无独立键面) |
| 数据源引用 | ✅ §6 |
| 字典/枚举/i18n | ✅ §7 |
| 全局一致性 | ✅ §9 |
| 版本与变更记录 | ✅ §12 |
| 占位符残留 | ✅ 无 |

## 12. 更新记录

| 版本 | 日期 | 变更类型 | 更新说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档初始版:竖屏遥控布局(RemoteClock 钟条/三模式拇指操作区/横滑时间线)、fire 指令映射与 ack 语义、配对 Dialog(探测+4 位码)、接管与 409 让位交互;声明无独立路由(同页分支) |
