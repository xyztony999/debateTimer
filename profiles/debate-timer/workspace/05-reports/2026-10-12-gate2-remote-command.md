# Gate 2 验证报告 — 代码→交付门控

**模块**：remote-command（遥控指令通道 C-02-07 + 计时健壮性加固）
**扫描路径**：server/lib/timerSessions.js、server/routes/configurations.js、src/services/TimerSessionService.js、src/timer/useDebateTimer.js、src/timer/engine.js、src/TimerControlPage.jsx、src/locales/*.json
**扫描时间**：2026-10-12

## 工程检查

| 检查 | 结果 |
|------|------|
| ESLint | PASS（0 error；4 warnings 为既有 react-refresh） |
| bun test | PASS（**97/97**，新增 10：服务端指令通道 4 + 引擎 catch-up 6） |
| bun run build | PASS |

## 服务端指令通道（API 契约 → curl 实证）

| # | 验收项 | 结果 |
|---|--------|------|
| 1 | POST session/command 鉴权与校验 | PASS（无会话 400 / 非法 type / side 缺失 / applyStage 越界 stageId / 队列上限 429，单测覆盖） |
| 2 | commandSeq 单调 + SSE `command` 事件下发 | PASS（curl SSE 抓包：seq 1/2 递增、载荷完整、事件顺序 state(重放)→command→command→state 正确） |
| 3 | 主机 report 清空指令缓冲 | PASS（单测：32 上限触发→report→可续） |
| 4 | 旧客户端兼容（不监听 command 的 EventSource 忽略新事件） | PASS（既有 display 流零改动） |

## 主机端指令消费（浏览器实证）

| # | 验收项 | 结果 |
|---|--------|------|
| 5 | command SSE → 引擎执行 | PASS（curl 发 `toggle single` → 主机按钮态翻转 + 时钟递减） |
| 6 | commandSeq 去重 + 与本地操作串行 | PASS（engine 单一 reducer 串行；去重逻辑代码审查 + 心跳并发下无异常） |
| 7 | 主机心跳健康 | PASS（探针实测 8 秒 5 次恰为 2s 间隔；会话持续 active） |

## 遥控端（浏览器实证）

| # | 验收项 | 结果 |
|---|--------|------|
| 8 | 发现弹层四选（取消/接管/跟随/遥控）+ 文案插值 | PASS |
| 9 | 遥控模式：胶囊「遥控中」、镜像回流（阶段/双钟与快照一致）、**按钮可操作**（区别于跟随只读）、时间线可用 | PASS |
| 10 | 遥控按钮 → POST 指令 → 主机执行（fire 包装链路） | PASS（与 #5 同链路；fire.toggle/reset/applyStage 全量接线） |
| 11 | 会话失活 → 遥控端退出遥控 + 「遥控失联，已回退本地计时」+ 引擎保留继续本地跑 | PASS（不 STOP_ALL 分支实测触发） |

## 计时健壮性（单测实证）

| # | 验收项 | 结果 |
|---|--------|------|
| 12 | TICK elapsedMs catch-up（60s 冻结追平/事件按序重放/越界到锁/限幅 300/亚秒 no-op/宽限跨冻结） | PASS（6 个新单测） |
| 13 | visibilitychange 重锚 | PASS（代码审查：>1500ms 补一拍；真机后台行为待复验） |
| 14 | idle TICK 引用不变（回归防护） | PASS（旧测试保留） |

## 过程记录

- 验收中段两次"心跳死/渲染崩"假象，最终定位为 **Vite HMR 半更新态污染**（多轮热替换后旧 hook state 与新代码错配；硬刷新即恢复）。已加入验收纪律：大改后标签必须硬刷新。
- 指令枚举实现中途从 `toggleAff/toggleNeg/...` 重构为正交 `start/stop/reset/toggle + side`（覆盖控制台分离按钮语义），API 文档/测试已同步。

## 总结

**判定：WARN-可交付**

- CRITICAL 违规：0
- WARN：1——真机复验待部署后（手机遥控 + 电脑主机的真机手感/灭屏追平/三端延迟，与既有真机清单合并）
