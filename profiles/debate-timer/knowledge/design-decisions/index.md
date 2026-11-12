<!-- kb-generated: 2026-11-11 | sources: 8 | assumptions: 0 | open: 0 -->

# 设计决策（design-decisions）

> 逆向归档：重大设计决策史，从 README.md、`src/timer/` 代码注释与 profile 工作区
> （`workspace/INDEX.md` 模块记录、`workspace/02-detailed/` PRD/API 文档）提炼，**不依赖 git**。
> 决策编号两套：**R 系列**=模块迭代（R4/R9…R17，见 profile 工作区 INDEX.md modules）；
> **D 系列**=PageSpec 内设计决策号（D20~D39，带 §章节号）。

## 索引结构

| 节 | 内容 |
|----|------|
| §1 决策时间线 | R 系列模块迭代一览（背景→交付） |
| §2 重大决策 ADR | 六项标志性决策：背景/决策/影响（本节重点） |
| §3 同步与时钟域决策 | D20~D39 速览表（快照/仲裁/自愈/对齐/真值层） |
| §4 工程与工具链决策 | CRA→Vite、Bun、MUI、i18next、MongoDB、双分支部署 |
| §5 编号对照 | D 编号→出处章节；R 编号→模块名 |

## 1. 决策时间线（R 系列，profile 工作区 INDEX.md）

| # | 模块 | 一句话结论 |
|---|------|-----------|
| 首期 | realtime-sync-free-debate | SSE 会话广播 + 控制会话 + 自由辩论自动切换（C1–C9） |
| A/B/C/D 包 | stage-enhancements / match-records / template-gallery / pwa-mobile | 宽限+告警+队名+自动推进；记录复盘；模板广场；PWA 离线 |
| R4 | r4-no-auto-dialog | 移除自动发现弹窗，改配对内发现 + 双角色静默恢复（localStorage 角色记忆） |
| R5-R8 | pid-timeline v1-v3 / stage-announce | 大屏时间线地铁 PID 化三代演进 + 到站播报 |
| R9 | display-sync-fix | 大屏延时根修：快照盖 serverTime + 在途补偿 + 心跳 2s→1s（D20-D22） |
| R10 | session-generation | 会话代际自愈：快照信封带 sessionId + 换代重置去重 + 心跳 10s→30s + SW controllerchange 重载（D23-D25） |
| R11 | session-self-heal | 主机会话自愈：可恢复 400 自动重建会话（互斥+5s 退避+3 次上限）（D26-D28） |
| R12 | session-arbitration | 会话主权仲裁：409 `session_taken` 让位，终结跨端 seq-400 无限循环（D29-D31） |
| R13 | clock-alignment | 端到端 NTP-lite 对齐：上行前移+双端钟差 EMA+平滑采纳+floor→round 根修（D32-D35） |
| R14 | clock-truth-layer | 计时引擎真值层：余数累积+Worker 心拍+锚点渲染+观察者对账（D36-D39，R13 打回重做后的根修） |
| R15-R17 | admin-edit-fixes / records-style / logo-rebrand | 管理页深链修复；记录页样式对齐；品牌图标 |
| 债批1 | debt-batch-1 | 数据备份（NDJSON 14 天轮换）+ Playwright E2E + **useDebateTimer 拆分** |

## 2. 重大决策 ADR（背景/决策/影响）

### ADR-1 计时引擎真值层（R14，D36-D39）

- **背景**：实测主机每秒慢 ~250ms——引擎逐拍 `floor()` 把间隔抖动的亚秒部分静默丢掉，
  累积成真实漂移，主机本身成了大屏所镜像的漂移源（`src/timer/engine.js:185-189` D36 注释）。
- **决策**：四层根修——① `tickRemainderMs` 余数跨拍累积（engine.js:49,185-200）；
  ② 250ms 心拍移入专用 Worker，豁免后台标签页 ~1/min 限流（`src/timer/tickWorker.js` D37）；
  ③ 墙钟锚点真值层 `{running, endAt, frozenMs}`：显式动作重置锚（`clockAnchors.js`），
  渲染数字从锚外推（useDebateTimer.js:64-80 D38）；④ 观察者：引擎翻转（自由辩论换边/零点锁定）
  补锚 + 锚↔引擎偏差 >1.5s 以引擎结构为准重锚（useDebateTimer.js:217-235 D39）。
