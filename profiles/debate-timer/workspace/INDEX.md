---
pipeline: []
reference: []
modules:
  - name: onboarding
    title: "接入与知识库冷启动"
    stages:
      requirement: { status: complete, note: "profile 骨架 + README 溯源知识库（2026-09-27）" }
      design: { status: todo, note: "首个模块需求进 /design 后展开" }
  - name: realtime-sync-free-debate
    title: "实时协同计时（控制端↔大屏状态同步）+ 自由辩论自动切换"
    stages:
      requirement: { status: complete, note: "D0 澄清报告（05-reports/2026-10-10-D0-requirement-clarification.md，决策 C1–C9）" }
      design: { status: complete, note: "D1 三文档初始生成 + D2 PRD/领域模型 + D3 api-timer-session + D4 双 PageSpec；Gate 1 PASS（05-reports/2026-10-10-gate1.md）" }
      code: { status: complete, note: "服务端 timerSessions+SSE 扩展+三接口；前端控制会话/跟随模式/自由辩论；lint 0 err / 37 tests / build ✓；Gate 2 WARN-可交付（05-reports/2026-10-10-gate2.md）" }
  - name: stage-enhancements
    title: "赛制增强包：超时宽限 / 提示音自定义 / 队名上屏 / 自动阶段推进"
    stages:
      requirement: { status: complete, note: "D0（05-reports/2026-10-11-D0-bundleA.md，决策 A-C1~C6）" }
      design: { status: complete, note: "D1 变更管理三文档 v1.1 + PRD/领域增量 + api-stage-enhancements（零新端点）+ PageSpec 增量；Gate 1 PASS（05-reports/2026-10-11-gate1-bundleA.md）" }
      code: { status: complete, note: "服务端校验+快照v2；前端宽限/提示音/队名/自动推进；40 tests/lint 0/build ✓；Gate 2 WARN-可交付（05-reports/2026-10-11-gate2-bundleA.md）" }
  - name: match-records
    title: "比赛记录与复盘（S-03：采集/列表/详情/导出/删除）"
    stages:
      requirement: { status: complete, note: "D0（05-reports/2026-10-11-D0-bundleB.md，决策 B-C1~C7）" }
      design: { status: complete, note: "D1 三文档 v1.2（新 L2 赛后复盘）+ PRD + 领域模型 MatchRecord + api-match-records（5 端点+match_logs 集合）+ PageSpec；Gate 1 PASS（05-reports/2026-10-11-gate1-bundleB.md）" }
      code: { status: complete, note: "matchLogs 路由+lib（Mimosa 两项修复：IDOR 联合查询、CSV 移前端 BD-6）；采集/保存/records 页；47 tests/lint 0/build ✓；Gate 2 WARN-可交付（05-reports/2026-10-11-gate2-bundleB.md）" }
  - name: template-gallery
    title: "模板广场（S-04：发布/浏览/复制/下架 + 预置赛制）"
    stages:
      requirement: { status: complete, note: "D0（05-reports/2026-10-11-D0-bundleC.md，决策 C-C1~C7）" }
      design: { status: complete, note: "D1 三文档 v1.3 + PRD + api-template-gallery（4 端点，isPublic 横切视图）+ PageSpec；Gate 1 PASS（05-reports/2026-10-11-gate1-bundleC.md）" }
      code: { status: complete, note: "visibility/gallery 路由（隐私投影+测试断言）+ GalleryPage + 设置页开关 + 管理页下架 + 导入 --public + presets×3；51 tests/lint 0/build ✓；Gate 2 WARN-可交付（05-reports/2026-10-11-gate2-bundleC.md）" }
  - name: pwa-mobile
    title: "PWA 离线 + 手机适配（P-03：应用壳缓存/安装/离线提示 + 触屏优化）"
    stages:
      requirement: { status: complete, note: "合并简报 05-reports/2026-10-11-bundleD-design-brief.md（决策 D-C1~C5）" }
      design: { status: complete, note: "AA v1.4（P-03）+ FL 附录注记；无 API 变更；Gate 1 PASS（简报内联）" }
      code: { status: complete, note: "vite-plugin-pwa（API network-only）+ manifest/图标 + 离线横幅/安装入口 + 触屏 CSS；52 tests/lint 0/build ✓（sw.js 产物）；Gate 2 WARN-可交付（05-reports/2026-10-11-gate2-bundleD.md）" }
  - name: remote-layout
    title: "遥控器专版布局（C-01-08：操作端手机竖屏形态）"
    stages:
      requirement: { status: complete, note: "D0（05-reports/2026-10-12-D0-remote-layout.md，决策 R-C1~R-C4 全推荐项）" }
      design: { status: complete, note: "AA v1.5 + FL v1.4（C-01-08）+ prd/remote-layout + PageSpec C-01-08；API 零变更；Gate 1 PASS（05-reports/2026-10-12-gate1-remote-layout.md）" }
      code: { status: complete, note: "TimerControlPage 遥控器分支（useMediaQuery 竖屏自动）+ RemoteClock + rm- 样式 + 3 i18n key；lint 0/87 tests/build ✓；B3 浏览器验收过（三形态/对切/旋转回落/暗色）；Gate 2 WARN-可交付（05-reports/2026-10-12-gate2-remote-layout.md，真机复验待部署后）" }
  - name: console-follow
    title: "控制台跟随与接管（C-02-06）+ 遥控器间距修正（真机反馈包）"
    stages:
      requirement: { status: complete, note: "D0（05-reports/2026-10-12-D0-console-follow.md，FB-1 修正 + FB-2 联动形态用户确认）" }
      design: { status: complete, note: "AA v1.6（C-02-06）+ FL v1.5 + prd/console-follow + C-02 PageSpec v1.4；API 零变更；Gate 1 PASS（05-reports/2026-10-12-gate1-console-follow.md）" }
      code: { status: complete, note: "useDebateTimer 探测询问化/跟随/接管 + TimerControlPage 弹层与双布局只读态 + 5 i18n key + FB-1 间距；两处缺陷代码内修复（i18n 插值/接管清订阅）；双标签浏览器验收全过（弹层→跟随→镜像→接管→退位）；Gate 2 WARN-可交付（05-reports/2026-10-12-gate2-console-follow.md）" }
  - name: remote-command
    title: "遥控指令通道（C-02-07：双模遥控 + 计时健壮性加固）"
    stages:
      requirement: { status: complete, note: "架构探讨结论（2026-10-12）：否决纯瘦遥控（违反离线 NFR+无体积收益），采用双模（RC-1~RC-4）" }
      design: { status: complete, note: "AA v1.7（C-02-07）+ FL v1.5 + prd/remote-command + api-remote-command（1 端点+SSE command 事件）+ C-02 PageSpec v1.5；Gate 1 PASS（05-reports/2026-10-12-gate1-remote-command.md）" }
      code: { status: complete, note: "服务端指令通道（正交 start/stop/reset/toggle+side，队列32/report 清空）+ 主机端 onCommand 消费 + 遥控端 fire 发送/回流 + 弹层四选 + TICK 时间戳 catch-up（限幅300）/visibility 重锚；97 tests（+10）/lint 0/build ✓；三段链路实证（curl SSE 抓包/主机执行/遥控模式）；Gate 2 WARN-可交付（05-reports/2026-10-12-gate2-remote-command.md，真机复验待部署）；2026-10-14 真机反馈修正：soundCheck(kind) 指令——遥控试铃经主机播放（api v1.1，15 tests）" }
  - name: p2p-remote
    title: "P2P 遥控直连（C-02-08：同网 WebRTC DataChannel，消除跨国延迟）"
    stages:
      requirement: { status: complete, note: "D0（2026-10-14 用户确认：立项 WebRTC 直连 RC2-1、仅同网 host 直连 RC2-2、失败回退 RC2-3）" }
      design: { status: complete, note: "AA v1.8（C-02-08）+ FL v1.6 + prd/p2p-remote + api-p2p-remote（信令端点+SSE signal 事件）+ C-02 PageSpec v1.6；Gate 1 PASS（内联）" }
      code: { status: complete, note: "服务端信令转发（relaySignal+SSE signal 事件）+ rtcChannel 双端封装（early-ICE 缓冲/3s 超时/静默回退）+ hook 集成（直连序号 1e9 空间/双来源 adopt 守卫/快照副本直推）+ 胶囊直连指示；98 tests（+3）/lint 0/build ✓；服务端链路 curl 实证；浏览器端到端联调受 IAB 工具限制未完成（回退设计保证零劣化）；Gate 2 WARN-可交付（05-reports/2026-10-14-gate2-p2p-remote.md）" }
  - name: pairing-and-fixes
    title: "R3 真机反馈包：数字配对码 + mp3 音频 + 单钟区分 + SSE 连接池根因修复"
    stages:
      requirement: { status: complete, note: "用户三项反馈（音频慢/配对入口/单钟不区分）+ D0 确认配对码方案" }
      design: { status: complete, note: "prd/pairing-and-fixes（配对码 owner 匹配/音频 mp3/单钟）；AA/FL 挂 C-02-01 扩展" }
      code: { status: complete, note: "pairingCode+pair 端点（+3 tests）；mp3 转码 46KB（10.7×）；遥控单钟；**SSE 连接池根因修复**（主机 command/signal 迁 owner 流，连接 4→3）——Gate 2 PASS（05-reports/2026-10-14-gate2-pairing-fixes.md），直连+心跳历史 WARN 全闭" }
  - name: pid-timeline
    title: "R5 视觉：比赛流程时间线地铁 PID 化（经典线路图）"
    stages:
      requirement: { status: complete, note: "用户确认经典线路图风格（D0 推荐）" }
      design: { status: complete, note: "C-02 PageSpec v1.9 §14（D1-D5）+ v1.9.1 精化（高亮止于当前站/站名两行）；纯视觉零行为变更" }
      code: { status: complete, note: "st-dot 序号+st-name 结构、::after 半程线段（线 z0 点 z1）、当前站放大脉冲、明暗 CSS 变量双主题、触屏 ≥44px；103 tests/lint 0/build ✓；计算样式断言+视觉判定双轨验收 D1-D5 全过（Gate 2 PASS：05-reports/2026-10-15-gate2-pid-timeline.md）" }
  - name: pid-timeline-v2
    title: "R6 视觉深化：北京粗带 × 港铁换乘环融合"
    stages:
      requirement: { status: complete, note: "D0 用户确认：融合风 / 主题深蓝 / 换乘站按模式切换自动标" }
      design: { status: complete, note: "C-02 PageSpec v2.0 §14 增补（D6-D10）；纯视觉+3 行 JSX" }
      code: { status: complete, note: "7px 粗带+端帽 stub、光环骑线点、换乘大环（modes 差异数据驱动）、当前站脉冲移伪元素+反色胶囊；103 tests/lint 0/build ✓；断言+视觉双轨 D6-D10 全过（Gate 2 PASS：05-reports/2026-10-15-gate2-pid-timeline-v2.md）" }
  - name: pid-timeline-v3
    title: "R7 视觉：港铁现役 PID 原生化（全线一色+已过褪灰+车标+下一站条+换乘胶囊）"
    stages:
      requirement: { status: complete, note: "D0 用户确认：全线一色+已过褪灰 / 主题深蓝 / 车标+下一站条+胶囊（不做站名交替）" }
      design: { status: complete, note: "C-02 PageSpec v2.1 §14 增补（D11-D16）+ i18n 三语 nextStage/terminus；纯视觉+约 12 行 JSX；2026-10-22 增量 v2.9 §21：当前环节语义图标，Gate 1 PASS" }
      code: { status: complete, note: "--st-route 单色贯穿、已过灰环褪灰、未来珠子、当前实心盘+TrainRounded 车标（st-breathe）、.st-next 下一站/终点站条、换乘胶囊 999px；103 tests/lint 0/build ✓；断言+视觉双轨 D11-D16 全过；新坑入档：IAB 过渡冻结需禁 transition 断言（Gate 2 PASS：05-reports/2026-10-15-gate2-pid-timeline-v3.md）" }
      frontend: { status: complete, note: "2026-10-22 增量：StageIcon 映射16个稳定 ID + 模式回退，替换固定火车图标；SSR 40例、128 tests、lint 0 error（15既有warning）、build PASS" }
      validation: { status: complete, note: "2026-10-22-gate2-pid-stage-icons.md；激活链规则与无契约差异核查 PASS" }
    gates:
      gate1: { status: pass, note: "2026-10-22-gate1-pid-stage-icons.md" }
      gate2: { status: pass, note: "2026-10-22-gate2-pid-stage-icons.md" }
  - name: clock-truth-layer
    title: "R14 修复：时钟真值层（引擎漏秒根修+Worker 心拍+锚点渲染——R13 打回重做）"
    stages:
      requirement: { status: complete, note: "D0（2026-10-20 用户打回 R13 选 A）：实测主机每秒慢 ~250ms=引擎逐拍 floor 漏秒，时钟源不准" }
      design: { status: complete, note: "C-02 PageSpec §20 v2.8（D36-D39）；引擎余数+Worker 心拍+锚点真值渲染+观察者对账；Gate 1 PASS（内联）" }
      code: { status: complete, note: "tickRemainderMs 零漏秒（+3 单测）；tickWorker 250ms（回退 setInterval）；锚点层（dispatch 包装置锚+快照真值 ms+liveSides 渲染+state/ref 双轨）；观察者（引擎翻转补锚+1.5s 对账）；死线漂移 +1024ms/4s→+51~99ms/8s、双端数字 12/12 一致；118 tests/lint 0/build ✓；Gate 2 PASS（05-reports/2026-10-20-gate2-clock-truth-layer.md）" }
  - name: clock-alignment
    title: "R13 修复：端到端时钟对齐（NTP-lite——上行校正+双端钟差+平滑采纳）"
    stages:
      requirement: { status: complete, note: "D0（2026-10-20 用户要求秒级严格对齐）：残余=上行在途+设备钟偏移（可达秒级）+每秒硬覆盖回拉" }
      design: { status: complete, note: "C-02 PageSpec §19 v2.7（D32-D35）；报告响应报时/上行前移/双端 EMA 钟差/平滑采纳；Gate 1 PASS（内联）" }
      code: { status: complete, note: "响应报时+report 上行前移（clamp 2s）；主机 offset EMA（RTT/2 采样）+快照 captureServerAt；大屏 skew 稳健 EMA 入 compensateInFlight；平滑采纳（毫秒线+按模式选侧+跳过记 seq）；**深挖：adoptSnapshot floor→round——R9 起任何 lag>0 都把大屏压小 1 秒（持续 -1 漂移实证），round 后采样 10 轮 8 一致 2 翻转边界瞬时±1 无漂移**；负 skew 公式修正（原钳 0 是数学错误）；115 tests(+3)/lint 0/build ✓；Gate 2 PASS（05-reports/2026-10-20-gate2-clock-alignment.md）" }
  - name: session-arbitration
    title: "R12 修复：会话主权仲裁（终结跨端 400 循环）"
    stages:
      requirement: { status: complete, note: "D0（2026-10-20 用户确认单设备+选定服务端仲裁）：重开会话顶掉同 token 旧席，输家 PUT 打进赢家会话报 seq-400，R11 不认此分支→无限循环" }
      design: { status: complete, note: "C-02 PageSpec §18 v2.6（D29-D31）；上报带 sessionId 比对 409 让位+双击守卫；Gate 1 PASS（内联）" }
      code: { status: complete, note: "report() 先比对 body.sessionId（不符→409 code:session_taken，无 id→旧行为，sendError 透传 code）；sessionRef 四处构建点（start/recover/takeover/reclaim）全带 sessionId；409→让位终态（不恢复不存记录+i18n takenByOther 三语）；startingRef 双击守卫；112 tests(+3)/lint 0/build ✓；战争→和平实证：A 开会话→curl 顶位→A 心跳 409 让位（芯片消失不自愈不复活），修复前幽灵阶段（reclaim 漏带 id 被接受为无主权上报）已补齐；Gate 2 PASS（05-reports/2026-10-20-gate2-session-arbitration.md）" }
  - name: session-self-heal
    title: "R11 修复：主机会话自愈（网络切换不再中断远程控制）"
    stages:
      requirement: { status: complete, note: "D0（2026-10-15 用户选定 A）：网络切换>30s→会话被服务端回收→主机上报 400 放弃+存半场记录；需自动重建" }
      design: { status: complete, note: "C-02 PageSpec §17 v2.5（D26-D28）；可恢复 400 自动重建+记录语义+轻提示；服务端零改动；Gate 1 PASS（内联）" }
      code: { status: complete, note: "reportSnapshot 可恢复 400（No active session）→ recoverSession（互斥+5s 退避+3 次上限+sessionRef 引用比对防竞态）→ startSession 重建（同 token，R10 代际让显示/遥控自动重跟随）+配对码/记忆/seqRef 刷新+轻提示；403/404 终态不变；i18n reconnected 三语；109 tests/lint 0/build ✓；浏览器实证：API 重启杀会话→主机自愈（sessionId ac17aeb7→87b52935、seq 55→1、lag 30ms、配对码 6388→2053、无 ended 横幅、比赛记录 0 条）；Gate 2 PASS（05-reports/2026-10-15-gate2-session-self-heal.md）" }
  - name: session-generation
    title: "R10 修复：会话代际自愈（卡旧阶段/后台误杀/常开大屏旧代码）"
    stages:
      requirement: { status: complete, note: "D0（2026-10-15 用户选定 A 全套）：换会话序号不重置→大屏冻结旧阶段；心跳 10s 后台误杀；常开大屏 SW 不重载延时修复到不了" }
      design: { status: complete, note: "C-02 PageSpec §16 v2.4（D23-D25）；快照信封 sessionId+消费端换代重置+心跳 30s+SW controllerchange 重载；Gate 1 PASS（内联）" }
      code: { status: complete, note: "toSnapshot 加 sessionId（三路出口全盖）+ adoptFromSnapshot 换代重置 seqRef + 'started' 事件重置 + heartbeatTimeoutMs 30s + injectRegister null/手动 registerSW/controllerchange 重载；109 tests(+2)/lint 0/build ✓；浏览器换代自愈实证（会话A sound_check 跟随中→重开会话B aff_c1→大屏自动跳新阶段无横幅）；坑：mongod 临时 dbpath 被清需重建+裸 & 子壳随会话退出（后台循环必须 nohup）；Gate 2 PASS（05-reports/2026-10-15-gate2-session-generation.md）" }
  - name: display-sync-fix
    title: "R9 修复：大屏同步延时（快照盖章+在途补偿+心跳 1s）"
    stages:
      requirement: { status: complete, note: "D0（2026-10-15）：大屏不拆出（保留会话三角色，推荐项）；延时根因=快照无时间戳+2s 心跳拉回" }
      design: { status: complete, note: "C-02 PageSpec §15 v2.3（D20-D22）；服务端出口盖章+客户端毫秒线补偿纯函数+心跳 1s；Gate 1 PASS（内联）" }
      code: { status: complete, note: "toSnapshot 出口盖 serverTime（重放/GET state/SSE 广播三路全盖，display.js 改走 snapshotOf）+ compensateInFlight 纯函数（毫秒线补偿、clamp 3s、缺 serverTime 直通）+ 心跳 1s；107 tests(+4)/lint 0/build ✓；冒烟实证：双次投递章各鲜（lag 28-50ms）、SSE 重放帧带章、显示页正常渲染；Mimosa 误报 SSE JSON 为 XSS 一次（JSON.stringify 即 SSE data 的正确编码，改名 frame 后放行）；Gate 2 PASS（05-reports/2026-10-15-gate2-display-sync.md）" }
  - name: stage-announce
    title: "R8 交互：到站播报（当前比赛阶段 XXX）+ 当前站站名折叠修复"
    stages:
      requirement: { status: complete, note: "用户反馈：3/5 号站选中名被截断；删常驻下一站条，改港铁式短暂播报" }
      design: { status: complete, note: "C-02 PageSpec v2.2 §14 增补（D17-D19）；删 nextStage/terminus 键、增 currentStage 三语" }
      code: { status: complete, note: "当前站解除 line-clamp+取消字号放大（截断实证修复）；播报=线带下方固定行（用户选定 B，2.1rem 常驻留白零跳动零遮挡）内 3s 淡出胶囊（React 计时器+animation forwards，aria-live 保留）；.st-next 删除、变量上移 .st-anchor；103 tests/lint 0/build ✓；断言+截图双轨全过（Gate 2 PASS：05-reports/2026-10-15-gate2-stage-announce.md）" }
  - name: r4-no-auto-dialog
    title: "R4 交互修正：移除自动发现弹窗，配对内发现 + 双角色静默恢复"
    stages:
      requirement: { status: complete, note: "用户确认：移除弹窗+配对内发现（推荐项）" }
      design: { status: complete, note: "AA v1.9（C-02-06 描述更新）+ PageSpec v1.8 附记（D1-D4）；零 API 变更" }
      code: { status: complete, note: "移除 pendingSession 弹窗；detectedSession + probeForPairingDialog（弹窗打开时探测）；resumeFromMemories 静默恢复链（selfHost/lastRemote 记忆，localStorage 模块级工具）；直连路径补记忆；103 tests；浏览器验收 D1-D4 全过（Gate 2 PASS：05-reports/2026-10-15-gate2-r4-no-auto-dialog.md）" }
  - name: gallery-ops
    title: "模板生态运营（S-04 扩展：复制计数/搜索排序/可选署名）+ 工程债首批"
    stages:
      requirement: { status: complete, note: "方向讨论定案（2026-10-23）：做生态运营；决策 G-C1~C5" }
      design: { status: complete, note: "合并简报 05-reports/2026-10-23-brief-gallery-ops.md；Gate 1 PASS（内联）" }
      code: { status: complete, note: "copy 端点+q/sort 白名单+creditName（visibility 扩展）；GalleryPage 搜索/排序/署名；限流中间件（gallery 120/display 60 每分，trust proxy 1）；matchCapture sessionStorage 兜底（configKey 指纹恢复）；manualChunks vendor 拆分（主 chunk 555KB→280KB）；134 tests/lint 0 err/build ✓；同批清理 R12-COMMIT.txt（提交门误报拦截，转用户终端提交）" }
  - name: pid-custom
    title: "PID 图标自定义（A 站型/B 站点图标/C 车标/D 线色）+ 配对入口限遥控形态"
    stages:
      requirement: { status: complete, note: "用户反馈×2；四项全选定（2026-10-23），E/F 不做；决策 D-1、P-1~P-5" }
      design: { status: complete, note: "合并简报 05-reports/2026-10-23-brief-pid-custom.md；BA v1.4/AA v2.1/FL v1.8；零新端点；Gate 1 PASS（内联）" }
      code: { status: complete, note: "图标注册表(18)+车标子集(8)+7色板；服务端白名单校验(+1 test 含 echo/404 断言)；设置页阶段弹层+模板卡片；PID 消费(站型覆盖/图标优先级 阶段>车标>语义/线色 --st-route 覆盖)；配对入口限 remoteMode；135 tests/lint 0/build ✓" }
  - name: debt-batch-1
    title: "工程债清偿首批：webhook 核查 / 数据备份 / Playwright E2E / useDebateTimer 拆分"
    stages:
      requirement: { status: complete, note: "用户验收🆗后授权清偿全部余债（2026-10-24）" }
      design: { status: complete, note: "webhook 核查报告（误报+加固）；备份脚本设计（NDJSON+14天轮换+id 键复活）；E2E 策略=前端 only+API mock；拆分=会话域整体搬移 useTimerSessionSync（ctx 同名解构零改写）" }
      code: { status: complete, note: "backup.js(+reviveDeep 测试，修真 bug：任意 24hex 值误转 ObjectId→改 id 型键白名单)；Playwright 3 spec 8 例（gallery 搜索/详情、display 跟随只读/ended 回退、control PID/键盘/配对门控）+e2e.yml；拆分 1354→515+901，E2E 当场抓住两处拆分缺陷（丢失 capture/lastTick refs 声明、裸 status→window.status 静默早退）修复后 136 单测+8 E2E+build 全绿；lint 0 err/25 warn（新增 10 条 exhaustive-deps 建议级）" }
---
