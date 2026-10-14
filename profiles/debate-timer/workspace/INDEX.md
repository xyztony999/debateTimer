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
---