- **影响**：死线漂移 +1024ms/4s → +51~99ms/8s；双端数字 12/12 一致；引擎整秒语义
  （事件/锁定）保持权威，毫秒真值只在锚层。

### ADR-2 会话主权仲裁 409（R12，D29-D31）

- **背景**：同 token 重开会话会顶掉旧席；输家继续 PUT 打进赢家会话，报 seq-400，
  R11 自愈不认此分支 → 无限 400 循环。
- **决策**：上报携带 `sessionId`，服务端不符即回 **409 `session_taken`**（不带 id 保持旧行为兼容旧客户端）
  （`server/lib/timerSessions.js:166-179`）；客户端 409 → 让位终态（不恢复、不存记录、
  i18n 三语提示），起点/recover/takeover/reclaim 四处构建点全带 sessionId，
  另加 startingRef 双击守卫（`src/timer/useTimerSessionSync.js:67,226`）。
- **影响**：跨端冲突从「无限重试战争」变「一次仲裁和平让位」；失败动作集中映射在
  `src/timer/snapshotReporting.js:28-29`。

### ADR-3 WebRTC 直连，失败回退服务器中转（p2p-remote）

- **背景**：跨国场景遥控指令经服务器中转延迟高；但跨网络打洞需 STUN/TURN，运维成本高。
- **决策**：仅**同网 host 候选**直连（`iceServers: []`，无 STUN/TURN），信令帧搭既有会话通道
  （POST /session/signal + SSE `signal` 事件）；3s 握手超时，未开即静默回退中转，
  `open()` resolve null——一切降级优雅（`src/timer/rtcChannel.js:1-22`）。
- **影响**：同网零中转延迟，跨网自动回退零劣化；直连快照副本与中转帧双来源采纳需守卫
  （直连帧无 serverTime，补偿直通，`src/timer/snapshotCodec.js:20-21`）。

### ADR-4 快照含 serverTime + 在途补偿（R9/D20-D22，深化于 R13）

- **背景**：大屏延时的根因之一是快照无时间戳——大屏只能采纳「捕获时刻」的钟位，
  加 2s 心跳硬覆盖造成周期性回拉。
- **决策**：服务端**出口盖戳**（重放/GET state/SSE 广播三路全盖，`server/lib/timerSessions.js:29-33` D20/D23）；
  客户端纯函数 `compensateInFlight` 按 `now − serverTime − skew` 前移运行中的钟，
  clamp 3s（`src/timer/snapshotCodec.js:11-45` D21）；心跳 1s（D22）。
  R13 深化：采纳量化 floor→round（floor 使任何 lag>0 都把大屏压小 1 秒，持续 −1 漂移，
  snapshotCodec.js:90 D35）；服务端再按上行在途前移（captureServerAt，clamp 2s，
  timerSessions.js:180-200 D32）。
- **影响**：冒烟 lag 28-50ms；操作→大屏呈现 ≤1s 目标达成；补偿只动 running 钟，
  直连帧缺章直通。

### ADR-5 提示音 MP3 化（pairing-and-fixes FB-A）

- **背景**：四个提示音 WAV 各 ~500KB，跨国下载 2-3s，首次告警延迟不可接受。
- **决策**：转码 MP3 单声道 64kbps（合计 ~46KB，实测 `src/resources/*.mp3` =
  chime 6103 + notify 11365 + split 24493 + timeup 5267 B），保留 `warmupSounds` 预载
  （`src/services/soundPrefs.js:1-13`）；不做 Web Audio 缓冲层（prd/pairing-and-fixes.md §1）。
- **影响**：音频加载提速约 10 倍；告警节点（30s/时间到/必须停）铃声方案与音量仍本设备配置。

### ADR-6 拆分 hooks 架构（debt-batch-1）

- **背景**：useDebateTimer 膨胀到 1354 行，计时/会话/采集三域耦合，E2E 与单测难维护。
- **决策**：会话域整体搬移为 `useTimerSessionSync`（901 行），以**同名解构 ctx** 接收跨域依赖，
  函数体为逐字搬移（`src/timer/useTimerSessionSync.js:21-39` 头注与解构）；主机只留组装层（515 行），
  页面只渲染；`useDebateConfig` 独立为纯数据 hook（配置 SSE + 指纹去重，`src/timer/useDebateConfig.js:36-44`）。
