# Gate 2 验证报告 — R12：会话主权仲裁（终结跨端 400 循环）

**模块**：session-arbitration（PageSpec §18 v2.6，D29-D31）
**验证时间**：2026-10-20

## 工程检查

| 检查 | 结果 |
|------|------|
| ESLint | PASS（0 error；4 warning 为既有 react-refresh 提示） |
| bun test | PASS（112/112，+3 仲裁单测：带异 id→409 session_taken；带本 id→正常且存储剥离；无 id→旧行为） |
| build | PASS（✓ built） |

## 根因（D0 记录，用户确认单设备 + 选定服务端仲裁）

会话表按 shareToken 一键一席，重开会话顶掉同 token 旧席——任何两个先后经过的上报者
（双击开启竞态 / 其他端自愈复活），输家的 PUT 打进赢家的会话，服务端报
「seq must be greater than N」≠「No active session」，R11 自愈分支不认 → 永不恢复
永不放弃 → 心跳每秒 400 无限循环（用户日志实证：手动重开后第一批 PUT 即 400）。

## 验收（对照 D29-D31）

| # | 项 | 结果 |
|---|-----|------|
| D29 主权比对 | PASS（单测三例全过；report() 先于校验比对 body.sessionId，不符→409 {code:'session_taken'}，无 id 保持旧行为兼容旧客户端；sendError 透传 code；存储仍剥离入站 sessionId） |
| D30 让位终态 | PASS（**战争→和平实证**：主机 A 开会话→curl 顶位重建→A 的下一笔心跳 409→A 让位：active=false、配对码芯片消失、**不自愈不复活**（3s/5s 复查）；让位不存比赛记录（最终干净让位后记录数未增加；仅存的 2 条零阶段记录均产自修复前幽灵阶段）；i18n takenByOther 三语） |
| D31 双击守卫 | PASS（startingRef 同步守卫关闭双 create 竞态窗口；handleStartSession try/finally 复位） |
| 附：幽灵补齐 | 实证中发现 reclaim 静默恢复路径漏带 sessionId（B 以无主权身份被接受为幽灵上报者）——sessionRef 全部 4 个构建点（start/recover/takeover/reclaim）已统一携带 |

## 过程记录

- IAB 双标签共享 localStorage：B 首次加载经 selfHostMemory 静默恢复接管**同一会话**
  （真机不同设备不会发生）；改用 curl 重建会话做确定性顶位，两轮战争场景均按设计收敛。
- 合成赢家（curl）不发心跳，30s 后自然过期——终态空态符合预期，不影响断言。

## 上线语义

- 任何"向别人的会话上报"在一笔心跳内被 409 终止，让位方提示「另一设备正在控制，
  已停止本机上报」；胜者无感知（其会话从未被触碰）。
- 单主机断网自愈（R11）完全保留：会话真死仍报 No active session → 自动重建。

**判定：PASS**（真机清单：复现原始 400 循环场景——网络切换后手动重开远程控制，
应或自动重连成功或明确让位提示，不再出现连续 400）
