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
---