- **影响**：E2E 当场抓住两处拆分缺陷（丢失 refs 声明、裸 status 早退）修复后 136 单测+8 E2E 全绿；
  SSE 连接收敛为每主机标签页 1 条（command/signal 搭配置流，useDebateTimer.js:41-44）。

### ADR-7 控制端权威计时，会话存内存不落库（api-timer-session §1.3）

- **背景**：服务端跑 tick 任务会引入无状态集群复杂度；会话生命周期仅一场比赛（分钟级）。
- **决策**：D-2 控制端权威计时，服务端只中转+缓存；D-5 会话存进程内存 Map（`server/lib/timerSessions.js`），
  进程重启即失效，**不写 MongoDB**；D-1 寻址键沿用配置 shareToken；D-6 复用既有 display SSE 流加事件类型，不新开连接。
- **影响**：服务端零 tick、零会话持久化；重启后果由 R10 代际自愈 + R11 主机自愈兜底。

### ADR-8 双模遥控，否决纯瘦遥控（remote-command）

- **背景**：纯瘦遥控（状态全在服务器）违反离线可用 NFR 且无体积收益（架构探讨结论，2026-10-12）。
- **决策**：双模——遥控端发正交指令（start/stop/reset/toggle+side，队列 32）经服务器中转，
  主机执行后快照回流；同网再叠加 ADR-3 直连副本。TICK 带时间戳 catch-up（限幅 300ms）。
- **影响**：遥控器离线仍可看本地计时；指令通道与快照通道正交，主机单 SSE 承载。

## 3. 同步与时钟域决策速览（D20~D39）

| D# | 决策 | 落点 |
|----|------|------|
| D20/D23/D25 | 快照出口盖 serverTime；信封带 sessionId（代际守卫）；心跳/限流参数 | timerSessions.js:29-33、useTimerSessionSync.js:59-61 |
| D21/D22 | 在途补偿 clamp 3s；心跳 1s | snapshotCodec.js:11 |
| D24 | SW controllerchange 自动重载（常开大屏拿新代码） | `src/index.jsx:11`（D25 autoUpdate + injectRegister null） |
| D26-D28 | 可恢复 400 自愈：互斥+退避+3 次上限+引用比对防竞态 | useTimerSessionSync.js:62-66 |
| D29-D31 | 409 主权仲裁；双击守卫 | timerSessions.js:166、useTimerSessionSync.js:67 |
| D32-D35 | captureServerAt 上行前移；主机/消费端钟差 EMA；平滑采纳；floor→round | timerSessions.js:180、snapshotCodec.js:90 |
| D36-D39 | 余数累积；Worker 心拍；锚点真值渲染；观察者对账 | engine.js:49、tickWorker.js、useDebateTimer.js:64,217 |

## 4. 工程与工具链决策（沿用初始知识库，已核对现行 package.json）

| 决策 | 结论 | 理由 |
|------|------|------|
| 构建 | CRA → Vite 迁移 | CRA 官方弃用（README §开头）；vite.config.js 另含 SPA 404 fallback 与 PWA 插件 |
| 工具链 | Bun（install/test/脚本） | 包管理+测试运行一体；`bun test src/ server/`（package.json scripts） |
| UI | MUI v9 + emotion | 组件体系 + 主题（含暗色跟随系统+手动记忆） |
| i18n | i18next + 浏览器语言检测 | zh-Hans/en/fr-CA 三语（`src/locales/`）；阶段名可分别填多语言文案 |
| 模板存储 | 自建 MongoDB API（server/） | 计时页/设置页同步；批量导入脚本 + 预置赛制 |
| 部署 | GitHub Actions 双分支 | master=主程序；deploy/production=静态版（deploy.yml branches: [deploy/production]） |

## 5. 编号对照

- **D 系列出处**：§15（D20-D22 大屏同步）、§16（D23-D25 代际）、§17（D26-D28 自愈）、
  §18（D29-D31 仲裁）、§19（D32-D35 对齐）、§20（D36-D39 真值层）——对应
  `workspace/02-detailed/interaction/` C-02 PageSpec 各版本章节。
- **R 系列**：见 §1 时间线；R1-R3 为早期真机反馈包（R3 = pairing-and-fixes：配对码+MP3+单钟）。
- 工程债首批（debt-batch-1）含 webhook 核查/备份/E2E/拆分四项，ADR-6 为其拆分部分。
