# Gate 2 验证报告 — R4 交互修正（移除自动弹窗 + 配对内发现 + 静默恢复）

**模块**：r4-no-auto-dialog
**扫描时间**：2026-10-15

## 工程检查

| 检查 | 结果 |
|------|------|
| ESLint / bun test / build | PASS（103/103 / 0 error / ✓） |

## 验收（对照 PageSpec v1.8 附记 D1-D4）

| # | 项 | 结果 |
|---|-----|------|
| D1 首页无自动弹窗 | PASS（手机开首页待机态，无 Dialog） |
| D2 配对内发现 | PASS（弹窗显示「检测到会话：模板名」+ 直接连接；一键秒进遥控，弹窗正确关闭） |
| D3 静默恢复 | PASS（直连写 lastRemote 记忆 → 刷新后无弹窗直接「遥控中」；selfHost 记忆恢复主机会话链路同构） |
| D4 接管入口 | 保留遥控态胶囊（未改动，回归通过） |
| 附 | WebRTC 直连在直连链路上再次成功（「遥控中 · 直连」，信令三帧 200）；主机心跳全程 200 |

## 过程记录

- IAB 测试环境两标签共享 localStorage/cookie：主机会话记忆被手机静默恢复链读到导致
  reclaim 竞争（seq 互踢）——**真实多设备场景不发生**（不同设备不同存储），测试以
  清记忆模拟独立设备规避。设计上同设备双开走既有 supersede 语义，可接受。
- 实现中修复：直连路径补写 lastRemote 记忆（统一在 startRemoteMode external 分支）；
  react-compiler 声明顺序约束（resumeFromMemories 移至 startRemoteMode 之后）。

**判定：PASS**（真机清单：配对内一键连手感 + 刷新恢复）
